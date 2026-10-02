// Exercise tab: a hero card (where you stand this week, one action), the last 12 weeks, and detail charts behind "More". Walks are left out unless toggled on.
OP.exercise = (() => {
  const { workouts, mean, hm, hex, chart, axis, base, tipRow, addDays, weekStart, fmtDay, dataEnd, eventLines } = OP;
  const GROUPS = [["strength", "Strength"], ["running", "Running"], ["cardio", "Other cardio"], ["walking", "Walking"]];

  // per ISO week: minutes and training days (non-walk workouts)
  function weeks(n) {
    const cur = weekStart(dataEnd), out = [];
    for (let i = n - 1; i >= 0; i--) {
      const w = addDays(cur, -7 * i), ws = workouts.filter(x => x.group !== "walking" && x.d >= w && x.d < addDays(w, 7));
      out.push({ w, min: ws.reduce((s, x) => s + x.dur, 0), days: new Set(ws.map(x => x.d)).size, current: i === 0 });
    }
    return out;
  }

  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const train = () => workouts.filter(x => x.group !== "walking");
  const trainedDays = (from, to) => new Set(train().filter(x => x.d >= from && x.d <= to).map(x => x.d));
  const TONE = { good: "#10b981", warn: "#f59e0b", bad: "#f43f5e" };

  // where you stand, for the hero card. "Today" is the last day in the export.
  function status(gymDays) {
    const days = [...new Set(train().map(x => x.d))].sort(), last = days.at(-1);
    const since = last ? dayjs(dataEnd).diff(last, "day") : null;
    const last4 = trainedDays(addDays(dataEnd, -27), dataEnd).size;
    // normal: training days per 4 weeks over the 6 months before the last 4 weeks
    const normal4 = Math.round((trainedDays(addDays(dataEnd, -27 - 182), addDays(dataEnd, -28)).size / 26) * 4);
    const cur = weeks(1)[0], prev = weeks(2)[0], left = Math.max(0, gymDays - cur.days);
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(cur.w, i);
      return { d, label: "MTWTFSS"[i], s: trainedDays(d, d).size ? "done" : d > dataEnd ? "future" : d === dataEnd ? "today" : "miss" };
    });
    const rings = Array.from({ length: gymDays }, (_, i) => i < cur.days);
    const byWeekend = OP.dow(dataEnd) >= 4; // Fri–Sun: Monday is a natural fresh start
    let state, eyebrow, title, action;
    if (cur.days >= gymDays) {
      [state, eyebrow, title, action] = ["done", "Week done", `${cur.days} of ${gymDays} ✓ Week done`, "Anything more is a bonus."];
    } else if (since == null || since >= 4 || last4 < normal4 / 2) {
      [state, eyebrow] = ["behind", "You’ve fallen behind"];
      title = since == null ? "No workouts yet" : `${plural(since, "day")} since your last workout`;
      action = byWeekend ? "Train today, or make Monday your fresh start." : "Train today to get back on track.";
    } else if (prev.days < gymDays) {
      [state, eyebrow, title, action] = ["slipping", "Slipping", `Last week: ${prev.days} of ${gymDays} days`, `${plural(left, "more day")} by Sunday.`];
    } else {
      [state, eyebrow, title, action] = ["ontrack", "On track", `${cur.days} of ${gymDays} days this week`, `${plural(left, "more day")} by Sunday.`];
    }
    const ratio = normal4 ? last4 / normal4 : 1;
    return { state, eyebrow, title, action, rings, week, done: cur.days, gymDays, last4, normal4,
      trendText: `${plural(last4, "training day")} in the last 4 weeks · you normally do ${normal4}`,
      trendTone: ratio < 0.5 ? "bad" : ratio < 0.9 ? "warn" : "good",
      stale: dayjs(OP.today).diff(dataEnd, "day") >= 3 ? `Based on your export up to ${fmtDay(dataEnd)}. Upload a new one for today's picture.` : "" };
  }

  // the last 12 weeks: training days per week against the target (green hit, amber some, red none; this week outlined)
  function trend12(app) {
    const W = weeks(12), g = app.targets.gymDays, b = base();
    chart("exTrendChart").setOption({
      ...b, grid: { ...b.grid, top: 16 },
      tooltip: { ...b.tooltip, trigger: "item", formatter: x => { const w = W[x.dataIndex];
        return `<b>${w.current ? "This week so far" : `Week of ${dayjs(w.w).format("D MMM")}`}</b><br>${plural(w.days, "day")} · ${hm(w.min)}`; } },
      xAxis: axis({ type: "category", data: W.map(w => (w.current ? "now" : dayjs(w.w).format("D MMM"))), splitLine: { show: false }, axisLabel: { color: hex("muted"), fontSize: 10, interval: 2 } }),
      yAxis: axis({ type: "value", minInterval: 1, max: v => Math.max(v.max, g + 1) }),
      series: [{ type: "bar", barMaxWidth: 26,
        data: W.map(w => ({ value: Math.max(w.days, 0.08), itemStyle: w.current
          ? { color: "transparent", borderColor: w.days >= g ? TONE.good : hex("muted"), borderWidth: 1.5, borderType: "dashed", borderRadius: [4, 4, 0, 0] }
          : { color: w.days >= g ? TONE.good : w.days > 0 ? TONE.warn : TONE.bad, borderRadius: [4, 4, 0, 0] } })),
        markLine: { symbol: "none", silent: true, data: [{ yAxis: g, label: { formatter: `target ${g}`, position: "insideEndTop", color: hex("ink2") }, lineStyle: { color: hex("ink2"), type: [5, 4] } }] } }],
    }, true);
  }

  // ---------- charts ----------
  function render(app, range) {
    const ws = workouts.filter(w => (app.walks || w.group !== "walking") && w.d >= range[0] && w.d <= range[1]);
    trend12(app);
    if (!app.exMoreOpen) return; // the detail charts live in the collapsed "More detail" section
    calendar(ws, range);
    weekly(app, ws, range);
    timeOfDay(ws);
    weekdays(ws);
  }

  // days inside breaks of 7+ days without training (including a break that's still going): [day, break length]
  function breakDays() {
    const days = [...new Set(train().map(x => x.d))].sort(), out = [];
    days.push(addDays(dataEnd, 1)); // the current break ends "now"
    for (let i = 1; i < days.length; i++) {
      const n = dayjs(days[i]).diff(days[i - 1], "day") - 1;
      if (n >= 7) for (let d = addDays(days[i - 1], 1); d < days[i]; d = addDays(d, 1)) out.push([d, n]);
    }
    return out;
  }

  function calendar(ws, range) {
    const byDay = new Map();
    for (const w of ws) (byDay.get(w.d) || byDay.set(w.d, []).get(w.d)).push(w);
    const el = document.getElementById("exCalChart"), narrow = el.clientWidth < 600;
    const to = range[1] > dataEnd ? dataEnd : range[1];
    let from = range[0];
    if (narrow) from = [from, addDays(to, -7 * Math.floor((el.clientWidth - 50) / 14) + 7)].sort().at(-1); // what fits on a phone
    // up to a year fits in one strip; longer ranges get one row per year
    const ranges = dayjs(to).diff(from, "day") <= 371 ? [[from, to]] : yearRanges(from, to);
    const weeksN = Math.min(53, Math.ceil(dayjs(ranges[0][1]).diff(ranges[0][0], "day") / 7) + 2);
    const cell = Math.max(8, Math.min(30, (el.clientWidth - 50) / (narrow ? weeksN : Math.max(weeksN, 26)))), rowH = cell * 7 + 46;
    el.style.height = `${ranges.length * rowH + 50}px`;
    const c1 = chart("exCalChart"); c1.resize();
    const data = [...byDay].map(([d, l]) => [d, Math.round(l.reduce((s, w) => s + w.dur, 0))]);
    const ramp = OP.isDark() ? ["#184f95", "#2a78d6", "#5598e7", "#cde2fb"] : ["#9ec5f4", "#5598e7", "#256abf", "#0d366b"], b = base();
    c1.setOption({
      ...b, tooltip: { ...b.tooltip, formatter: x => x.seriesType === "scatter" ? `<b>${fmtDay(x.data[0])}</b><br>Part of a ${x.data[1]}-day break` : `<b>${fmtDay(x.data[0])}</b> · ${hm(x.data[1])}` + (byDay.get(x.data[0]) || []).map(w => tipRow(hex(w.group), `${String(Math.floor(w.start / 60)).padStart(2, "0")}:${String(w.start % 60).padStart(2, "0")} ${w.type.replace(/([a-z])([A-Z])/g, "$1 $2")}`, hm(w.dur))).join("") },
      visualMap: { type: "piecewise", seriesIndex: ranges.map((_, i) => i), orient: "horizontal", left: "center", bottom: 0, textStyle: { color: hex("muted") },
        pieces: [{ min: 1, max: 29, label: "under 30m" }, { min: 30, max: 59, label: "30–60m" }, { min: 60, max: 89, label: "60–90m" }, { min: 90, label: "90m+" }], inRange: { color: ramp } },
      calendar: ranges.map((r, i) => ({ range: r, top: 26 + i * rowH, left: 40, cellSize: [cell, cell], splitLine: { show: false }, yearLabel: { show: ranges.length > 1, color: hex("muted") },
        itemStyle: { color: hex("grid"), borderColor: hex("surface"), borderWidth: 2 }, dayLabel: { firstDay: 1, color: hex("muted"), fontSize: 10, nameMap: ["S", "M", "T", "W", "T", "F", "S"] }, monthLabel: { color: hex("muted"), fontSize: 11 } })),
      series: [
        ...ranges.map((r, i) => ({ type: "heatmap", coordinateSystem: "calendar", calendarIndex: i, data: data.filter(x => x[0] >= r[0] && x[0] <= r[1]) })),
        // breaks of 7+ days: a small rose square in each empty day
        ...ranges.map((r, i) => ({ type: "scatter", coordinateSystem: "calendar", calendarIndex: i, symbol: "roundRect", symbolSize: Math.max(4, cell * 0.38),
          itemStyle: { color: TONE.bad, opacity: 0.55 }, data: breakDays().filter(x => x[0] >= r[0] && x[0] <= r[1]) })),
      ],
    }, true);
  }
  function yearRanges(from, to) {
    const out = [];
    for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) out.push([y === +from.slice(0, 4) ? from : `${y}-01-01`, y === +to.slice(0, 4) ? to : `${y}-12-31`]);
    return out;
  }

  // training per week (or per month, as hours per week) by type, with your average marked
  function weekly(app, ws, range) {
    const per = dayjs(range[1]).diff(range[0], "day") > 200 ? "month" : "week";
    const keyOf = d => (per === "month" ? d.slice(0, 7) : weekStart(d));
    const groups = GROUPS.filter(([g]) => app.walks || g !== "walking");
    const keys = [], dayCount = new Map(), sums = new Map();
    for (let d = range[0]; d <= range[1] && d <= dataEnd; d = addDays(d, 1)) {
      const k = keyOf(d);
      if (!sums.has(k)) { keys.push(k); sums.set(k, Object.fromEntries(groups.map(([g]) => [g, 0]))); }
      dayCount.set(k, (dayCount.get(k) || 0) + 1);
    }
    for (const w of ws) { const k = keyOf(w.d); if (sums.has(k) && w.group in sums.get(k)) sums.get(k)[w.group] += w.dur; }
    const perWeek = (k, g) => sums.get(k)[g] / (per === "month" ? dayCount.get(k) / 7 : 1);
    const avg = ws.reduce((s, w) => s + w.dur, 0) / ([...dayCount.values()].reduce((a, b) => a + b, 0) / 7 || 1);
    const top = Math.max(...keys.map(k => groups.reduce((s, [g]) => s + perWeek(k, g), 0)), avg), step = top > 480 ? 120 : 60;
    app.exWeeklyHint = per === "month" ? `Average hours per week in each month · dashed line: your average, ${hm(avg)} a week` : `Hours each week · dashed line: your average, ${hm(avg)} a week`;
    const b = base(), c1 = chart("exWeeklyChart");
    c1.setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "axis", axisPointer: { type: "shadow" },
        formatter: ps => `<b>${per === "month" ? dayjs(keys[ps[0].dataIndex] + "-01").format("MMM YYYY") + " · per week" : "Week of " + dayjs(keys[ps[0].dataIndex]).format("D MMM")}</b>` + ps.filter(x => x.value).map(x => tipRow(x.color, x.seriesName, hm(x.value))).join("") },
      xAxis: axis({ type: "category", data: keys.map(k => (per === "month" ? dayjs(k + "-01").format("MMM YY") : dayjs(k).format("D MMM"))), splitLine: { show: false } }),
      yAxis: axis({ type: "value", interval: step, max: v => Math.ceil(v.max / step) * step, axisLabel: { color: hex("muted"), fontSize: 11, formatter: v => `${v / 60}h` } }),
      series: groups.map(([g, l], i) => ({ name: l, type: "bar", stack: "w", barMaxWidth: per === "month" ? 30 : 16, data: keys.map(k => Math.round(perWeek(k, g))),
        itemStyle: { color: hex(g) },
        markLine: i === 0 ? { symbol: "none", silent: true, data: [{ yAxis: avg, label: { formatter: `avg ${hm(avg)}`, position: "insideEndTop", color: hex("ink2") }, lineStyle: { color: hex("ink2"), type: [5, 4] } }] } : undefined })),
    }, true);
  }

  // start times, one bar per hour
  function timeOfDay(ws) {
    const hours = Array(24).fill(0);
    ws.forEach(w => hours[Math.floor(w.start / 60)]++);
    let lo = hours.findIndex(v => v > 0), hi = 23 - [...hours].reverse().findIndex(v => v > 0);
    if (lo < 0) { lo = 6; hi = 22; }
    const idx = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), b = base();
    chart("exTimeChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "item", formatter: x => `<b>${String(idx[x.dataIndex]).padStart(2, "0")}:00–${String(idx[x.dataIndex] + 1).padStart(2, "0")}:00</b><br>${x.value} workouts` },
      xAxis: axis({ type: "category", data: idx.map(h => String(h).padStart(2, "0")), splitLine: { show: false } }),
      yAxis: axis({ type: "value", minInterval: 1 }),
      series: [{ type: "bar", data: idx.map(h => ({ value: hours[h], itemStyle: { color: h < 12 ? hex("total") : hex("accent"), borderRadius: [4, 4, 0, 0] } })) }],
    }, true);
  }

  // training days by weekday (in range)
  function weekdays(ws) {
    const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], counts = DOW.map(() => new Set());
    ws.filter(w => w.group !== "walking").forEach(w => counts[OP.dow(w.d)].add(w.d));
    const b = base();
    chart("exDowChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "item", formatter: x => `<b>${DOW[x.dataIndex]}</b><br>${plural(x.value, "training day")}` },
      xAxis: axis({ type: "category", data: DOW, splitLine: { show: false } }),
      yAxis: axis({ type: "value", minInterval: 1 }),
      series: [{ type: "bar", data: counts.map(s => s.size), barMaxWidth: 32, itemStyle: { color: hex("strength"), borderRadius: [4, 4, 0, 0] } }],
    }, true);
  }

  return { status, render, TONE };
})();
