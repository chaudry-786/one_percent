// Exercise tab: glance cards (training time, consistency, mornings) and charts. Walks are left out unless toggled on.
OP.exercise = (() => {
  const { workouts, mean, hm, hex, chart, axis, base, tipRow, addDays, weekStart, fmtDay, dataEnd, eventLines } = OP;
  const isMorning = w => w.start < 720;
  const GROUPS = [["strength", "Strength"], ["running", "Running"], ["cardio", "Other cardio"], ["walking", "Walking"]];

  // per ISO week: minutes, training days, morning sessions (non-walk workouts)
  function weeks(n) {
    const cur = weekStart(dataEnd), out = [];
    for (let i = n - 1; i >= 0; i--) {
      const w = addDays(cur, -7 * i), ws = workouts.filter(x => x.group !== "walking" && x.d >= w && x.d < addDays(w, 7));
      out.push({ w, min: ws.reduce((s, x) => s + x.dur, 0), days: new Set(ws.map(x => x.d)).size, mornings: ws.filter(isMorning).length, sessions: ws.length, current: i === 0 });
    }
    return out;
  }
  // weekly bars for a glance card: the last 12 weeks, the current one marked "so far"
  const bars = (W, key, unit, ref, refText, what) => ({ kind: "bars", unit, ref, refText,
    from: dayjs(W[0].w).format("D MMM"), to: "this week",
    points: W.map(x => ({ v: x[key], current: x.current,
      text: `${x.current ? "This week so far" : `Week of ${dayjs(x.w).format("D MMM")}`} · ${what(x[key])}` })) });

  function glanceCards(gymDays) {
    const W = weeks(13), done = W.slice(0, -1), cur = W.at(-1), last8 = done.slice(-8);
    const usualMin = mean(last8.map(x => x.min));
    const toGo = usualMin - cur.min;
    const hits = done.slice(-12).filter(x => x.days >= gymDays).length;
    const gym = OP.habits.list({ ...OP.habits.DEFAULTS, ...OP.APP.habits, gymDays }).find(h => h.id === "gym");
    const streak = gym ? OP.habits.stats(gym).streak : 0;
    const recent = workouts.filter(x => x.group !== "walking" && x.d > addDays(dataEnd, -28));
    const mornings = recent.filter(isMorning).length, usualMornings = mean(last8.map(x => x.mornings));
    const thisMorn = mean(W.slice(-4).map(x => x.mornings));
    const W12 = W.slice(-12), plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const bestMin = Math.max(...W.filter(x => x.w.startsWith(cur.w.slice(0, 4))).map(x => x.min));
    return [
      { key: "time", icon: "⏱️", title: "Training time", top: "border-t-blue-500", color: "text-blue-500", num: hm(cur.min), unit: "",
        label: `This week so far · ${dayjs(cur.w).format("ddd D MMM")} – ${fmtDay(dataEnd)}`, chart: bars(W12, "min", "dur", usualMin, `usual ${hm(usualMin)}`, hm),
        trend: cur.min >= usualMin ? { text: `✓ Past your usual week (${hm(usualMin)})`, good: true } : { text: `${hm(toGo)} to go to your usual week (${hm(usualMin)})`, good: false },
        sub: "Each bar is a week (Mon–Sun)", badge: cur.min > 0 && cur.min >= bestMin ? `Best week of ${cur.w.slice(0, 4)}` : null },
      { key: "consistency", icon: "📅", title: "Consistency", top: "border-t-emerald-500", color: "text-emerald-500", num: `${hits}`, unit: `of 12 weeks`,
        label: `weeks with ${gymDays}+ training days`, chart: bars(W12, "days", "count", gymDays, `target ${gymDays}`, n => plural(n, "training day")),
        trend: streak ? { text: `${streak}-week streak · never miss twice`, good: true } : { text: `This week: ${cur.days} of ${gymDays} days`, good: false },
        sub: "Each bar is a week: days you trained", badge: null },
      { key: "mornings", icon: "🌅", title: "Morning sessions", top: "border-t-amber-500", color: "text-amber-500", num: `${mornings}`, unit: `of ${recent.length}`,
        label: "sessions started before 12:00 · last 4 weeks", chart: bars(W12, "mornings", "count", usualMornings, `usual ${+usualMornings.toFixed(1)}`, n => plural(n, "morning session")),
        trend: thisMorn > usualMornings * 1.05 ? { text: "↑ More mornings than usual", good: true } : { text: `Usually ${(+usualMornings.toFixed(1))} a week`, good: false },
        sub: "Each bar is a week: morning sessions", badge: null },
    ];
  }

  // ---------- charts ----------
  function render(app, range) {
    const ws = workouts.filter(w => (app.walks || w.group !== "walking") && w.d >= range[0] && w.d <= range[1]);
    calendar(ws, range);
    weekly(app, ws, range);
    timeOfDay(ws);
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
      ...b, tooltip: { ...b.tooltip, formatter: x => `<b>${fmtDay(x.data[0])}</b> · ${hm(x.data[1])}` + (byDay.get(x.data[0]) || []).map(w => tipRow(hex(w.group), `${String(Math.floor(w.start / 60)).padStart(2, "0")}:${String(w.start % 60).padStart(2, "0")} ${w.type.replace(/([a-z])([A-Z])/g, "$1 $2")}`, hm(w.dur))).join("") },
      visualMap: { type: "piecewise", seriesIndex: ranges.map((_, i) => i), orient: "horizontal", left: "center", bottom: 0, textStyle: { color: hex("muted") },
        pieces: [{ min: 1, max: 29, label: "under 30m" }, { min: 30, max: 59, label: "30–60m" }, { min: 60, max: 89, label: "60–90m" }, { min: 90, label: "90m+" }], inRange: { color: ramp } },
      calendar: ranges.map((r, i) => ({ range: r, top: 26 + i * rowH, left: 40, cellSize: [cell, cell], splitLine: { show: false }, yearLabel: { show: ranges.length > 1, color: hex("muted") },
        itemStyle: { color: hex("grid"), borderColor: hex("surface"), borderWidth: 2 }, dayLabel: { firstDay: 1, color: hex("muted"), fontSize: 10, nameMap: ["S", "M", "T", "W", "T", "F", "S"] }, monthLabel: { color: hex("muted"), fontSize: 11 } })),
      series: ranges.map((r, i) => ({ type: "heatmap", coordinateSystem: "calendar", calendarIndex: i, data: data.filter(x => x[0] >= r[0] && x[0] <= r[1]) })),
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

  return { glanceCards, render };
})();
