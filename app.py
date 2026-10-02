"""One Percent: habits and health tracker. upload an Apple Health export from your phone and view the dashboard.

Storage is a GCS bucket (GCS_BUCKET_NAME) on Cloud Run, or a local folder (LOCAL_STORE_DIR,
default ./.store) during development:
    uploads/export-<timestamp>.zip   raw exports (the bucket deletes them after 30 days)
    data/latest.json                 processed dashboard payload
    data/meta.json                   when and what was last processed
    data/events.json                 events shown on the charts, e.g. "New mattress"

Run locally:  venv/bin/flask --app app run --debug
"""

import json
import logging
from collections import defaultdict
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Flask, abort, render_template, request

from passauth import init_auth
from sleepdata import DEFAULT_SOURCE, build_payload, extract_all

HERE = Path(__file__).resolve().parent
SOURCE = os.environ.get("HEALTH_SOURCE", DEFAULT_SOURCE)
# Cloud Run runs in UTC; show times as you'd read them at home
TZ = ZoneInfo(os.environ.get("APP_TIMEZONE", "Europe/London"))
# Accent Coach saves its practice history in its own bucket; we only read it (see infra apps.tf).
ACCENT_BUCKET = os.environ.get("ACCENT_BUCKET")
ACCENT_PROGRESS_FILE = os.environ.get("ACCENT_PROGRESS_FILE")  # local development: a copy of progress.json
ACCENT_URL = os.environ.get("ACCENT_URL", "")
# what counts as "done" for each habit; editable on the Habits tab (stored in data/settings.json)
DEFAULT_HABITS = {"wakeBy": "07:15", "gymDays": 4, "accentMin": 15}
UPLOAD_RE = re.compile(r"^uploads/export-\d{8}-\d{6}\.zip$")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=[logging.StreamHandler(sys.stdout)])
log = logging.getLogger("one-percent")


class GcsStore:
    def __init__(self, bucket_name):
        from google.cloud import storage

        self.bucket = storage.Client().bucket(bucket_name)

    def read(self, name):
        blob = self.bucket.blob(name)
        return blob.download_as_bytes() if blob.exists() else None

    def write(self, name, data: bytes, content_type="application/json"):
        self.bucket.blob(name).upload_from_string(data, content_type=content_type)

    def download_to(self, name, path):
        self.bucket.blob(name).download_to_filename(path)

    def upload_url(self, name):
        # Cloud Run credentials have no private key, so sign through the IAM API as the service account.
        import google.auth
        from google.auth.transport.requests import Request

        creds, _ = google.auth.default()
        creds.refresh(Request())
        return self.bucket.blob(name).generate_signed_url(
            version="v4", expiration=timedelta(minutes=15), method="PUT", content_type="application/zip",
            service_account_email=creds.service_account_email, access_token=creds.token,
        )


class LocalStore:
    """Development stand-in for the bucket; uploads go through the app's own /dev-upload route."""

    def __init__(self, root):
        self.root = Path(root)

    def _path(self, name):
        p = (self.root / name).resolve()
        if self.root.resolve() not in p.parents:
            abort(400)
        return p

    def read(self, name):
        p = self._path(name)
        return p.read_bytes() if p.exists() else None

    def write(self, name, data: bytes, content_type=None):
        p = self._path(name)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def download_to(self, name, path):
        Path(path).write_bytes(self._path(name).read_bytes())

    def upload_url(self, name):
        return f"/dev-upload/{name}"


store = GcsStore(os.environ["GCS_BUCKET_NAME"]) if os.environ.get("GCS_BUCKET_NAME") else LocalStore(os.environ.get("LOCAL_STORE_DIR", HERE / ".store"))
app = Flask(__name__, static_folder="static")
init_auth(app, title="One Percent")


def read_json(name, default=None):
    raw = store.read(name)
    return json.loads(raw) if raw else default


def write_json(name, obj):
    store.write(name, json.dumps(obj, separators=(",", ":")).encode())


def load_events():
    events = read_json("data/events.json")
    if events is None:  # first run: seed from the repo's annotations.json
        seed = HERE / "annotations.json"
        events = json.loads(seed.read_text(encoding="utf-8")) if seed.exists() else []
    return events


def accent_session_seconds(sentence_id):
    """Same estimate as Accent Coach's Analytics page: listen, practise, shadow and loop a clip of this length."""
    _, start, end = sentence_id.split("|")
    dur = max(0.1, float(end) - float(start))
    practice = 5 * (dur + (dur + 1) + (dur + 1))
    return 10 * dur + practice + 10 * (dur + (dur + 1)) + 30 * dur + practice


ACCENT_DAY_START = timedelta(hours=7)  # a practice day runs 07:00–07:00, so late-night practice counts for that evening


def practice_day(dt):
    return (dt - ACCENT_DAY_START).date()


def speech_practices():
    """Practices from Accent Coach's progress.json, oldest first, as [time ms, estimated seconds, sentence index, practice day, hour].

    A practice day runs 07:00–07:00 Europe/London; the hour is local. None when there's no progress file.
    """
    raw = None
    try:
        if ACCENT_BUCKET:
            from google.cloud import storage

            blob = storage.Client().bucket(ACCENT_BUCKET).blob("progress.json")
            raw = blob.download_as_bytes() if blob.exists() else None
        elif ACCENT_PROGRESS_FILE and os.path.exists(ACCENT_PROGRESS_FILE):
            raw = Path(ACCENT_PROGRESS_FILE).read_bytes()
    except Exception:
        log.exception("couldn't read accent progress")
    if not raw:
        return None
    rows = []
    for i, (sid, stamps) in enumerate((json.loads(raw).get("history") or {}).items()):
        try:
            secs = round(accent_session_seconds(sid), 1)
        except (ValueError, TypeError):
            continue
        for ts in stamps:
            local = datetime.fromtimestamp(ts / 1000, TZ)
            rows.append([int(ts), secs, i, practice_day(local).isoformat(), local.hour])
    return sorted(rows)


def daily_minutes(practices):
    """Estimated practice minutes per practice day, for the habit."""
    minutes = defaultdict(float)
    for _, secs, _, day, _ in practices:
        minutes[day] += secs / 60
    return {d: round(m, 1) for d, m in sorted(minutes.items())}


def load_habits():
    saved = read_json("data/settings.json", {}).get("habits", {})
    return {k: saved.get(k, v) for k, v in DEFAULT_HABITS.items()}  # ignores targets of removed habits


@app.get("/")
def index():
    payload = read_json("data/latest.json")
    if not payload:
        return render_template("empty.html")
    payload["events"] = []  # events come from data/events.json so edits don't need re-processing
    speech = speech_practices()
    config = {
        "webapp": True, "events": load_events(), "meta": read_json("data/meta.json", {}),
        "habits": load_habits(), "accent": daily_minutes(speech) if speech is not None else None, "speech": speech, "accentUrl": ACCENT_URL,
        "today": datetime.now(TZ).date().isoformat(), "accentToday": practice_day(datetime.now(TZ)).isoformat(),
    }
    return render_template("index.html", data=payload, config=config)


@app.post("/api/upload-url")
def upload_url():
    name = datetime.now(TZ).strftime("uploads/export-%Y%m%d-%H%M%S.zip")
    return {"object": name, "url": store.upload_url(name)}


@app.put("/dev-upload/<path:name>")
def dev_upload(name):
    if not isinstance(store, LocalStore) or not UPLOAD_RE.match(name):
        abort(404)
    store.write(name, request.get_data())
    return "", 200


@app.post("/api/process")
def process():
    name = (request.get_json(silent=True) or {}).get("object", "")
    if not UPLOAD_RE.match(name):
        return {"error": "unknown upload"}, 400
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "export.zip")
        try:
            store.download_to(name, path)
            tables = extract_all(path)
            payload = build_payload(tables, SOURCE)
        except Exception as e:  # bad zip, not a Health export, wrong source...
            log.exception("processing %s failed", name)
            return {"error": f"Couldn't read that export: {e}"}, 422
    write_json("data/latest.json", payload)
    nights = payload["nights"]
    meta = {
        "processedAt": datetime.now(TZ).strftime("%Y-%m-%d %H:%M"), "object": name,
        "nights": len(nights), "workouts": len(payload["workouts"]),
        "from": nights[0]["d"], "to": nights[-1]["d"], "seconds": round(time.time() - t0, 1),
    }
    write_json("data/meta.json", meta)
    log.info("processed %s: %s", name, meta)
    return meta


@app.get("/api/status")
def status():
    return read_json("data/meta.json", {})


@app.route("/api/events", methods=["GET", "POST"])
def events():
    if request.method == "GET":
        return {"events": load_events()}
    body = request.get_json(silent=True) or {}
    items = body.get("events")
    if not isinstance(items, list) or len(items) > 200:
        return {"error": "events must be a list (max 200)"}, 400
    clean = []
    for e in items:
        date, label = str(e.get("date", "")), str(e.get("label", "")).strip()[:60]
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) and label:
            clean.append({"date": date, "label": label})
    write_json("data/events.json", clean)
    return {"events": clean}


@app.route("/api/settings", methods=["GET", "POST"])
def settings():
    if request.method == "GET":
        return {"habits": load_habits()}
    given = (request.get_json(silent=True) or {}).get("habits") or {}
    habits = load_habits()
    if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(given.get("wakeBy", ""))):
        habits["wakeBy"] = given["wakeBy"]
    for key, lo, hi in (("gymDays", 1, 7), ("accentMin", 1, 240)):
        try:
            if key in given:
                habits[key] = max(lo, min(hi, int(given[key])))
        except (TypeError, ValueError):
            pass
    write_json("data/settings.json", {"habits": habits})
    return {"habits": habits}
