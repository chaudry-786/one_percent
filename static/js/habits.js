// Habits: three habits on fixed targets. Streaks use Atomic Habits' "never miss twice": one miss is forgiven, two end it.
OP.habits = (() => {
  const { nights, workouts, APP, addDays, weekStart, fmtDay, hm, clock, dataEnd, today } = OP;
  const DEFAULTS = { wakeBy: "07:15", gymDays: 4, accentMin: 15 };
  const QUOTES = [
    "You do not rise to the level of your goals. You fall to the level of your systems.",
    "Every action you take is a vote for the type of person you wish to become.",
    "Getting 1% better every day counts for a lot in the long run.",
    "Missing once is an accident. Missing twice is the start of a new habit.",
    "Habits are the compound interest of self-improvement.",
  ];
  // Tailwind classes per habit (written out in full so Tailwind keeps them)
  const STYLE = {
    wake: { top: "border-t-amber-500", icon: "bg-amber-500/15", done: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", ring: "stroke-amber-500", line: "text-amber-500" },
    gym: { top: "border-t-emerald-500", icon: "bg-emerald-500/15", done: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", ring: "stroke-emerald-500", line: "text-emerald-500" },
    accent: { top: "border-t-violet-500", icon: "bg-violet-500/15", done: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", ring: "stroke-violet-500", line: "text-violet-500" },
  };
  const prettyWorkout = t => ({ TraditionalStrengthTraining: "Strength", FunctionalStrengthTraining: "Functional strength", HighIntensityIntervalTraining: "HIIT" })[t]
    || t.replace(/([a-z])([A-Z])/g, "$1 $2");

  function list(t) {
    const [wh, wm] = t.wakeBy.split(":").map(Number);
    const wake = new Map(), gym = new Map(), accent = new Map();
    for (const n of nights) {
      const morning = addDays(n.d, 1); // a wake-up counts on the morning you wake
      wake.set(morning, { done: n.wake - 720 <= wh * 60 + wm, text: `up at ${clock(n.wake)}` });
    }
    for (const w of workouts) {
      if (w.group === "walking") continue;
      const g = gym.get(w.d) || { done: true, min: 0, types: new Set() };
      g.min += w.dur; g.types.add(prettyWorkout(w.type)); g.text = `${hm(g.min)} · ${[...g.types].join(", ")}`;
      gym.set(w.d, g);
    }
    for (const [d, m] of Object.entries(APP.accent || {})) accent.set(d, { done: m >= t.accentMin, min: m, text: `${Math.round(m)} min practice` });
    const firstOf = map => [...map.keys()].sort()[0];
    const habits = [
      { id: "wake", name: "Wake up early", icon: "☀️", target: `Up by ${t.wakeBy}`, who: "an early riser", map: wake, gaps: "unknown", asOf: dataEnd, start: firstOf(wake) },
      { id: "gym", name: "Train", icon: "🏋️", target: `${t.gymDays} days a week · any workout but walks`, who: "an athlete", map: gym, gaps: "miss", asOf: dataEnd, start: firstOf(gym), weekly: t.gymDays },
    ];
    if (APP.accent) habits.push({ id: "accent", name: "Speech practice", icon: "🗣️", target: `${t.accentMin}+ min a day`, who: "a confident speaker", map: accent, gaps: "miss", asOf: APP.accentToday || today, start: firstOf(accent), live: true, minTarget: t.accentMin });
    return habits.filter(h => h.start);
  }

  function status(h, d) {
    if (d > h.asOf || d < h.start) return "none";
    const r = h.map.get(d);
    if (h.live && d === h.asOf && !(r && r.done)) return "pending";
    if (r) return r.done ? "done" : "miss";
    return h.gaps === "unknown" ? "unknown" : "miss";
  }
  const run = statuses => { let n = 0, miss = 0; for (const s of statuses) { if (s === "done") { n++; miss = 0; } else if (s === "miss" && ++miss >= 2) break; } return n; };
  const best = statuses => { let b = 0, n = 0, miss = 0; for (const s of statuses) { if (s === "done") { n++; miss = 0; b = Math.max(b, n); } else if (s === "miss" && ++miss >= 2) n = 0; } return b; };

  function stats(h) {
    const days = [];
    for (let d = h.start; d <= h.asOf; d = addDays(d, 1)) days.push([d, status(h, d)]);
    const votes = days.filter(([, s]) => s === "done").length;
    if (h.weekly) {
      const weeks = new Map();
      for (const [d, s] of days) weeks.set(weekStart(d), (weeks.get(weekStart(d)) || 0) + (s === "done"));
      const cur = weekStart(h.asOf);
      const ws = [...weeks].map(([w, n]) => [w, n >= h.weekly ? "done" : w === cur ? "pending" : "miss", n]);
      const last8 = ws.filter(x => x[1] !== "pending").slice(-8);
      return { votes, streak: run(ws.map(x => x[1]).reverse()), best: best(ws.map(x => x[1])), unit: "week", weeks: new Map(ws.map(x => [x[0], x[2]])),
        recent: `${last8.filter(x => x[1] === "done").length} of the last ${last8.length} weeks`, thisWeek: weeks.get(cur) || 0 };
    }
    const recent = days.slice(-28).filter(([, s]) => s === "done" || s === "miss");
    return { votes, streak: run(days.map(x => x[1]).reverse()), best: best(days.map(x => x[1])), unit: "day",
      recent: `${recent.filter(([, s]) => s === "done").length} of the last ${recent.length} days` };
  }

  const YEAR = today.slice(0, 4), JAN1 = `${YEAR}-01-01`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const hours = min => `${+(min / 60).toFixed(min < 6000 ? 1 : 0)} h`;

  // ---------- habit strength (0–100%), evidence-based ----------
  // On every opportunity: H ← H + α·(did − H). Strength grows when you act in the context and weakens when you don't
  // (Miller, Shenhav & Ludvig 2019, "Habits without values"; Hull 1943). α comes from the literature, not from your data:
  //   daily habits: 95% of plateau after 66 daily repetitions (Lally et al. 2010; Singh et al. 2024 meta-analysis: median 59–66 days)
  //   training: 4 sessions a week for 6 weeks (24) establishes the habit → 80% at 24 (Kaushal & Rhodes 2015)
  // A miss costs α·H (one barely matters, a run weakens it); it never resets to zero: lapses inhibit, they don't erase (Bouton 2014).
  const ALPHA = { daily: 1 - 0.05 ** (1 / 66), gym: 1 - 0.2 ** (1 / 24) };
  const LABELS = [[0.95, "Automatic"], [0.8, "Strong"], [0.4, "Building"], [0, "Forming"]];
  const alphaOf = h => (h.weekly ? ALPHA.gym : ALPHA.daily);
  const rep = (s, a) => s + a * (1 - s);
  // daily strength. Opportunities: every day for daily habits; for training, each training day plus, at week end, the days short of the target.
  function strengthSeries(h) {
    const out = [], a = alphaOf(h);
    let s = 0;
    for (let d = h.start; d <= h.asOf; d = addDays(d, 1)) {
      const st = status(h, d);
      if (st === "done") s = rep(s, a);
      else if (st === "miss" && !h.weekly) s -= a * s;
      if (h.weekly && OP.dow(d) === 6) { let n = 0; for (let i = 0; i < 7; i++) n += status(h, addDays(d, -i)) === "done"; for (let i = n; i < h.weekly; i++) s -= a * s; }
      out.push({ d, s, st });
    }
    return out;
  }
  const toNext = (s, target, a) => { let n = 0; while (s < target && n < 500) { s = rep(s, a); n++; } return n; };

  // one card's worth of data for the template
  function card(h) {
    const st = stats(h), r = h.map.get(h.asOf);
    const label = h.asOf === today || h.live ? "Today" : `Latest · ${fmtDay(h.asOf)}`;
    let now;
    if (h.weekly) now = { text: `This week · ${st.thisWeek} of ${h.weekly} days`, done: st.thisWeek >= h.weekly };
    else if (h.id === "accent") now = r?.done ? { text: `${label} · ${Math.round(r.min)} min`, done: true }
      : { text: `${label} · ${r ? Math.round(r.min) : 0} of ${h.minTarget} min`, done: false, link: APP.accentUrl };
    else now = r ? { text: `${label} · ${r.text}`, done: r.done } : { text: `${label} · no data`, done: false };

    const series = strengthSeries(h), last = series.at(-1), s = last.s;
    const peak = series.reduce((a, x) => (x.s > a.s ? x : a)), ago = series.at(-31)?.s ?? 0;
    const pct = Math.round(s * 100), level = LABELS.find(([min]) => s >= min)[1];
    const target = s >= 0.95 ? null : s >= 0.9 ? 0.95 : Math.floor(s * 10 + 1) / 10, unit = h.weekly ? "training day" : h.id === "accent" ? "practice day" : "early morning";
    const a = alphaOf(h);
    const next = target ? `${plural(toNext(s, target, a), `more ${unit}`)} → ${Math.round(target * 100)}%` : "Automatic. Keep showing up.";
    // a lapsed habit is dormant, not erased (Bouton 2014): show how quickly it comes back
    const comeback = s < peak.s / 2 && s < 0.75 ? `Comes back quickly: ${plural(toNext(s, 0.75, a), unit)} in a row → 75%` : "";
    // today's vote: live for speech; for wake and training only when the export covers today
    const fresh = h.live || h.asOf === today;
    const vote = !fresh ? "unknown" : last.st === "done" ? "cast" : "open";
    const before = series.at(-2)?.s ?? 0, gain = vote === "cast" ? Math.max(0.1, (s - before) * 100) : rep(s, a) * 100 - s * 100;
    const yesterday = h.weekly ? null : status(h, addDays(h.asOf, -1));
    // weekly samples of strength this year, for the mini line
    const pts = series.filter(x => x.d >= JAN1 && (OP.dow(x.d) === 6 || x.d === h.asOf));
    const chart = { kind: "line", unit: "pct", ref: null, from: pts.length ? dayjs(pts[0].d).format("D MMM") : "", to: "now",
      points: pts.map(x => ({ v: x.s * 100, text: `${x.d === h.asOf ? "Now" : `Week to ${dayjs(x.d).format("D MMM")}`} · ${Math.round(x.s * 100)}% habit strength` })) };
    return { ...h, style: STYLE[h.id], st, now, pct, level, next, comeback, chart, vote, votes: st.votes, since: dayjs(h.start).format("MMM YYYY"),
      ring: ring(s, STYLE[h.id].ring),
      fading: s < ago - 0.005 ? `↓ from ${Math.round(peak.s * 100)}% in ${dayjs(peak.d).format(peak.d.startsWith(YEAR) ? "MMM" : "MMM YYYY")}` : s > ago + 0.005 ? "↑ rising" : "",
      voteText: vote === "cast" ? `✓ Today's vote cast · strength +${gain.toFixed(1)}%` : vote === "open" ? `Today's vote: +${gain.toFixed(1)}% strength` : `Upload an export to count today`,
      warn: yesterday === "miss" && vote === "open" ? "You missed yesterday. Don't miss twice." : "" };
  }

  // progress ring for habit strength (SVG; the colour class sets the stroke)
  function ring(s, cls) {
    const r = 26, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 64 64" class="h-20 w-20 -rotate-90"><circle cx="32" cy="32" r="${r}" fill="none" stroke-width="7" class="stroke-slate-200 dark:stroke-slate-800"/>` +
      `<circle cx="32" cy="32" r="${r}" fill="none" stroke-width="7" stroke-linecap="round" class="${cls}" opacity="${s > 0.005 ? 1 : 0}" stroke-dasharray="${(c * s).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
  }

  // the year so far across habits, for the hero (these only ever go up)
  function yearSummary(t) {
    const train = workouts.filter(w => w.group !== "walking" && w.d >= JAN1 && w.d <= dataEnd);
    const speech = Object.entries(APP.accent || {}).filter(([d]) => d >= JAN1);
    const [wh, wm] = t.wakeBy.split(":").map(Number);
    const early = nights.filter(n => addDays(n.d, 1) >= JAN1 && n.wake - 720 <= wh * 60 + wm).length;
    const items = [
      { id: "gym", num: new Set(train.map(w => w.d)).size, label: "training days", sub: `${hours(train.reduce((s, w) => s + w.dur, 0))} · ${plural(train.length, "session")}` },
      ...(APP.accent ? [{ id: "accent", num: hours(speech.reduce((s, [, m]) => s + m, 0)), label: "speech practice", sub: `${plural(speech.filter(([, m]) => m >= t.accentMin).length, "day")} at ${t.accentMin}+ min` }] : []),
      { id: "wake", num: early, label: "early mornings", sub: `up by ${t.wakeBy}` },
    ];
    return { year: YEAR, items: items.map(x => ({ ...x, text: STYLE[x.id].text })),
      line: items.map(x => `${x.num} ${x.label}`).join(" · ") };
  }

  // "More info": one habit's strength over time (line) with how often you did it each week (bars), both 0–100%
  function renderHistory(app, range) {
    const h = list(app.targets).find(x => x.id === app.habitPick) || list(app.targets)[0];
    if (!h) return;
    const series = strengthSeries(h).filter(x => x.d >= range[0] && x.d <= range[1]), c = OP.hex(h.id === "gym" ? "cardio" : h.id === "accent" ? "speech" : "morning");
    const weeks = new Map();
    for (const x of series) {
      const w = weekStart(x.d), r = weeks.get(w) || weeks.set(w, { done: 0, miss: 0 }).get(w);
      if (x.st === "done") r.done++; else if (x.st === "miss") r.miss++;
    }
    const rate = [...weeks].map(([w, r]) => {
      const v = h.weekly ? Math.min(1, r.done / h.weekly) : r.done + r.miss ? r.done / (r.done + r.miss) : null;
      return { w, v, text: h.weekly ? `${r.done} of ${h.weekly} training days` : `${r.done} of ${r.done + r.miss} days` };
    });
    const b = OP.base();
    OP.chart("habitChart").setOption({
      ...b, grid: { ...b.grid, top: 36 },
      tooltip: { ...b.tooltip, trigger: "axis", formatter: ps => {
        const t = ps[0].axisValue, line = ps.find(p => p.seriesIndex === 1), bar = rate.find(r => dayjs(r.w).valueOf() <= t && t < dayjs(r.w).add(7, "day").valueOf());
        return `<b>${fmtDay(OP.iso(t))}</b>` + (line ? OP.tipRow(c, "Habit strength", `${Math.round(line.value[1])}%`) : "") +
          (bar && bar.v != null ? OP.tipRow(OP.hex("muted"), `Week of ${dayjs(bar.w).format("D MMM")}`, bar.text) : ""); } },
      xAxis: OP.axis({ type: "time", splitLine: { show: false } }),
      yAxis: OP.axis({ type: "value", min: 0, max: 100, interval: 25, axisLabel: { color: OP.hex("muted"), fontSize: 11, formatter: "{value}%" } }),
      series: [
        { name: "Done that week", type: "bar", barMaxWidth: 14, data: rate.filter(r => r.v != null).map(r => [dayjs(r.w).add(3, "day").valueOf(), Math.round(r.v * 100)]),
          itemStyle: { color: c, opacity: 0.25, borderRadius: [3, 3, 0, 0] } },
        { name: "Habit strength", type: "line", showSymbol: false, smooth: 0.2, data: series.map(x => [dayjs(x.d).valueOf(), +(x.s * 100).toFixed(1)]),
          lineStyle: { width: 2.5, color: c }, itemStyle: { color: c }, areaStyle: { color: c, opacity: 0.08 },
          markLine: { symbol: "none", silent: true, data: [{ yAxis: 95, label: { formatter: "automatic 95%", position: "insideEndTop", color: OP.hex("ink2") }, lineStyle: { color: OP.hex("ink2"), type: [5, 4] } }] } },
      ],
    }, true);
    if (h.id === "wake") wakeTimes(app, range);
    app.habitHint = `${h.name}: habit strength each day (line) and how often you did it each week (bars). ${h.weekly ? `A week counts fully at ${h.weekly} training days.` : "Days without data aren't counted."}`;
  }

  // average wake-up time per week (by the morning you woke), against the target
  function wakeTimes(app, range) {
    const [th, tm] = app.targets.wakeBy.split(":").map(Number), target = th * 60 + tm + 720; // minutes after noon, like nights[].wake
    const weeks = new Map();
    for (const n of nights) {
      const morning = addDays(n.d, 1);
      if (morning < range[0] || morning > range[1]) continue;
      const w = weekStart(morning), r = weeks.get(w) || weeks.set(w, []).get(w);
      r.push(n.wake);
    }
    const rows = [...weeks].sort().map(([w, v]) => ({ w, avg: v.reduce((s, x) => s + x, 0) / v.length, hit: v.filter(x => x <= target).length, n: v.length }));
    const b = OP.base(), c = OP.hex("morning");
    OP.chart("habitWakeChart").setOption({
      ...b, grid: { ...b.grid, top: 24 },
      tooltip: { ...b.tooltip, trigger: "axis", formatter: ps => { const r = rows[ps[0].dataIndex];
        return `<b>Week of ${dayjs(r.w).format("D MMM YYYY")}</b>${OP.tipRow(c, "Average wake-up", clock(r.avg))}<span style="color:${OP.hex("muted")}">up by ${app.targets.wakeBy} on ${r.hit} of ${r.n} mornings</span>`; } },
      xAxis: OP.axis({ type: "category", data: rows.map(r => dayjs(r.w).format("D MMM")), splitLine: { show: false } }),
      yAxis: OP.axis({ type: "value", interval: 30, min: v => Math.floor((Math.min(v.min, target) - 10) / 30) * 30, max: v => Math.ceil((Math.max(v.max, target) + 10) / 30) * 30,
        axisLabel: { color: OP.hex("muted"), fontSize: 11, formatter: v => clock(v) } }),
      series: [{ type: "line", data: rows.map(r => +r.avg.toFixed(1)), smooth: 0.2, symbolSize: 5,
        lineStyle: { width: 2.5, color: c }, itemStyle: { color: c },
        markLine: { symbol: "none", silent: true, data: [{ yAxis: target, label: { formatter: `target ${app.targets.wakeBy}`, position: "insideEndTop", color: OP.hex("ink2") }, lineStyle: { color: OP.hex("ink2"), type: [5, 4] } }] } }],
    }, true);
    const recent = rows.slice(-4);
    app.wakeHint = recent.length ? `Last 4 weeks: you usually woke at ${clock(recent.reduce((s, r) => s + r.avg, 0) / recent.length)} · target ${app.targets.wakeBy} · lower is earlier` : "";
  }

  return { DEFAULTS, renderHistory, quote: () => QUOTES[Math.floor(Date.now() / 864e5) % QUOTES.length], cards: t => list(t).map(card), list, stats, status, yearSummary };
})();
