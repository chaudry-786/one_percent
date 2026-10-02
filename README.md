# One Percent

Habits and health tracker, inspired by *Atomic Habits*: build systems, get 1% better, and watch the results compound. It shows how your habits are performing and how your sleep, exercise and heart are trending, built from your Apple Health export. Skincare and more are planned.

## Web app

The dashboard runs on Cloud Run as the `one-percent` service. Its GCP setup lives in the `chaudry-786/infra` repo (`~/Desktop/hosted/infra`).

**Using it from your phone:**
1. In Health: tap your picture → **Export All Health Data** → **Save to Files**.
2. Open the app URL, sign in with the passphrase (each device stays signed in for 90 days), and tap **⇪ Upload export**.
3. Choose `export.zip`. It uploads straight to the private bucket, gets processed in about a minute, and the page reloads with the new data.

**How it works:**
- `app.py` serves the dashboard with the latest processed data, signs the upload URL and processes the export.
- `sleepdata.py` is the shared processing code, also used by the local build below.
- Uploads are kept 30 days. Events (Options → Events) are saved on the server, so the phone and laptop see the same ones.

**Run it locally:**
```
venv/bin/pip install -r requirements.txt
venv/bin/flask --app app run --debug        # http://127.0.0.1:5000, files stored in .store/, no login
```
Set `APP_PASSPHRASE` and `COOKIE_KEY` to test the login.

**Deploy:** push to `main` or run the **Deploy to Cloud Run** workflow. It needs the repository variables `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` and `GCP_DEPLOYER_SA` from the infra repo's `terraform output`.

## Local file (no server)

```
xdg-open sleep_dashboard.html
```

Or double-click `sleep_dashboard.html`. There's no server; it's a single file. It needs an internet connection to load the charting library (ECharts, from cdnjs).

### Rebuild with new data

1. On your iPhone: **Health → profile picture → Export All Health Data**. This produces `export.zip`.
2. Copy it over the existing `export.zip` in this folder.
3. Run:
   ```
   venv/bin/python build_dashboard.py
   ```
4. Refresh the page.

If it prints "Using cached records" after you've added a new export, the copied zip kept an old timestamp. Force a re-read with `--refresh`.

#### Options

| Flag | What it does |
|---|---|
| `--list-sources` | List devices/apps that recorded sleep, with record counts |
| `--source "NAME"` | Use a different source (default: `Sabah’s Apple Watch`) |
| `--refresh` | Re-extract from `export.zip` even if the cache looks current |

## What's on the page

To stay readable, charts summarise long ranges. Over about 4 months, nightly dots become moving-average or weekly lines, and pick 30d or 90d to see individual nights. Monthly charts replace weekly ones where bars would get crowded.

The page has four tabs. The date range, Options (which nights, events) and the "Since <event>" card apply to all of them.

### Habits

- **Headline:** your strongest habit for the outcome you pick (Total sleep, Deep, REM, HRV or Resting HR).
- **Four habit cards**, ranked by effect, each comparing your nights with vs without the habit:
  - in bed by 23:00 (change the target via the Sleep tab: pick Bedtime, then Options → Goal)
  - workout days vs rest days
  - morning (before 12:00) vs evening (17:00+) workouts
  - 30+ Apple exercise minutes

  Cards need 8+ nights on each side; "small sample" means under 20.
- **Habit tracker:** the last 4 weeks of the range for "in bed by 23:00", workout days and 7h+ asleep, with streaks.

### Sleep

Everything under "Sleep tab" below. The metric picker also has HRV, Resting HR, Respiratory rate, Wrist temp, Exercise minutes and Workout time.

### Exercise

- **Summary tiles:** workouts per week, training time per week, when you usually train (morning, afternoon or evening, with a typical start time), and active days. Each is compared with the previous period.
- **Workout days:** a calendar where each square is a day, coloured by how long you trained. Hover to see that day's workouts and start times. On a phone it shows the latest weeks that fit.
- **Training per week:** hours by type, with your weekly average as a dashed line. Long ranges show each month's average week.
- **What time you train:** workouts by start hour.
- **Does training time affect your sleep?** Nights after a rest day vs a morning, afternoon or evening workout, for the outcome you pick.
- **Count walks** includes walks as workouts (off by default).

Workouts count towards a night when they started that day before bedtime. When there are several, the longest one decides the time of day.

### Heart

- **Overnight HRV** with your normal range (middle half of nights). "What raises my HRV?" opens Habits measured by HRV.
- **Resting heart rate**, the morning after each night.

### Sleep tab

- **Top bar:**
  - **Metric button:** opens a picker. Tick one or more sleep stages (Total, Deep, Core, REM, Unspecified, Awake) and choose hours / minutes / % of sleep, or pick a schedule metric (Time in bed, Efficiency, Wake-ups, Bedtime, Wake time, Midpoint).
  - **Date range** presets and **Nightly / Weekly / Monthly**.
- **Options:** custom dates, moving-average lines, which nights (weeknights, weekends, specific days), and goal. Active filters show as tags in the top bar; click × to clear one.
- **Since <event> card:** hidden until you click an event (its label on a chart, its dot on the calendar, or its tag in Options → Events). It shows each key number averaged over the nights since the event, with its % change vs the same number of days before (up to 90).
- **Records** (gold): for the metric and grouping you're viewing, your best week, month or night of this year, with its value and date. A **New** badge appears when it's the most recent period, along with the previous best it beat. Records use all your data, not just the selected range. A week needs 3+ nights and a month 10+ to count. On the trend chart, a gold marker shows each year's best.
- **Summary tiles:** average, median, best/worst night, goal hit rate, and change vs the previous equal period. When several metrics are picked, tabs switch between them.
- **Trend:** zooming with the slider narrows every other panel. There's a table view.
  - **High and Low:** the highest and lowest points on the chart are marked with a small hollow ring and a muted label. In the Nightly view without dots, they mark the high and low of the moving average. If one of them is also a gold record, its label reads e.g. "High · Best of 2026".
  - **Click a week or month** to see how common it was. The chart shades its value bucket (e.g. 50–60 min), highlights every other week in that bucket and fades the rest. A line above the chart says how many weeks in the range fell there (rare under 10%, uncommon under 25%, common under 50%, otherwise very common) and when it last happened. The bucket size is worked out from the spread of your values. **See its nights** drills into that week; click the point again or **Clear** to deselect.
- **Nights by range:** "Edit ranges" lets you set your own edges, e.g. `30, 60, 90` or `23:30, 01:00`. This chart and Stage mix are always monthly.
- **More charts** (collapsed): calendar heatmap and day-of-week averages.
- **Night detail:** stage timeline for one night. Click a dot or calendar cell to open it; step with ← →.
- **Copy view link:** the current view is stored in the URL, so links and bookmarks reopen it exactly.

## Events

Events (e.g. a new mattress) appear as labelled lines on the charts, a dot on the calendar, and drive the "Since …" comparison card.

- **Web app:** add and remove events under **Options → Events**. They're saved on the server (`data/events.json` in the bucket). The first time, they're seeded from `annotations.json`.
- **Local file:** permanent events live in `annotations.json`; rebuild after editing it:
  ```json
  [{"date": "2026-09-10", "label": "New mattress"}]
  ```
  Events added under **Options → Events** in the local file are saved in your browser only.

## How the numbers are calculated

- A **night** is labelled by the evening it starts on: anything before noon belongs to the previous date.
- Records more than 90 minutes apart are separate sessions. Bedtime, wake time and time in bed come from the night's longest session.
- Nights with under an hour asleep (stray naps, watch-off fragments) are dropped.
- **Total asleep** = Core + Deep + REM + Unspecified. **Efficiency** = asleep ÷ time in bed.
- "% change" is relative to the earlier average (e.g. 39 → 47 min deep = +23%). Bedtime and wake time show minutes earlier/later instead.
- **HRV** and **respiratory rate** are averaged over readings taken during the night's main sleep session.
- Nightly moving averages cover the last N calendar days. Weekly and monthly ones cover the last N periods.

## Files

| File | |
|---|---|
| `app.py` | Web app (Flask): login, upload, processing, dashboard |
| `sleepdata.py` | Processing shared by the web app and the local build |
| `passauth.py` | Passphrase login (the same file is used in accent_coach) |
| `static/upload.js`, `templates/empty.html` | Upload sheet; page shown before the first upload |
| `Dockerfile`, `requirements.txt`, `.github/workflows/deploy.yml` | Container and deploy |
| `build_dashboard.py` | Local build: extracts records from `export.zip` and writes `sleep_dashboard.html` |
| `dashboard_template.html` | Page source (HTML/CSS/JS), used by both |
| `sleep_dashboard.html` | Generated dashboard, with your data embedded |
| `annotations.json` | Events shown on the charts |
| `sleep_segments.parquet`, `health_records.parquet`, `workouts.parquet` | Caches of extracted records |
| `sleep_analysis.ipynb` | The original notebook (no longer needed) |

`export.zip`, the parquet caches, `sleep_dashboard.html` and the notebook contain your health data. They're gitignored and never leave this machine except through the app's upload.
