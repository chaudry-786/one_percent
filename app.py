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
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Flask, abort, request

from passauth import init_auth
from sleepdata import DEFAULT_SOURCE, build_payload, extract_all, render_html

HERE = Path(__file__).resolve().parent
TEMPLATE = (HERE / "dashboard_template.html").read_text(encoding="utf-8")
EMPTY_PAGE = (HERE / "templates" / "empty.html").read_text(encoding="utf-8")
SOURCE = os.environ.get("HEALTH_SOURCE", DEFAULT_SOURCE)
# Cloud Run runs in UTC; show times as you'd read them at home
TZ = ZoneInfo(os.environ.get("APP_TIMEZONE", "Europe/London"))
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


@app.get("/")
def index():
    payload = read_json("data/latest.json")
    if not payload:
        return EMPTY_PAGE
    payload["events"] = []  # events come from data/events.json so edits don't need re-processing
    config = {"webapp": True, "events": load_events(), "meta": read_json("data/meta.json", {})}
    return render_html(TEMPLATE, payload, config)


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
