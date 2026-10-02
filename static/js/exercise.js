// Exercise tab: status banner, glance cards (this week, last 4 weeks, since your last workout) and charts. Walks are left out unless toggled on.
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

  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const pretty = t => ({ TraditionalStrengthTraining: "Strength", FunctionalStrengthTraining: "Functional strength", HighIntensityIntervalTraining: "HIIT" })[t] || t.replace(/([a-z])([A-Z])/g, "$1 $2");
  const train = () => workouts.filter(x => x.group !== "walking");
  const trainedDays = (from, to) => new Set(train().filter(x => x.d >= from && x.d <= to).map(x => x.d));
  const TONE = { good: "#10b981", warn: "#f59e0b", bad: "#f43f5e" };

  // where you stand, for the banner and the cards. "Today" is the last day in the export.
  function status(gymDays) {
    const all = train(), days = [...new Set(all.map(x => x.d))].sort(), last = days.at(-1);
    const since = last ? dayjs(dataEnd).diff(last, "day") : null;
    const last4 = trainedDays(addDays(dataEnd, -27), dataEnd).size;
    // normal: training days per 4 weeks over the 6 months before the last 4 weeks
    const normal4 = Math.round((trainedDays(addDays(dataEnd, -27 - 182), addDays(dataEnd, -28)).size / 26) * 4);
    const cur = weeks(1)[0], prev = weeks(2)[0];
    const daysLeft = dayjs(addDays(cur.w, 6)).diff(dataEnd, "day") + (trainedDays(dataEnd, dataEnd).size ? 0 : 1);
    const typical = Math.round(OP.quantile(all.filter(x => x.d > addDays(dataEnd, -365)).map(x => x.dur).sort((a, b) => a - b), 0.5) || 0);
    const weekend = OP.dow(dataEnd) >= 4; // Fri–Sun: point to Monday as a fresh start
    let state, title, text;
    if (since == null || since >= 4 || last4 < normal4 / 2) {
      state = "behind";
      title = since == null ? "No workouts yet" : `${plural(since, "day")} since your last workout`;
      text = `${plural(last4, "training day")} in the last 4 weeks. You normally do about ${normal4}. ` +
        (weekend ? "Train today if you can, or make Monday your fresh start." : "Never miss twice: train today or tomorrow.") +
        ` Even 20 minutes counts; your typical session is ${typical} min.`;
    } else if (prev.days < gymDays) {
      state = "slipping";
      title = `Last week: ${prev.days} of ${gymDays} days`;
      text = `Get back to ${gymDays} this week: ${plural(Math.max(0, gymDays - cur.days), "more day")} by Sunday.`;
    } else {
      state = "ontrack";
      title = cur.days >= gymDays ? `${cur.days} of ${gymDays} days this week ✓` : `${cur.days} of ${gymDays} days this week`;
      text = cur.days >= gymDays ? "Target hit. Anything more is a bonus." : `${plural(gymDays - cur.days, "more day")} by Sunday keeps you on track.`;
    }
    return { state, title, text, since, last, last4, normal4, cur, daysLeft,
      stale: dayjs(OP.today).diff(dataEnd, "day") >= 3 ? `Based on your export up to ${fmtDay(dataEnd)}. Upload a new one for today's picture.` : "" };
  }

  function glanceCards(gymDays) {
    const S = status(gymDays), W12 = weeks(12), cur = S.cur, needed = gymDays - cur.days;
    const toneOf = x => (x.current ? null : x.days >= gymDays ? "good" : x.days > 0 ? "warn" : "bad");
    // this week, Mon–Sun
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(cur.w, i), done = trainedDays(d, d).size > 0;
      return { d, label: "MTWTFSS"[i], s: done ? "done" : d > dataEnd ? "future" : d === dataEnd ? "today" : "miss" };
    });
    // the last 30 days
    const month = Array.from({ length: 30 }, (_, i) => { const d = addDays(dataEnd, i - 29); return { d, s: trainedDays(d, d).size ? "done" : "miss" }; });
    // longest break this year
    const yearDays = [...trainedDays(`${dataEnd.slice(0, 4)}-01-01`, dataEnd)].sort();
    let gap = null;
    for (let i = 1; i < yearDays.length; i++) { const g = dayjs(yearDays[i]).diff(yearDays[i - 1], "day"); if (!gap || g > gap.n) gap = { n: g, from: yearDays[i - 1], to: yearDays[i] }; }
    if (S.since != null && (!gap || S.since > gap.n)) gap = { n: S.since, from: S.last, to: null };
    const gaps = yearDays.slice(1).map((d, i) => dayjs(d).diff(yearDays[i], "day")).sort((a, b) => a - b);
    const lastW = train().filter(x => x.d === S.last), drop = S.normal4 ? Math.round((1 - S.last4 / S.normal4) * 100) : 0;
    const ratio = S.normal4 ? S.last4 / S.normal4 : 1;
    return [
      { key: "week", icon: "📅", title: "This week", top: "border-t-emerald-500", color: "text-emerald-500", num: `${cur.days} of ${gymDays}`, unit: "days",
        tone: needed > 0 && needed > S.daysLeft ? "bad" : needed > 0 ? "warn" : null,
        label: `Week of ${dayjs(cur.w).format("ddd D MMM")} · up to ${fmtDay(dataEnd)}`, strip: week,
        trend: needed <= 0 ? { text: "✓ Target hit this week", good: true }
          : needed > S.daysLeft ? { text: `${plural(S.daysLeft, "day")} left: the most you can still get is ${cur.days + S.daysLeft}`, tone: "bad" }
          : { text: `${plural(needed, "more day")} needed · ${plural(S.daysLeft, "day")} left`, tone: "warn" },
        sub: "Green: trained · outlined: latest day in your data", badge: null },
      { key: "last4", icon: "📉", title: "Last 4 weeks", top: "border-t-blue-500", color: "text-blue-500", num: `${S.last4}`, unit: S.last4 === 1 ? "training day" : "training days",
        tone: ratio < 0.5 ? "bad" : ratio < 0.9 ? "warn" : null,
        label: `You normally do about ${S.normal4} in 4 weeks`,
        chart: { ...bars(W12, "days", "count", gymDays, `target ${gymDays}`, x => plural(x.days, "training day")) },
        trend: ratio >= 0.9 ? { text: "✓ At or above your normal", good: true } : { text: `↓ ${drop}% below your normal`, tone: ratio < 0.5 ? "bad" : "warn" },
        sub: "Each bar is a week: green hit the target, amber some, red none", badge: null },
      { key: "since", icon: "⏳", title: "Since your last workout", top: "border-t-rose-500", color: "text-rose-500",
        num: S.since == null ? "–" : S.since === 0 ? "Today" : `${S.since}`, unit: S.since > 0 ? (S.since === 1 ? "day" : "days") : "",
        tone: S.since >= 4 ? "bad" : S.since >= 2 ? "warn" : null,
        label: lastW.length ? `Last: ${fmtDay(S.last)} · ${lastW.map(x => `${pretty(x.type)} ${hm(x.dur)}`).join(", ")}` : "No workouts yet", strip: month,
        trend: gap ? { text: `Longest break this year: ${gap.n} days (${dayjs(gap.from).format("D MMM")} – ${gap.to ? dayjs(gap.to).format("D MMM") : "now"})`, tone: S.since >= 4 ? "bad" : null } : { text: "", good: false },
        sub: `The last 30 days · ${!gaps.length ? "" : gaps[Math.floor(gaps.length / 2)] <= 1 ? "you usually train on back-to-back days" : `you usually train every ${gaps[Math.floor(gaps.length / 2)]} days`}`, badge: null },
    ].map(g => (g.chart ? { ...g, chart: { ...g.chart, points: g.chart.points.map((p, i) => ({ ...p, tone: toneOf(W12[i]) })) } } : g));
  }

  // ---------- charts ----------
  function render(app, range) {
    const ws = workouts.filter(w => (app.walks || w.group !== "walking") && w.d >= range[0] && w.d <= range[1]);
    calendar(ws, range);
    weekly(app, ws, range);
    timeOfDay(ws);
    weekdays(ws);
    monthly(app);
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

  // training days per month, last 18 months, against the target (gymDays a week ≈ per month)
  function monthly(app) {
    const months = Array.from({ length: 18 }, (_, i) => dayjs(dataEnd).subtract(17 - i, "month").format("YYYY-MM"));
    const counts = months.map(m => new Set(train().filter(x => x.d.startsWith(m)).map(x => x.d)).size);
    const target = Math.round((app.targets.gymDays * 365.25) / 12 / 7), cur = months.at(-1), b = base();
    chart("exMonthChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "item", formatter: x => `<b>${dayjs(months[x.dataIndex] + "-01").format("MMMM YYYY")}${months[x.dataIndex] === cur ? " (so far)" : ""}</b><br>${plural(x.value, "training day")} · target about ${target}` },
      xAxis: axis({ type: "category", data: months.map(m => dayjs(m + "-01").format("MMM YY")), splitLine: { show: false } }),
      yAxis: axis({ type: "value", minInterval: 1, max: v => Math.max(v.max, target + 2) }),
      series: [{ type: "bar", barMaxWidth: 28,
        data: counts.map((v, i) => ({ value: v, itemStyle: { borderRadius: [4, 4, 0, 0],
          color: months[i] === cur ? hex("muted") : v >= target ? TONE.good : v >= target / 2 ? TONE.warn : TONE.bad, opacity: months[i] === cur ? 0.6 : 0.9 } })),
        label: { show: true, position: "top", color: hex("ink2"), fontSize: 10 },
        markLine: { symbol: "none", silent: true, data: [{ yAxis: target, label: { show: false }, lineStyle: { color: hex("ink2"), type: [5, 4] } }] } }], // the hint names the target
    }, true);
  }

  return { glanceCards, status, render, TONE };
})();
