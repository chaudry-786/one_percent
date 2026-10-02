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
- `sleepdata.py` turns the export into nights, workouts and daily heart data.
- Uploads are kept 30 days. Events (Options → Events) are saved on the server, so the phone and laptop see the same ones.

**Run it locally:**
```
python3 -m venv venv && venv/bin/pip install -r requirements.txt
./dev.sh        # http://127.0.0.1:5000, files stored in .store/, no login
```
`dev.sh` downloads the Tailwind CLI into `.tools/` the first time, rebuilds `static/dist/app.css` whenever a template or script changes, and runs Flask. Set `APP_PASSPHRASE` and `COOKIE_KEY` to test the login, and `ACCENT_PROGRESS_FILE` to a copy of Accent Coach's `progress.json` to see the accent habit.

**Deploy:** push to `main` or run the **Deploy to Cloud Run** workflow. It needs the repository variables `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` and `GCP_DEPLOYER_SA` from the infra repo's `terraform output`. The Docker build compiles the CSS, so `static/dist/` isn't committed.

## How the page is built

- **Tailwind CSS** for styling (utility classes in the templates; a few shared components such as `.card` and `.btn` in `static/src/app.css`).
- **Alpine.js** for state and interactivity (`static/js/app.js`): tabs, controls, sheets.
- **ECharts** for charts and **Day.js** for dates, both from a CDN.
- The server embeds the data as JSON in the page; there's nothing to fetch after load. The open tab is in the URL (`#sleep`, `#exercise`, `#heart`), so refreshing stays on it; everything else resets on refresh, and the light/dark choice is remembered.

## What's on the page

Every tab starts with **At a glance** cards: a big number, a plain-language "how it's going", and a small chart with its scale, dates and a labelled dashed line for your usual (or target). Sleep and Heart use a line (a dot per night or day; Heart adds the 7-day average line the big number shows); Exercise uses bars, one per week, with the current week marked "so far". Tap the chart to see any night, day or week; tap again to go back. A gold badge marks your best week of the year.

### Habits

Four habits, each judged against a fixed target. There are no comparisons, just how you're doing:

| Habit | Done when | Counted on |
|---|---|---|
| Wake up early | up by 07:15 | the morning you wake |
| Sleep well | 45 min+ deep **and** 7 h+ asleep | the morning you wake |
| Train | any workout except walks, **4 days a week** | each week (Mon–Sun) |
| Accent practice | 15+ min of practice, read from Accent Coach's saved history | each day |

Each card shows:
- **The current streak**, using *Atomic Habits*' "never miss twice" rule: one missed day (or week) is forgiven, two in a row end the streak.
- **Your best streak** and **today's status** (with a "Practise now" link for accent).
- **A 5-week chain:** coloured means done, grey means not done, dashed means no data.
- **Your total "votes"** (every day the habit was done) for the person you're becoming.

A different *Atomic Habits* quote appears each day. Change the targets with **Targets**; they're saved on the server, so every device uses them.

Accent minutes use the same estimate as Accent Coach's Analytics page, based on each practised clip's length. On Cloud Run, the app reads `progress.json` from Accent Coach's bucket (read-only).

### Sleep

- **At a glance:** deep sleep, wake-up time (with how many of the last 7 mornings hit your target) and wake-ups, each vs your usual (the 4 weeks before). Earlier wake-ups count as better.
- **Explore:** pick a metric, date range and Nightly / Weekly / Monthly. **Options** has custom dates, which nights (weeknights, weekends, specific days) and events.
  - **Trend:** a gold marker shows each year's best week/month (from all your data); a subtle hollow ring marks the high and low in view. **Tap a week or month** to see how common a value like it is in the range and when it last happened.
  - **Nights by range:** the share of nights in each range for the picked metric, per month (per week for ranges of 90 days or less). Grey is the worse end and full colour the better end. Tapping a week on the trend chart uses the same ranges. The ranges are fixed:

    | Metric | Ranges |
    |---|---|
    | Deep sleep | under 30 · 30–45 · 45–60 · 60–75 · 75m+ |
    | Total sleep | under 5h · 5–6h · 6–7h · 7–8h · 8h+ |
    | REM | under 60 · 60–90 · 90–120 · 120m+ |
    | Core | under 3h · 3–4h · 4–5h · 5h+ |
    | Wake-ups | 0–4 · 5–9 · 10–14 · 15+ |
    | Time awake | under 10 · 10–20 · 20–40 · 40m+ |
    | Efficiency | under 85 · 85–90 · 90–95 · 95%+ |
    | Bedtime | before 23:00 · 23–00 · 00–01 · 01–02 · after 02:00 |
    | Wake time | before 07:15 · 07:15–08:00 · 08–09 · after 09:00 |

    To change them, edit `RANGES` in `static/js/sleep.js`.
  - **Night detail:** stage timeline for one night. Tap a dot or a calendar cell, or step with ‹ ›.
  - **Stage mix:** each stage's share of sleep, per month.
  - **More:** calendar heatmap and averages by night of the week.

### Exercise

Walks don't count unless **Count walks** is on.

- **At a glance:**
  - **Training time** this week vs your usual week.
  - **Consistency:** how many of the last 12 weeks hit your training-days target, and your streak.
  - **Morning sessions:** workouts started before noon in the last 4 weeks.
- **Workout days:** calendar coloured by how long you trained (tap for the workouts and start times). On a phone it shows the latest weeks that fit.
- **Training per week:** hours by type, with your average as a dashed line. Long ranges show each month's average week.
- **What time you train:** workouts by start hour, mornings in amber.

### Heart

- **At a glance:** 7-day averages of HRV, resting heart rate and walking heart rate, vs your usual.
- **HRV:** the average of all readings each day (not just overnight), with your normal range (middle half of days) shaded.
- **Resting heart rate** and **walking heart rate** (average while walking; it drops as fitness improves).

## Events

Events (e.g. a new mattress) appear as labelled lines on the charts. Tap one, or tap it under **Options → Events**, for a **Since <event>** card: each key number averaged over the nights since, with its % change vs the same number of days before (up to 90). Events are saved on the server (`data/events.json` in the bucket); the first time, they're seeded from `annotations.json`.

## How the numbers are calculated

- A **night** is labelled by the evening it starts on: anything before noon belongs to the previous date.
- Records more than 90 minutes apart are separate sessions. Bedtime, wake time and time in bed come from the night's longest session.
- Nights with under an hour asleep (stray naps, watch-off fragments) are dropped.
- **Total asleep** = Core + Deep + REM + Unspecified. **Efficiency** = asleep ÷ time in bed.
- **HRV** (Heart tab) is averaged over every reading that day; the before/after event card uses the overnight average.
- "Your usual" is the average of the 4 weeks before the latest 7 days.

## Files

| File | |
|---|---|
| `app.py` | Web app (Flask): login, upload, processing, dashboard |
| `sleepdata.py` | Turns `export.zip` into the dashboard data |
| `passauth.py` | Passphrase login (the same file is used in accent_coach) |
| `templates/` | `index.html` and its parts (`tabs/`, glance cards, sheets); `empty.html` before the first upload |
| `static/js/` | `core.js` (data, formatting, chart basics), `habits.js`, `sleep.js`, `exercise.js`, `heart.js`, `app.js` (Alpine) |
| `static/src/app.css`, `tailwind.config.js` | Tailwind input and config (built to `static/dist/`) |
| `static/upload.js` | Upload sheet |
| `dev.sh` | Local run with CSS rebuilds |
| `Dockerfile`, `requirements.txt`, `.github/workflows/deploy.yml` | Container and deploy |
| `annotations.json` | Events used to seed the server's list |

`export.zip` and any `*.parquet`, `sleep_dashboard.html` or notebook files contain your health data. They're gitignored and never leave this machine except through the app's upload.
