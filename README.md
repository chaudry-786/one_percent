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
- The server embeds the data as JSON in the page; there's nothing to fetch after load. The open tab is in the URL (`#sleep`, `#exercise`, `#heart`, `#speech`), so refreshing stays on it; everything else resets on refresh, and the light/dark choice is remembered.

## What's on the page

Every tab starts with **At a glance** cards: a big number, a plain-language "how it's going", and a small chart with its scale, dates and a labelled dashed line for your usual (or target). Sleep and Heart use a line (a dot per night or day; Heart adds the 7-day average line the big number shows); Exercise uses bars, one per week, with the current week marked "so far". Tap the chart to see any night, day or week; tap again to go back. A gold badge marks your best week of the year.

### Habits

Three habits, each judged against a fixed target. There are no comparisons, just how you're doing:

| Habit | Done when | Counted on |
|---|---|---|
| Wake up early | up by 07:15 | the morning you wake |
| Train | any workout except walks, **4 days a week** | each week (Mon–Sun) |
| Speech practice | 15+ min of practice, read from Accent Coach's saved history | each day, 07:00 to 07:00 (late-night practice counts for that evening) |

At the top, **Today** shows each habit's vote for today: cast ✓, not yet, or "needs upload". Wake and Train only know about today once a new export is uploaded; Speech is live. Under it is one line with this year's totals.

Each card shows:
- **Habit strength** (a ring, 0–100%), with a level: Forming, Building, Strong or Automatic. There's an arrow when it's fading (e.g. "↓ from 91% in Jul") and a near target such as "9 more training days → 80%".
- **Today's vote**, with the strength it adds (about +2% when you're mid-way).
- **"You missed yesterday. Don't miss twice."**, shown only when it applies.
- **Votes** (every day the habit was done) for the person you're becoming, with a bar to the next milestone (every 25 under 100, then every 50).
- **Habit strength through the year** as a small line. Tap it for a week's value.
- **The current streak**, using "never miss twice".

**Habit strength: the science.** The number models automaticity, using published findings rather than being tuned to anyone's data.

- **Formula** (applied on every opportunity): `H ← H + α × (did − H)`. Doing the habit moves strength towards 100%, and missing an opportunity moves it towards 0. The habit system strengthens actions you repeat in a context and weakens ones you don't, regardless of reward (Miller, Shenhav & Ludvig 2019). This is the same exponential form as Hull's habit-strength theory (1943).
- **Opportunities:**
  - **Wake early and speech:** every day (speech days run 07:00–07:00).
  - **Training:** 4 a week. Each training day counts as done, and the days short of 4 count as missed at the end of the week, so rest days are free.
- **Learning rate:**
  - **Daily habits:** α ≈ 4.4%, so 66 daily repetitions reach 95% of the plateau (Lally et al. 2010: median 66 days; Singh et al. 2024 meta-analysis: medians 59–66).
  - **Training:** α ≈ 6.5%, so 24 sessions (4 a week for 6 weeks, the minimum found to establish an exercise habit; Kaushal & Rhodes 2015) reach 80%.
- **What follows from this:**
  - **The start is the fastest part:** 27% after a perfect week, 74% after 30 days, 95% after 66.
  - **A single miss barely matters** (Lally 2010 found the same), but a run of misses steadily weakens the habit.
  - **Over time strength settles near the share of opportunities you take,** weighted to recent weeks.
  - **It never resets to zero:** lapses inhibit a habit rather than erase it, and relearning is fast (Bouton 2014). Hence the "comes back quickly" line.
- **Levels:** Forming under 40%, Building 40–80%, Strong 80–95%, Automatic 95%+.

References:
- Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology*, 40(6), 998–1009.
- Singh, B., et al. (2024). Time to form a habit: a systematic review and meta-analysis of health behaviour habit formation and its determinants. *Healthcare*, 12(23).
- Miller, K. J., Shenhav, A., & Ludvig, E. A. (2019). Habits without values. *Psychological Review*, 126(2), 292–311.
- Hull, C. L. (1943). *Principles of Behavior*. Appleton-Century.
- Kaushal, N., & Rhodes, R. E. (2015). Exercise habit formation in new gym members: a longitudinal study. *Journal of Behavioral Medicine*, 38(4), 652–663.
- Bouton, M. E. (2014). Why behavior change is difficult to sustain. *Preventive Medicine*, 68, 29–36.
- Fournier, M., et al. (2017). Effects of circadian cortisol on the development of a health habit. *Health Psychology*, 36(11), 1059–1064. (Morning habits became automatic sooner; background only.)

**More info** (under the cards) charts one habit over time. Pick Wake early, Train or Speech and a date range, as on the Sleep tab. The line is habit strength each day; the bars are how often you did it each week (for training, 4 days is a full week). For Wake early it also shows your average wake-up time each week against your target.

Votes (from *Atomic Habits*: "every action is a vote for the type of person you wish to become") only ever go up.

A different *Atomic Habits* quote appears each day. Change the targets with **Targets**; they're saved on the server, so every device uses them.

Speech practice minutes use the same estimate as Accent Coach's Analytics page, based on each practised clip's length. On Cloud Run, the app reads `progress.json` from Accent Coach's bucket (read-only).

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

Designed to get you to act: one message, one action, one trend. Walks don't count unless **Count walks** is on (under More detail). "Today" is the last day in your export; if it's 3+ days old the card says so.

- **Hero card:**
  - **Behind** (red): 4+ days since your last workout, or the last 4 weeks under half your normal.
  - **Slipping** (amber): last week missed the target.
  - **On track** / **Week done** (green).
  - It shows one ring per target day (filled as you train), this week's days, and one sentence on what to do. From Friday to Sunday, when behind, it suggests Monday as a fresh start.
- **Last 12 weeks:** training days per week against your target. Green hit it, amber some, red none, and this week is dashed. Above it: training days in the last 4 weeks vs your normal (the 6 months before).
- **More detail** (collapsed): date range, workout calendar (small red squares mark breaks of a week or more), what time and which days you train, and hours per week by type.

There's deliberately no "training vs sleep" comparison: in your data, busy training weeks don't show better sleep or heart numbers (other things change too), so it would mislead.

### Heart

- **At a glance:** 7-day averages of HRV, resting heart rate and walking heart rate, vs your usual.
- **HRV:** the average of all readings each day (not just overnight), with your normal range (middle half of days) shaded.
- **Resting heart rate** and **walking heart rate** (average while walking; it drops as fitness improves).

### Speech

Practice from Accent Coach (read from its `progress.json`), built the same way as Exercise: one message, one action, one trend. Each practice is one sentence practised once; its time is estimated from the clip length, as on Accent Coach's Analytics page. Practice days run 07:00–07:00.

- **Hero card (today):**
  - **Done today** (green): with your streak.
  - **Not done yet** (amber): how many minutes keep the streak.
  - **Behind** (red): you missed yesterday too ("never miss twice").
  - It shows a progress bar for today's minutes, this week's days, one sentence, and a **Practise now** button.
- **Last 12 weeks:** practice per week against your daily target × 7. Green hit it, amber some, red none, and this week is dashed. Above it: time in the last 4 weeks vs your normal (the 6 months before), and progress to 100 hours.
- **More detail** (collapsed): date range, daily practice (new vs repeats), sentences per week, road to 100 hours, when you practise, and how often you repeat a sentence.

Words, the sentence lists and "bad" sentences stay on Accent Coach's Analytics page, because One Percent doesn't have the sentence text.

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
| `static/js/` | `core.js` (data, formatting, chart basics), `habits.js`, `sleep.js`, `exercise.js`, `heart.js`, `speech.js`, `app.js` (Alpine) |
| `static/src/app.css`, `tailwind.config.js` | Tailwind input and config (built to `static/dist/`) |
| `static/upload.js` | Upload sheet |
| `dev.sh` | Local run with CSS rebuilds |
| `Dockerfile`, `requirements.txt`, `.github/workflows/deploy.yml` | Container and deploy |
| `annotations.json` | Events used to seed the server's list |

`export.zip` and any `*.parquet`, `sleep_dashboard.html` or notebook files contain your health data. They're gitignored and never leave this machine except through the app's upload.
