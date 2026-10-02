"""Build the sleep, exercise and heart dashboard locally from an Apple Health export.

Usage:
    venv/bin/python build_dashboard.py                   # build sleep_dashboard.html
    venv/bin/python build_dashboard.py --list-sources    # show which devices logged sleep
    venv/bin/python build_dashboard.py --source "My Watch" --refresh

Records are streamed out of export.zip (no full XML load) and cached in *.parquet files next to
this script; the cache is reused until export.zip changes. The web app (app.py) uses the same code.
"""

import argparse
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

import pandas as pd

from sleepdata import DEFAULT_SOURCE, build_payload, extract_all, render_html

HERE = Path(__file__).resolve().parent
ZIP_PATH = HERE / "export.zip"
CACHES = (HERE / "sleep_segments.parquet", HERE / "health_records.parquet", HERE / "workouts.parquet")
TEMPLATE_PATH = HERE / "dashboard_template.html"
OUTPUT_PATH = HERE / "sleep_dashboard.html"
EVENTS_PATH = HERE / "annotations.json"  # [{"date": "YYYY-MM-DD", "label": "..."}]


def load_all(refresh: bool):
    zip_mtime = os.path.getmtime(ZIP_PATH)
    if not refresh and all(c.exists() and os.path.getmtime(c) >= zip_mtime for c in CACHES):
        print("Using cached records")
        return tuple(pd.read_parquet(c) for c in CACHES)
    print(f"Extracting records from {ZIP_PATH.name} (this takes a minute)…")
    t0 = time.time()
    tables = extract_all(ZIP_PATH)
    for df, c in zip(tables, CACHES):
        df.to_parquet(c, index=False)
    print(f"  {len(tables[0]):,} sleep records, {len(tables[1]):,} heart/activity readings, "
          f"{len(tables[2]):,} workouts in {time.time() - t0:.0f}s")
    return tables


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default=DEFAULT_SOURCE, help="sourceName to use (default: %(default)s)")
    ap.add_argument("--list-sources", action="store_true", help="list sleep data sources and exit")
    ap.add_argument("--refresh", action="store_true", help="re-extract even if the cache is current")
    args = ap.parse_args()

    tables = load_all(args.refresh)
    if args.list_sources:
        for name, n in Counter(tables[0]["source"]).most_common():
            print(f"{n:>8,}  {name}")
        return

    events = json.loads(EVENTS_PATH.read_text(encoding="utf-8")) if EVENTS_PATH.exists() else []
    try:
        payload = build_payload(tables, args.source, events)
    except ValueError as e:
        sys.exit(f"{e} Try --list-sources.")
    OUTPUT_PATH.write_text(render_html(TEMPLATE_PATH.read_text(encoding="utf-8"), payload), encoding="utf-8")
    nights = payload["nights"]
    print(
        f"{len(nights)} nights, {len(payload['workouts'])} workouts ({nights[0]['d']} → {nights[-1]['d']}) "
        f"→ {OUTPUT_PATH.name} ({OUTPUT_PATH.stat().st_size / 1e6:.1f} MB)"
    )


if __name__ == "__main__":
    main()
