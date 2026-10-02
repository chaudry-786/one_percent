"""Turn an Apple Health export into the dashboard's data payload.

Used by the web app (app.py) when an export is uploaded.
"""

import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

XML_NAME = "apple_health_export/export.xml"
DEFAULT_SOURCE = "Sabah’s Apple Watch"

SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis"
# Other per-reading records kept for the heart / activity views.
HEALTH_TYPES = {
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": "hrv",
    "HKQuantityTypeIdentifierRestingHeartRate": "rhr",
    "HKQuantityTypeIdentifierRespiratoryRate": "resp",
    "HKQuantityTypeIdentifierAppleSleepingWristTemperature": "temp",
    "HKQuantityTypeIdentifierAppleExerciseTime": "exercise",
    "HKQuantityTypeIdentifierWalkingHeartRateAverage": "walkhr",
}
# Workout types grouped for display; anything else counts as "cardio".
WORKOUT_GROUPS = {
    "TraditionalStrengthTraining": "strength", "FunctionalStrengthTraining": "strength",
    "CoreTraining": "strength", "HighIntensityIntervalTraining": "strength",
    "Running": "running", "Walking": "walking", "Hiking": "walking",
}
STAGES = {
    "HKCategoryValueSleepAnalysisAsleepCore": "core",
    "HKCategoryValueSleepAnalysisAsleepDeep": "deep",
    "HKCategoryValueSleepAnalysisAsleepREM": "rem",
    "HKCategoryValueSleepAnalysisAsleepUnspecified": "unspecified",
    "HKCategoryValueSleepAnalysisAsleep": "unspecified",  # pre-iOS 16 exports
    "HKCategoryValueSleepAnalysisAwake": "awake",
    "HKCategoryValueSleepAnalysisInBed": "inbed",
}
ASLEEP = ["core", "deep", "rem", "unspecified"]
# Compact stage codes used in the embedded segment list (hypnogram).
STAGE_CODES = {"awake": 0, "rem": 1, "core": 2, "deep": 3, "unspecified": 4, "inbed": 5}
# Segments further apart than this belong to separate sleep sessions (e.g. a nap).
SESSION_GAP = timedelta(minutes=90)


def parse_local(ts: str) -> datetime:
    """'2024-06-23 23:10:00 +0100' -> naive local wall-clock time."""
    return datetime.strptime(ts[:19], "%Y-%m-%d %H:%M:%S")


def extract_all(zip_path):
    """One streaming pass over export.xml: sleep segments, heart/activity readings, workouts."""
    sleep, health, workouts = [], [], []
    with zipfile.ZipFile(zip_path) as z, z.open(XML_NAME) as f:
        root = None
        for event, el in ET.iterparse(f, events=("start", "end")):
            if root is None:
                root = el
            if event != "end":
                continue
            if el.tag == "Record":
                a = el.attrib
                typ = a.get("type")
                if typ == SLEEP_TYPE:
                    sleep.append((a.get("sourceName"), a.get("startDate"), a.get("endDate"), a.get("value")))
                elif typ in HEALTH_TYPES:
                    health.append((a.get("sourceName"), HEALTH_TYPES[typ], a.get("startDate"), a.get("endDate"), float(a.get("value"))))
            elif el.tag == "Workout":
                a = el.attrib
                kcal = hr = None
                for st in el.iter("WorkoutStatistics"):
                    if st.get("type") == "HKQuantityTypeIdentifierActiveEnergyBurned":
                        kcal = float(st.get("sum") or 0)
                    elif st.get("type") == "HKQuantityTypeIdentifierHeartRate":
                        hr = float(st.get("average") or 0) or None
                workouts.append((a.get("sourceName"), a.get("workoutActivityType", "").replace("HKWorkoutActivityType", ""),
                                 a.get("startDate"), a.get("endDate"), float(a.get("duration") or 0), kcal, hr))
            if el.tag in ("Record", "Workout", "ActivitySummary", "Correlation"):
                root.clear()  # drop finished top-level elements so memory stays flat

    def frame(rows, cols):
        df = pd.DataFrame(rows, columns=cols)
        df["start"] = df["start"].map(parse_local)
        df["end"] = df["end"].map(parse_local)
        return df

    seg = frame(sleep, ["source", "start", "end", "value"])
    seg["stage"] = seg["value"].map(STAGES).fillna("other")
    return (
        seg.drop(columns="value"),
        frame(health, ["source", "type", "start", "end", "value"]),
        frame(workouts, ["source", "type", "start", "end", "duration", "kcal", "avg_hr"]),
    )


def normalise_source(name: str) -> str:
    # Apple writes some device names with a non-breaking space ("Apple\xa0Watch").
    return name.replace("\xa0", " ").strip()


def build_nights(seg: pd.DataFrame):
    """Group segments into sessions and nights; return (nights, segments-per-night, main-session windows)."""
    seg = (
        seg[seg["stage"].isin(STAGE_CODES)]
        .drop_duplicates(["start", "end", "stage"])
        .sort_values(["start", "end"])
        .reset_index(drop=True)
    )
    seg["minutes"] = (seg["end"] - seg["start"]).dt.total_seconds() / 60

    # Sessions: a new session starts when a segment begins long after everything before it ended.
    prev_end = seg["end"].cummax().shift()
    seg["session"] = (seg["start"] - prev_end > SESSION_GAP).cumsum()
    # A night is labelled by the evening it started on: anything before noon belongs to the day before.
    session_start = seg.groupby("session")["start"].transform("min")
    seg["night"] = (session_start - timedelta(hours=12)).dt.date

    nights, segments, windows = [], {}, {}
    for night, g in seg.groupby("night"):
        mins = g.groupby("stage")["minutes"].sum()
        asleep = sum(mins.get(s, 0.0) for s in ASLEEP)
        if asleep < 60:  # ignore stray short naps / watch-off fragments
            continue

        # Bedtime, wake time and time in bed come from the night's main (longest) session.
        sessions = g[g["stage"].isin(ASLEEP + ["awake"])].groupby("session")
        main = max(sessions.groups, key=lambda s: sessions.get_group(s)["minutes"].sum())
        m = sessions.get_group(main)
        noon = datetime.combine(night, datetime.min.time()) + timedelta(hours=12)
        bed = (m["start"].min() - noon).total_seconds() / 60
        wake = (m["end"].max() - noon).total_seconds() / 60

        key = night.isoformat()
        windows[key] = (m["start"].min(), m["end"].max())
        nights.append(
            {
                "d": key,
                "core": round(mins.get("core", 0.0), 1),
                "deep": round(mins.get("deep", 0.0), 1),
                "rem": round(mins.get("rem", 0.0), 1),
                "unspecified": round(mins.get("unspecified", 0.0), 1),
                "awake": round(mins.get("awake", 0.0), 1),
                "awakeN": int((g["stage"] == "awake").sum()),
                "bed": round(bed, 1),  # minutes after 12:00 on the night's date
                "wake": round(wake, 1),
            }
        )
        # [start offset from noon, duration, stage code] per segment, in minutes.
        segments[key] = [
            [round((r.start - noon).total_seconds() / 60, 1), round(r.minutes, 1), STAGE_CODES[r.stage]]
            for r in g.itertuples()
            if r.stage != "inbed"
        ]
    return nights, segments, windows


def add_health(nights, windows, health: pd.DataFrame):
    """Attach overnight HRV / respiratory rate, next-morning resting HR, wrist temperature and exercise minutes."""
    by = {k: g.sort_values("start") for k, g in health.groupby("type")}

    def overnight_mean(kind, start, end):
        g = by.get(kind)
        if g is None:
            return None
        t = g["start"].values
        i, j = np.searchsorted(t, np.datetime64(start)), np.searchsorted(t, np.datetime64(end))
        return round(float(g["value"].values[i:j].mean()), 1) if j > i else None

    def daily(kind, how):
        g = by.get(kind)
        if g is None:
            return {}
        return g.groupby(g["start"].dt.date)["value"].agg(how).to_dict()

    rhr = daily("rhr", "last")         # resting HR is reported per day; the morning after a night is the one it reflects
    exercise = daily("exercise", "sum")  # Apple exercise minutes, whole day
    temp = {}
    if "temp" in by:  # one reading per night, spanning it; shown as a deviation from a rolling 60-night baseline
        g = by["temp"].copy()
        g["night"] = (g["start"] - timedelta(hours=12)).dt.date
        g = g.groupby("night")["value"].mean()
        dev = g - g.rolling(60, min_periods=10).median()
        temp = dev.dropna().round(2).to_dict()

    for n in nights:
        d = datetime.fromisoformat(n["d"]).date()
        start, end = windows[n["d"]]
        n["hrv"] = overnight_mean("hrv", start, end)
        n["resp"] = overnight_mean("resp", start, end)
        v = rhr.get(d + timedelta(days=1))
        n["rhr"] = round(float(v), 1) if v is not None else None
        n["tempDev"] = temp.get(d)
        n["exMin"] = round(float(exercise.get(d, 0.0)), 1)


def daily_health(health: pd.DataFrame):
    """Per calendar day: HRV averaged over every reading that day (not just overnight), resting HR, walking HR."""
    if health.empty:
        return []
    h = health.assign(day=health["start"].dt.date)
    pick = lambda kind, how: h[h["type"] == kind].groupby("day")["value"].agg(how)
    df = pd.DataFrame({"hrv": pick("hrv", "mean"), "rhr": pick("rhr", "last"), "walkHr": pick("walkhr", "mean")})
    df = df.dropna(how="all").sort_index()
    return [
        {"d": d.isoformat(), **{k: (round(float(v), 1) if pd.notna(v) else None) for k, v in row.items()}}
        for d, row in df.iterrows()
    ]


def workout_rows(workouts: pd.DataFrame):
    """[date, start minute of day, duration min, type, group, kcal, avg HR] per workout."""
    out = []
    for w in workouts.sort_values("start").itertuples():
        out.append([
            w.start.date().isoformat(), w.start.hour * 60 + w.start.minute, round(w.duration, 1),
            w.type, WORKOUT_GROUPS.get(w.type, "cardio"),
            round(w.kcal) if pd.notna(w.kcal) else None, round(w.avg_hr) if pd.notna(w.avg_hr) else None,
        ])
    return out


def build_payload(tables, source=DEFAULT_SOURCE, events=None):
    """Dashboard data for one source from the (sleep, health, workouts) tables of extract_all()."""
    mine = lambda df: df[df["source"].map(normalise_source) == normalise_source(source)]
    seg, health, workouts = (mine(t) for t in tables)
    if seg.empty:
        raise ValueError(f"No sleep records from source {source!r}.")
    nights, segments, windows = build_nights(seg)
    add_health(nights, windows, health)
    return {
        "source": source,
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "nights": nights,
        "segments": segments,
        "workouts": workout_rows(workouts),
        "daily": daily_health(health),
        "events": events or [],
    }
