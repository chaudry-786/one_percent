// Speech tab: practice from Accent Coach. A hero card for today, the last 12 weeks, and detail charts behind "More".
// Each practice is one sentence practised once; its time is estimated from the clip length (same as Accent Coach's Analytics).
OP.speech = (() => {
  const { APP, mean, hm, hex, chart, axis, base, tipRow, addDays, weekStart, fmtDay, today } = OP;
  const day = APP.accentToday || today; // practice days run 07:00–07:00
  const seen = new Set();
  const P = (APP.speech || []).map(([t, secs, s, d, h]) => {
    const isNew = !seen.has(s);
    seen.add(s);
    return { t, min: secs / 60, s, d, h, isNew };
  });
  const WEEKLY_TARGET = 70; // sentences a week, as on Accent Coach's Analytics page
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // per week (Mon–Sun, by practice day): minutes, sentences, new and repeat
  function weeks(n) {
    const cur = weekStart(day);
    return Array.from({ length: n }, (_, i) => {
      const w = addDays(cur, -7 * (n - 1 - i)), ps = P.filter(p => p.d >= w && p.d < addDays(w, 7));
      const fresh = ps.filter(p => p.isNew).length;
      return { w, min: ps.reduce((s, p) => s + p.min, 0), sentences: ps.length, fresh, repeat: ps.length - fresh, current: i === n - 1 };
    });
  }
  // 100 h, then the next 100
  function milestone() {
    const hours = P.reduce((s, p) => s + p.min, 0) / 60, goal = Math.max(100, Math.ceil((hours + 1e-9) / 100) * 100);
    const recent = P.filter(p => p.d > addDays(day, -28)).reduce((s, p) => s + p.min, 0) / 60 / 28; // hours a day, last 4 weeks
    const eta = recent > 0 ? addDays(day, Math.ceil((goal - hours) / recent)) : null;
    return { hours, goal, recent, eta };
  }

  // ---------- charts ----------
  function render(app, range) {
    if (!P.length) return;
    trend12(app);
    if (!app.speechMoreOpen) return; // the detail charts live in the collapsed "More detail" section
    const ps = P.filter(p => p.d >= range[0] && p.d <= range[1]);
    daily(app, ps, range);
    weekly(ps, range);
    road();
    hours(ps);
    repeats();
  }

  // minutes per practice day (new vs repeat), target line and 7-day average; long ranges show the average day of each week
  function daily(app, ps, range) {
    const end = range[1] > day ? day : range[1], target = app.targets.accentMin, long = dayjs(end).diff(range[0], "day") > 120;
    const days = [];
    for (let d = range[0] < P[0].d ? P[0].d : range[0]; d <= end; d = addDays(d, 1)) days.push(d);
    const by = new Map(days.map(d => [d, { fresh: 0, repeat: 0 }]));
    for (const p of ps) { const r = by.get(p.d); if (r) r[p.isNew ? "fresh" : "repeat"] += p.min; }
    let keys = days, label = k => fmtDay(k), vals = days.map(d => by.get(d));
    if (long) { // per week: average minutes a day
      const wk = new Map();
      for (const d of days) { const w = weekStart(d), r = wk.get(w) || wk.set(w, { fresh: 0, repeat: 0, n: 0 }).get(w); r.fresh += by.get(d).fresh; r.repeat += by.get(d).repeat; r.n++; }
      keys = [...wk.keys()]; vals = keys.map(w => { const r = wk.get(w); return { fresh: r.fresh / r.n, repeat: r.repeat / r.n }; });
      label = k => `Week of ${dayjs(k).format("D MMM")} · average day`;
    }
    const tot = vals.map(v => v.fresh + v.repeat), avg7 = tot.map((_, i) => (long || i < 6 ? null : mean(tot.slice(i - 6, i + 1))));
    app.speechDailyHint = long ? `Average minutes a day, each week · dashed line: your ${target}-min target` : `Minutes each practice day (07:00–07:00) · dashed line: your ${target}-min target`;
    const b = base();
    chart("speechDailyChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "axis", axisPointer: { type: "shadow" },
        formatter: xs => `<b>${label(keys[xs[0].dataIndex])}</b>` + xs.filter(x => x.value != null && x.value > 0).map(x => tipRow(x.color, x.seriesName, `${Math.round(x.value)} min`)).join("") },
      xAxis: axis({ type: "category", data: keys.map(k => dayjs(k).format("D MMM")), splitLine: { show: false } }),
      yAxis: axis({ type: "value", axisLabel: { color: hex("muted"), fontSize: 11, formatter: "{value}m" } }),
      series: [
        { name: "New sentences", type: "bar", stack: "m", data: vals.map(v => +v.fresh.toFixed(1)), itemStyle: { color: hex("speechNew") }, barMaxWidth: 18,
          markLine: { symbol: "none", silent: true, data: [{ yAxis: target, label: { formatter: `${target} min`, position: "insideEndTop", color: hex("ink2") }, lineStyle: { color: hex("ink2"), type: [5, 4] } }] } },
        { name: "Repeats", type: "bar", stack: "m", data: vals.map(v => +v.repeat.toFixed(1)), itemStyle: { color: hex("speechRepeat"), borderRadius: [3, 3, 0, 0] }, barMaxWidth: 18 },
        ...(long ? [] : [{ name: "7-day average", type: "line", data: avg7, showSymbol: false, smooth: 0.3, lineStyle: { width: 2, color: hex("ink2") }, itemStyle: { color: hex("ink2") } }]),
      ],
    }, true);
  }

  // sentences per week, new vs repeat, against 70 a week
  function weekly(ps, range) {
    const end = range[1] > day ? day : range[1], keys = [];
    for (let w = weekStart(range[0] < P[0].d ? P[0].d : range[0]); w <= end; w = addDays(w, 7)) keys.push(w);
    const by = new Map(keys.map(w => [w, { fresh: 0, repeat: 0 }]));
    for (const p of ps) { const r = by.get(weekStart(p.d)); if (r) r[p.isNew ? "fresh" : "repeat"]++; }
    const b = base();
    chart("speechWeeklyChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "axis", axisPointer: { type: "shadow" },
        formatter: xs => `<b>Week of ${dayjs(keys[xs[0].dataIndex]).format("D MMM")}</b>` + xs.map(x => tipRow(x.color, x.seriesName, x.value)).join("") },
      xAxis: axis({ type: "category", data: keys.map(k => dayjs(k).format("D MMM")), splitLine: { show: false } }),
      yAxis: axis({ type: "value", max: v => Math.max(v.max, WEEKLY_TARGET + 10) }),
      series: [
        { name: "New sentences", type: "bar", stack: "s", barMaxWidth: 22, data: keys.map(w => by.get(w).fresh), itemStyle: { color: hex("speechNew") },
          markLine: { symbol: "none", silent: true, data: [{ yAxis: WEEKLY_TARGET, label: { formatter: `target ${WEEKLY_TARGET}`, position: "insideEndTop", color: hex("ink2") }, lineStyle: { color: hex("ink2"), type: [5, 4] } }] } },
        { name: "Repeats", type: "bar", stack: "s", barMaxWidth: 22, data: keys.map(w => by.get(w).repeat), itemStyle: { color: hex("speechRepeat"), borderRadius: [3, 3, 0, 0] } },
      ],
    }, true);
  }

  // all-time cumulative hours with 25-hour markers and a projection to the goal at the recent pace
  function road() {
    const m = milestone(), pts = [];
    let sum = 0;
    for (const p of P) { sum += p.min / 60; if (pts.length && pts.at(-1)[2] === p.d) pts.at(-1)[1] = sum; else pts.push([dayjs(p.d).valueOf(), sum, p.d]); }
    const marks = [];
    for (let h = 25; h < m.goal && h <= sum; h += 25) { const x = pts.find(q => q[1] >= h); marks.push({ coord: [x[0], x[1]], value: `${h} h`, d: x[2] }); }
    const proj = m.eta ? [[dayjs(day).valueOf(), m.hours], [dayjs(m.eta).valueOf(), m.goal]] : [];
    const b = base();
    chart("speechRoadChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "axis", formatter: xs => { const x = xs[0]; return x.seriesIndex === 1 ? `<b>${m.goal} h around ${dayjs(x.value[0]).format("MMM YYYY")}</b><br>if you keep your last-4-weeks pace` : `<b>${fmtDay(OP.iso(x.value[0]))}</b>${tipRow(hex("speech"), "Total", `${x.value[1].toFixed(1)} h`)}`; } },
      xAxis: axis({ type: "time", splitLine: { show: false } }),
      yAxis: axis({ type: "value", max: m.goal, axisLabel: { color: hex("muted"), fontSize: 11, formatter: "{value} h" } }),
      series: [
        { name: "Total hours", type: "line", data: pts.map(q => [q[0], q[1]]), showSymbol: false, lineStyle: { width: 2.5, color: hex("speech") }, itemStyle: { color: hex("speech") },
          areaStyle: { color: hex("speech"), opacity: 0.1 },
          markPoint: { symbol: "circle", symbolSize: 8, itemStyle: { color: hex("speech"), borderColor: hex("surface"), borderWidth: 2 },
            label: { show: true, position: "top", color: hex("ink2"), fontSize: 11, formatter: x => x.value }, data: marks } },
        { name: "At your recent pace", type: "line", data: proj, showSymbol: false, lineStyle: { width: 2, type: [4, 4], color: hex("muted") }, itemStyle: { color: hex("muted") } },
      ],
    }, true);
  }

  // practices by local hour
  function hours(ps) {
    const counts = Array(24).fill(0);
    ps.forEach(p => counts[p.h]++);
    const b = base();
    chart("speechHourChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "item", formatter: x => `<b>${String(x.dataIndex).padStart(2, "0")}:00–${String((x.dataIndex + 1) % 24).padStart(2, "0")}:00</b><br>${x.value} practices` },
      xAxis: axis({ type: "category", data: counts.map((_, h) => String(h).padStart(2, "0")), splitLine: { show: false } }),
      yAxis: axis({ type: "value", minInterval: 1 }),
      series: [{ type: "bar", data: counts.map((v, h) => ({ value: v, itemStyle: { color: h >= 5 && h < 12 ? hex("morning") : hex("speech"), borderRadius: [3, 3, 0, 0] } })) }],
    }, true);
  }

  // how many times each sentence has been practised (all time)
  function repeats() {
    const per = new Map();
    P.forEach(p => per.set(p.s, (per.get(p.s) || 0) + 1));
    const labels = ["1×", "2×", "3×", "4×", "5×+"], counts = labels.map(() => 0);
    for (const n of per.values()) counts[Math.min(n, 5) - 1]++;
    const b = base();
    chart("speechRepeatChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "item", formatter: x => `<b>Practised ${x.name}</b><br>${x.value} sentences` },
      xAxis: axis({ type: "category", data: labels, splitLine: { show: false } }),
      yAxis: axis({ type: "value", minInterval: 1 }),
      series: [{ type: "bar", data: counts, barMaxWidth: 48, itemStyle: { color: hex("speech"), borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", color: hex("ink2"), fontSize: 11 } }],
    }, true);
  }

  // the hero card: today's practice vs the daily target, this week's days, and one thing to do (never miss twice)
  function status(targets) {
    const target = targets.accentMin, mins = d => APP.accent?.[d] || 0, hit = d => mins(d) >= target;
    const now = Math.round(mins(day)), until = dayjs().hour() < 7 ? "before 07:00" : "today";
    const h = OP.habits.list(targets).find(x => x.id === "accent"), streak = h ? OP.habits.stats(h).streak : 0;
    let missed = 0; // days in a row without hitting the target, before today
    for (let d = addDays(day, -1); d >= (P[0]?.d || day) && !hit(d); d = addDays(d, -1)) missed++;
    const mon = weekStart(day), week = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i);
      return { d, label: "MTWTFSS"[i], s: hit(d) ? "done" : d > day ? "future" : d === day ? "today" : "miss" };
    });
    let state, eyebrow, title, action;
    if (hit(day)) [state, eyebrow, title, action] = ["done", "Done today", `✓ ${now} min today`, streak > 1 ? `${streak}-day streak. See you tomorrow.` : "A new streak starts today. See you tomorrow."];
    else if (missed >= 1) [state, eyebrow, title, action] = ["behind", "You’ve fallen behind", missed === 1 ? "You missed yesterday" : `${missed} days without practice`, `Never miss twice: practise ${target - now} min ${until}.`];
    else [state, eyebrow, title, action] = ["pending", "Not done yet", now ? "Almost there" : "Not yet today", `${target - now} more min ${until} keeps your ${streak ? `${streak}-day ` : ""}streak.`];
    // last 4 weeks vs normal (the 6 months before)
    const sumMin = (a, b) => P.filter(p => p.d >= a && p.d <= b).reduce((s, p) => s + p.min, 0);
    const last4 = sumMin(addDays(day, -27), day), normal4 = (sumMin(addDays(day, -27 - 182), addDays(day, -28)) / 26) * 4;
    const ratio = normal4 ? last4 / normal4 : 1, m = milestone();
    return { state, eyebrow, title, action, now, target, progress: Math.min(100, (now / target) * 100), week,
      trendText: `${hm(last4)} in the last 4 weeks · you normally do ${hm(normal4)}`,
      trendTone: ratio < 0.5 ? "bad" : ratio < 0.9 ? "warn" : "good",
      milestone: `${m.hours.toFixed(1)} of ${m.goal} hours`, milestonePct: Math.min(100, (m.hours / m.goal) * 100) };
  }

  // the last 12 weeks: practice per week against the daily target × 7 (green hit, amber some, red none; this week outlined)
  function trend12(app) {
    const W = weeks(12), goal = app.targets.accentMin * 7, b = base();
    chart("speechTrendChart").setOption({
      ...b, grid: { ...b.grid, top: 16 },
      tooltip: { ...b.tooltip, trigger: "item", formatter: x => { const w = W[x.dataIndex];
        return `<b>${w.current ? "This week so far" : `Week of ${dayjs(w.w).format("D MMM")}`}</b><br>${hm(w.min)} · ${plural(w.sentences, "sentence")}`; } },
      xAxis: axis({ type: "category", data: W.map(w => (w.current ? "now" : dayjs(w.w).format("D MMM"))), splitLine: { show: false }, axisLabel: { color: hex("muted"), fontSize: 10, interval: 2 } }),
      yAxis: axis({ type: "value", interval: 60, max: v => Math.ceil(Math.max(v.max, goal * 1.1) / 60) * 60, axisLabel: { color: hex("muted"), fontSize: 11, formatter: v => `${v / 60}h` } }),
      series: [{ type: "bar", barMaxWidth: 26,
        data: W.map(w => ({ value: Math.max(w.min, goal * 0.02), itemStyle: w.current
          ? { color: "transparent", borderColor: w.min >= goal ? OP.exercise.TONE.good : hex("muted"), borderWidth: 1.5, borderType: "dashed", borderRadius: [4, 4, 0, 0] }
          : { color: w.min >= goal ? OP.exercise.TONE.good : w.min > 0 ? OP.exercise.TONE.warn : OP.exercise.TONE.bad, borderRadius: [4, 4, 0, 0] } })),
        markLine: { symbol: "none", silent: true, data: [{ yAxis: goal, label: { formatter: `target ${hm(goal)}`, position: "insideEndTop", color: hex("ink2") }, lineStyle: { color: hex("ink2"), type: [5, 4] } }] } }],
    }, true);
  }

  return { status, render, has: () => P.length > 0, sentences: () => seen.size };
})();
