// Sleep tab: glance cards (deep, total, wake-ups), trend explorer, stage mix, night detail, calendar.
OP.sleep = (() => {
  const { nights, segments, METRICS, mean, quantile, hm, clock, fmtVal, bigVal, axisFmt, hex, chart, axis, base, tipRow, glance,
    addDays, weekStart, fmtDay, iso, eventLines, dataEnd } = OP;
  const dayjsTs = d => dayjs(d).valueOf();

  // ---------- at a glance ----------
  const GLANCE = [
    { key: "deep", icon: "🌊", top: "border-t-blue-500", color: "text-blue-500" },
    { key: "wake", icon: "☀️", top: "border-t-amber-500", color: "text-amber-500", better: -1 }, // earlier is better here
    { key: "awake", icon: "👁️", top: "border-t-orange-500", color: "text-orange-500" },
  ];
  function glanceCards(targets) {
    return GLANCE.map(g => {
      const M = METRICS[g.key], st = glance(nights.map(n => ({ d: n.d, v: n[g.key] })), { ...M, better: g.better ?? M.better,
        dayText: g.key === "wake" ? d => `Woke ${fmtDay(addDays(d, 1))}` : d => `Night of ${fmtDay(d)}` });
      if (!st) return null;
      const [num, unit] = bigVal(st.last.v, M.unit);
      if (g.key === "wake") Object.assign(st.chart, { from: dayjs(addDays(st.last.d, -28)).format("D MMM"), to: dayjs(addDays(st.last.d, 1)).format("D MMM") });
      let label = `Last night · ${fmtDay(st.last.d)}`, sub = `Each dot is a night · 7-night average ${fmtVal(st.avg7, M.unit)}`;
      if (g.key === "wake") { // nights are labelled by the evening, so the wake-up is the next morning
        const [h, m] = targets.wakeBy.split(":").map(Number), last7 = nights.slice(-7);
        label = `Woke up · ${fmtDay(addDays(st.last.d, 1))}`;
        sub = `Each dot is a morning · ${last7.filter(n => n.wake - 720 <= h * 60 + m).length} of the last 7 by ${targets.wakeBy}`;
      }
      return { ...g, title: g.key === "wake" ? "Wake-up time" : M.label, num, unit, ...st, label, sub };
    }).filter(Boolean);
  }

  // ---------- grouping ----------
  const keyOf = (d, p) => (p === "month" ? d.slice(0, 7) : p === "week" ? weekStart(d) : d);
  const startOf = (k, p) => (p === "month" ? `${k}-01` : k);
  const labelOf = (k, p) => (p === "month" ? dayjs(`${k}-01`).format("MMM YYYY") : p === "week" ? `Week of ${dayjs(k).format("D MMM YYYY")}` : dayjs(k).format("ddd D MMM YYYY"));
  const MIN_N = { night: 1, week: 3, month: 10 };
  function grouped(list, key, p) {
    const m = new Map();
    for (const n of list) if (n[key] != null) (m.get(keyOf(n.d, p)) || m.set(keyOf(n.d, p), []).get(keyOf(n.d, p))).push(n[key]);
    return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => ({ k, x: dayjsTs(startOf(k, p)), v: mean(v), n: v.length }));
  }
  // time-based moving average (window in days) over nightly points
  function movingAvg(pts, days) {
    const out = []; let lo = 0, sum = 0;
    for (let i = 0; i < pts.length; i++) {
      sum += pts[i].v;
      while (pts[i].x - pts[lo].x >= days * 864e5) sum -= pts[lo++].v;
      out.push([pts[i].x, i - lo + 1 >= 3 ? sum / (i - lo + 1) : null]);
    }
    return out;
  }

  // gold markers for each year's best period (from all data) + subtle hollow high/low of what's plotted
  function marks(key, p, pts) {
    const M = METRICS[key], data = [];
    if (M.better && M.unit !== "clock") {
      const all = grouped(nights, key, p).filter(x => x.n >= MIN_N[p]);
      const bestByYear = new Map();
      for (const x of all) { const y = x.k.slice(0, 4), b = bestByYear.get(y); if (!b || M.better * x.v > M.better * b.v) bestByYear.set(y, x); }
      const inView = new Map(pts.map(x => [x.k, x]));
      for (const [y, b] of bestByYear) {
        const x = inView.get(b.k);
        if (x) data.push({ k: b.k, coord: [x.x, x.v], symbolSize: 13, itemStyle: { color: hex("record"), borderColor: hex("surface"), borderWidth: 2 },
          label: { show: true, formatter: `Best of ${y}`, position: "top", color: "#1a1405", fontSize: 11, fontWeight: 700, backgroundColor: hex("record"), padding: [2, 6], borderRadius: 4 } });
      }
    }
    const usable = pts.filter(x => x.v != null);
    if (usable.length >= 3) {
      const hi = usable.reduce((a, x) => (x.v > a.v ? x : a)), lo = usable.reduce((a, x) => (x.v < a.v ? x : a));
      for (const [x, word, pos] of [[hi, "High", "top"], [lo, "Low", "bottom"]]) {
        const rec = data.find(d => d.k === x.k);
        if (rec) { rec.label.formatter = `${word} · ${rec.label.formatter}`; continue; }
        data.push({ k: x.k, coord: [x.x, x.v], symbolSize: 9, itemStyle: { color: hex("surface"), borderColor: hex("ink2"), borderWidth: 1.5 },
          label: { show: true, formatter: `${word} ${fmtVal(x.v, M.unit)}`, position: pos, color: hex("ink2"), fontSize: 11 } });
      }
    }
    // keep labels inside the chart near the edges
    const xs = usable.map(x => x.x), span = (Math.max(...xs) - Math.min(...xs)) || 1;
    for (const d of data) { const f = (d.coord[0] - Math.min(...xs)) / span; if (f > 0.88) d.label.position = "left"; else if (f < 0.04) d.label.position = "right"; }
    return data.length ? { silent: true, symbol: "circle", data, z: 6 } : undefined;
  }

  // a selected week/month: which other periods fell in the same value bucket
  // ---------- fixed ranges per metric (base units; bed/wake are minutes after noon) ----------
  const RANGES = { deep: [30, 45, 60, 75], total: [300, 360, 420, 480], rem: [60, 90, 120], core: [180, 240, 300], awakeN: [5, 10, 15],
    awake: [10, 20, 40], eff: [85, 90, 95], bed: [660, 720, 780, 840], wake: [1155, 1200, 1260] };
  const rangeOf = (v, edges) => { let i = 0; while (i < edges.length && v >= edges[i]) i++; return i; };
  function rangeLabels(key) {
    const u = METRICS[key].unit, e = RANGES[key];
    const f = v => ({ dur: `${v / 60}h`, min: `${v}m`, pct: `${v}%`, clock: clock(v), ms: `${v} ms`, bpm: `${v} bpm` })[u] ?? `${v}`;
    const bare = v => (u === "clock" ? clock(v) : u === "dur" ? `${v / 60}` : `${v}`);
    return e.map((x, i) => {
      if (i === 0) return u === "clock" ? `before ${f(x)}` : u === "count" ? `0–${x - 1}` : `under ${f(x)}`;
      return u === "count" ? `${e[i - 1]}–${x - 1}` : `${bare(e[i - 1])}–${f(x)}`;
    }).concat(u === "clock" ? `after ${f(e.at(-1))}` : `${f(e.at(-1))}+`);
  }

  // a selected week/month: which other periods fell in the same range
  function selection(key, p, pts, k) {
    const M = METRICS[key], use = pts.filter(x => x.n >= MIN_N[p] || x.k === k), sel = use.find(x => x.k === k);
    if (!sel) return null;
    const edges = RANGES[key], i = rangeOf(sel.v, edges), vs = use.map(x => x.v);
    const lo = edges[i - 1] ?? Math.min(...vs), hi = edges[i] ?? Math.max(...vs); // open-ended ranges shade to the data's edge
    const members = use.filter(x => rangeOf(x.v, edges) === i), earlier = members.filter(x => x.k < k);
    const share = members.length / use.length;
    return { k, lo, hi, members: new Set(members.map(x => x.k)),
      title: `${labelOf(k, p)}: ${fmtVal(sel.v, M.unit)}`,
      text: `${rangeLabels(key)[i]} happened in ${members.length} of ${use.length} ${p}s in this range`,
      rarity: share < 0.1 ? "rare" : share < 0.25 ? "uncommon" : share < 0.5 ? "common" : "very common",
      last: earlier.length ? `Last time: ${labelOf(earlier.at(-1).k, p)}` : "First time in this range" };
  }

  // ---------- nights by range: share of nights in each range, per month (per week for short ranges) ----------
  function buckets(app, list, range) {
    const key = app.metric, M = METRICS[key], edges = RANGES[key], labels = rangeLabels(key), b = base();
    const p = dayjs(range[1]).diff(range[0], "day") <= 92 ? "week" : "month";
    const groups = new Map();
    for (const n of list) if (n[key] != null) {
      const k = keyOf(n.d, p), c = groups.get(k) || groups.set(k, new Array(labels.length).fill(0)).get(k);
      c[rangeOf(n[key], edges)]++;
    }
    const keys = [...groups.keys()].sort(), counts = keys.map(k => groups.get(k)), totals = counts.map(c => c.reduce((a, x) => a + x, 0));
    // strongest colour at the better end (earlier is better for bed and wake times)
    // grey at the worse end → the metric's colour at the better end (earlier is better for bed and wake times)
    const mix = (a, z, f) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - f) + parseInt(z.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
    const grey = OP.isDark() ? "#475569" : "#cbd5e1", better = M.better || -1;
    const colors = labels.map((_, i) => mix(grey, hex(key), i / (labels.length - 1)));
    if (better < 0) colors.reverse();
    const el = document.getElementById("bucketChart"), perRow = Math.max(1, Math.floor((el.clientWidth - 10) / 110));
    const legendRows = Math.ceil(labels.length / perRow);
    if (keys.length) {
      const c = counts.at(-1), top = c.indexOf(Math.max(...c)), k = keys.at(-1);
      const when = k === keyOf(dataEnd, p) || k === keyOf(OP.addDays(dataEnd, -1), p) ? `This ${p}` : p === "month" ? dayjs(`${k}-01`).format("MMM YYYY") : `Week of ${dayjs(k).format("D MMM")}`;
      app.bucketHint = `${when}: mostly ${labels[top]} (${c[top]} of ${totals.at(-1)} nights). Each column is a ${p}.`;
    } else app.bucketHint = "";
    const c1 = chart("bucketChart");
    c1.setOption({
      ...b, legend: { ...b.legend, type: "plain", data: labels }, grid: { ...b.grid, top: 30 + (legendRows - 1) * 22 },
      // no floating tooltip (it covered neighbouring columns): the hovered column's numbers show in a row above the chart
      tooltip: { ...b.tooltip, trigger: "axis", showContent: false, axisPointer: { type: "shadow" } },
      xAxis: axis({ type: "category", data: keys.map(k => (p === "month" ? dayjs(`${k}-01`).format("MMM YY") : dayjs(k).format("D MMM"))), splitLine: { show: false } }),
      yAxis: axis({ type: "value", max: 100, axisLabel: { color: hex("muted"), fontSize: 11, formatter: "{value}%" } }),
      series: labels.map((l, i) => ({ name: l, type: "bar", stack: "r", barMaxWidth: 36, emphasis: { focus: "series" },
        data: counts.map((c, j) => (totals[j] ? (c[i] / totals[j]) * 100 : 0)),
        itemStyle: { color: colors[i], borderColor: hex("surface"), borderWidth: 1 } })),
    }, true);
    const periodName = k => (p === "month" ? dayjs(`${k}-01`).format("MMM YYYY") : `Week of ${dayjs(k).format("D MMM")}`);
    app.bucketInfo = null;
    c1.off("updateAxisPointer"); c1.off("globalout");
    c1.on("updateAxisPointer", e => {
      const i = e.axesInfo?.[0]?.value;
      if (i == null || !keys[i]) return;
      app.bucketInfo = { title: `${periodName(keys[i])} · ${totals[i]} nights`,
        rows: labels.map((l, j) => ({ label: l, color: colors[j], text: `${totals[i] ? Math.round((counts[i][j] / totals[i]) * 100) : 0}% (${counts[i][j]})` })) };
    });
    c1.on("globalout", () => { app.bucketInfo = null; });
  }

  // ---------- trend ----------
  function trend(app, list, range) {
    const key = app.metric, M = METRICS[key], p = app.group, c = hex(key), b = base();
    const long = dayjs(range[1]).diff(range[0], "day") > 120;
    const nightly = list.filter(n => n[key] != null).map(n => ({ k: n.d, x: n.t, v: n[key], n: 1 }));
    const pts = p === "night" ? nightly : grouped(list, key, p);
    app.selection = p !== "night" && app.selPeriod ? selection(key, p, pts, app.selPeriod) : null;
    const sel = app.selection;
    const series = [];
    if (p === "night") {
      if (!long) series.push({ name: "Nights", type: "scatter", data: nightly.map(x => [x.x, x.v, x.k]), symbolSize: 6, itemStyle: { color: c, opacity: 0.45 } });
      series.push({ name: "14-day average", type: "line", data: movingAvg(nightly, 14), showSymbol: false, smooth: 0.2, lineStyle: { width: 2.5, color: c }, itemStyle: { color: c } });
    } else {
      series.push({ name: M.label, type: "line", z: 3, showSymbol: !!sel, smooth: 0.2, symbolSize: 7, lineStyle: { width: 2.5, color: c, opacity: sel ? 0.3 : 1 }, itemStyle: { color: c }, // dots only for a tapped range
        data: pts.map(x => {
          const v = [x.x, x.v, x.k];
          if (!sel) return v;
          const isSel = x.k === sel.k, inB = sel.members.has(x.k);
          return { value: v, symbolSize: isSel ? 15 : inB ? 11 : 0, itemStyle: { color: c, opacity: inB ? 1 : 0.3, borderColor: isSel ? hex("ink") : hex("surface"), borderWidth: isSel ? 3 : 2 } };
        }),
        markArea: sel ? { silent: true, itemStyle: { color: c, opacity: 0.12 }, data: [[{ yAxis: sel.lo }, { yAxis: sel.hi }]] } : undefined });
    }
    const plotted = p === "night" && long ? movingAvg(nightly, 14).map(([x, v], i) => ({ k: nightly[i].k, x, v })) : pts;
    series[0].markPoint = marks(key, p, plotted);
    const avg = mean(nightly.map(x => x.v));
    const evs = eventLines(range, e => (p === "night" ? dayjsTs(e.date) : dayjsTs(startOf(keyOf(e.date, p), p))), document.getElementById("trendChart").clientWidth);
    series[0].markLine = { symbol: "none", emphasis: { disabled: true }, data: [
      ...(avg != null ? [{ yAxis: avg, label: { formatter: `avg ${fmtVal(avg, M.unit)}`, position: "insideStartTop", color: hex("ink2") }, lineStyle: { color: hex("ink2"), type: "solid", width: 1, opacity: 0.6 } }] : []),
      ...evs,
    ] };
    const ys = plotted.map(x => x.v).filter(v => v != null);
    const c1 = chart("trendChart");
    c1.setOption({
      ...b, grid: { ...b.grid, top: 44 + Math.max(0, evs.rows - 1) * 22, right: 16 },
      legend: { ...b.legend, show: series.length > 1 },
      tooltip: { ...b.tooltip, trigger: p === "night" && !long ? "item" : "axis",
        formatter: x => {
          x = Array.isArray(x) ? x[0] : x;
          if (x.componentType === "markLine") return x.data.evDate ? `<b>${x.name}</b><br>Tap to compare before &amp; after` : "";
          const v = Array.isArray(x.value) ? x.value : x.data;
          const k = v[2] || OP.iso(v[0]);
          return `<b>${labelOf(k, p)}</b>${tipRow(c, x.seriesName, fmtVal(v[1], M.unit))}`;
        } },
      xAxis: axis({ type: "time", splitLine: { show: false } }),
      yAxis: axis({ type: "value", scale: true, axisLabel: { color: hex("muted"), fontSize: 11, formatter: axisFmt(M.unit) },
        ...(sel ? { min: v => Math.min(v.min, sel.lo), max: v => Math.max(v.max, sel.hi) } : {}),
        ...(ys.length ? {} : {}) }),
      series,
    }, true);
    // taps: event label → before/after; night dot → night detail; week/month → select nearest period
    c1.off("click");
    c1.on("click", x => {
      if (x.componentType === "markLine" && x.data?.evDate) { app.cmpEvent = x.data.evDate; app.skipTap = true; return; }
      const v = Array.isArray(x.value) ? x.value : x.data;
      if (p === "night" && v?.[2]) { app.showNight(v[2]); app.skipTap = true; }
    });
    const zr = c1.getZr();
    if (c1.__tap) zr.off("click", c1.__tap); // a bare off("click") would also remove ECharts' own handler
    c1.__tap = e => setTimeout(() => {
      if (app.skipTap) { app.skipTap = false; return; }
      if (p === "night" || !pts.length) return;
      const g = c1.getModel().getComponent("grid").coordinateSystem.getRect();
      if (e.offsetX < g.x - 16 || e.offsetX > g.x + g.width + 24 || e.offsetY < g.y - 8 || e.offsetY > g.y + g.height + 8) return;
      const tx = c1.convertFromPixel({ xAxisIndex: 0 }, e.offsetX);
      const near = pts.reduce((a, x) => (Math.abs(x.x - tx) < Math.abs(a.x - tx) ? x : a));
      app.selPeriod = app.selPeriod === near.k ? null : near.k;
    }, 0);
    zr.on("click", c1.__tap);
  }

  // ---------- stage mix (monthly % of time asleep) ----------
  function mix(list) {
    const m = new Map();
    for (const n of list) (m.get(n.d.slice(0, 7)) || m.set(n.d.slice(0, 7), []).get(n.d.slice(0, 7))).push(n);
    const months = [...m.keys()].sort(), stages = ["deep", "core", "rem", "unspecified"], b = base();
    const pct = months.map(k => { const g = m.get(k), tot = g.reduce((s, n) => s + n.total, 0); return Object.fromEntries(stages.map(s => [s, tot ? (g.reduce((a, n) => a + n[s], 0) / tot) * 100 : 0])); });
    const shown = stages.filter(s => s !== "unspecified" || pct.some(x => x.unspecified > 0.5));
    chart("mixChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "axis", formatter: ps => `<b>${dayjs(months[ps[0].dataIndex] + "-01").format("MMM YYYY")}</b>` + ps.map(x => tipRow(x.color, x.seriesName, `${x.value.toFixed(0)}%`)).reverse().join("") },
      xAxis: axis({ type: "category", boundaryGap: false, data: months.map(k => dayjs(k + "-01").format("MMM YY")), splitLine: { show: false } }),
      yAxis: axis({ type: "value", max: 100, axisLabel: { color: hex("muted"), fontSize: 11, formatter: "{value}%" } }),
      series: shown.map(s => ({ name: METRICS[s]?.label || "Unspecified", type: "line", stack: "mix", symbol: "none", smooth: 0.15, data: pct.map(x => x[s]),
        lineStyle: { width: 1.5, color: hex("surface") }, areaStyle: { color: hex(s), opacity: 0.9 }, itemStyle: { color: hex(s) } })),
    }, true);
  }

  // ---------- night detail ----------
  const SEG = ["awake", "rem", "core", "deep", "unspecified"]; // codes from sleepdata.py
  function nightStats(d) {
    const n = nights.find(x => x.d === d);
    if (!n) return [];
    const pct = v => (n.total ? `${Math.round((v / n.total) * 100)}%` : "–");
    return [["Asleep", hm(n.total)], ["In bed", hm(n.inbed)], ["Bed", clock(n.bed)], ["Up", clock(n.wake)],
      ["Deep", `${hm(n.deep)} (${pct(n.deep)})`], ["REM", `${hm(n.rem)} (${pct(n.rem)})`], ["Core", `${hm(n.core)} (${pct(n.core)})`],
      ["Wake-ups", `${n.awakeN} · ${hm(n.awake)}`], ["Efficiency", n.eff == null ? "–" : `${n.eff.toFixed(0)}%`]];
  }
  function hypnogram(d) {
    const segs = (segments[d] || []).slice().sort((a, b) => a[0] - b[0]);
    const rows = ["deep", "core", "rem", "awake"];
    if (segs.some(s => SEG[s[2]] === "unspecified")) rows.splice(2, 0, "unspecified");
    const noon = dayjsTs(d) + 12 * 3600e3, b = base();
    const data = segs.map(s => ({ value: [rows.indexOf(SEG[s[2]]), noon + s[0] * 6e4, noon + (s[0] + s[1]) * 6e4, s[1]], itemStyle: { color: hex(SEG[s[2]]) }, stage: SEG[s[2]] }))
      .filter(x => x.value[0] >= 0);
    const xs = data.flatMap(x => [x.value[1], x.value[2]]);
    chart("hypChart").setOption({
      ...b, grid: { ...b.grid, top: 8 },
      tooltip: { ...b.tooltip, formatter: x => `${tipRow(hex(x.data.stage), METRICS[x.data.stage]?.label || "Unspecified", hm(x.value[3]))}<span style="color:${hex("muted")}">${dayjs(x.value[1]).format("HH:mm")} – ${dayjs(x.value[2]).format("HH:mm")}</span>` },
      xAxis: axis({ type: "time", min: Math.min(...xs), max: Math.max(...xs), axisLabel: { color: hex("muted"), fontSize: 11, formatter: v => dayjs(v).format("HH:mm") } }),
      yAxis: axis({ type: "category", data: rows.map(r => ({ deep: "Deep", core: "Core", rem: "REM", awake: "Awake", unspecified: "Unspec." })[r]), splitLine: { show: false }, axisLine: { show: false } }),
      series: [{ type: "custom", data, encode: { x: [1, 2], y: 0 },
        renderItem: (params, api) => {
          const y = api.coord([api.value(1), api.value(0)])[1], x1 = api.coord([api.value(1), 0])[0], x2 = api.coord([api.value(2), 0])[0], h = api.size([0, 1])[1] * 0.62;
          return { type: "rect", shape: { x: x1, y: y - h / 2, width: Math.max(1.5, x2 - x1 - 1), height: h, r: 3 }, style: api.style() };
        } }],
    }, true);
  }

  // ---------- more: calendar heatmap + by weekday ----------
  function calendar(app, list, range) {
    const key = app.metric, M = METRICS[key], b = base();
    const from = list[0]?.d, to = list.at(-1)?.d;
    if (!from) return;
    const el = document.getElementById("calChart"), years = [...new Set(list.map(n => n.d.slice(0, 4)))];
    const ranges = dayjs(to).diff(from, "day") <= 371 ? [[from, to]] : years.map(y => [y === from.slice(0, 4) ? from : `${y}-01-01`, y === to.slice(0, 4) ? to : `${y}-12-31`]);
    const weeks = Math.min(53, Math.ceil(dayjs(ranges[0][1]).diff(ranges[0][0], "day") / 7) + 2);
    const cell = Math.max(8, Math.min(22, (el.clientWidth - 50) / weeks)), rowH = cell * 7 + 46;
    el.style.height = `${ranges.length * rowH + 50}px`;
    const c1 = chart("calChart"); c1.resize();
    const data = list.filter(n => n[key] != null).map(n => [n.d, n[key]]), vs = data.map(x => x[1]).sort((a, b2) => a - b2);
    const ramp = OP.isDark() ? ["#13325e", "#1c5cab", "#2a78d6", "#5598e7", "#cde2fb"] : ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
    c1.setOption({
      ...b, tooltip: { ...b.tooltip, formatter: x => `<b>${fmtDay(x.data[0])}</b><br>${M.label}: <b>${fmtVal(x.data[1], M.unit)}</b>` },
      visualMap: { type: "continuous", seriesIndex: ranges.map((_, i) => i), min: quantile(vs, 0.03), max: quantile(vs, 0.97), orient: "horizontal", left: "center", bottom: 0,
        itemHeight: 200, itemWidth: 10, inRange: { color: M.better < 0 ? [...ramp].reverse() : ramp }, textStyle: { color: hex("muted") }, formatter: v => fmtVal(v, M.unit) },
      calendar: ranges.map((r, i) => ({ range: r, top: 26 + i * rowH, left: 40, cellSize: [cell, cell], splitLine: { show: false },
        itemStyle: { color: hex("grid"), borderColor: hex("surface"), borderWidth: 2 }, yearLabel: { show: ranges.length > 1, color: hex("muted") },
        dayLabel: { firstDay: 1, color: hex("muted"), fontSize: 10, nameMap: ["S", "M", "T", "W", "T", "F", "S"] }, monthLabel: { color: hex("muted"), fontSize: 11 } })),
      series: ranges.map((r, i) => ({ type: "heatmap", coordinateSystem: "calendar", calendarIndex: i, data: data.filter(x => x[0] >= r[0] && x[0] <= r[1]) })),
    }, true);
    c1.off("click"); c1.on("click", x => x.data && app.showNight(x.data[0]));
    // by night of the week: average with spread in the tooltip
    const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const by = DOW.map((_, i) => { const v = list.filter(n => n.dow === i && n[key] != null).map(n => n[key]).sort((a, b2) => a - b2); return { m: mean(v), q1: quantile(v, 0.25), q3: quantile(v, 0.75), n: v.length }; });
    chart("dowChart").setOption({
      ...b, tooltip: { ...b.tooltip, trigger: "axis", formatter: ps => { const s = by[ps[0].dataIndex]; return `<b>${DOW[ps[0].dataIndex]} nights · ${s.n}</b>${tipRow(hex(key), "Average", fmtVal(s.m, M.unit))}<span style="color:${hex("muted")}">middle half ${fmtVal(s.q1, M.unit)} – ${fmtVal(s.q3, M.unit)}</span>`; } },
      xAxis: axis({ type: "category", data: DOW, splitLine: { show: false } }),
      yAxis: axis({ type: "value", scale: M.unit === "clock", axisLabel: { color: hex("muted"), fontSize: 11, formatter: axisFmt(M.unit) } }),
      series: [{ type: "bar", data: by.map(s => s.m), barMaxWidth: 28, itemStyle: { color: hex(key), borderRadius: [4, 4, 0, 0] } }],
    }, true);
  }

  // ---------- before & after an event (e.g. "New mattress") ----------
  const CMP = ["total", "deep", "rem", "awakeN", "eff", "hrv", "rhr"];
  function compare(date) {
    const ev = OP.events.list.find(e => e.date === date);
    if (!ev || date <= nights[0].d || date > dataEnd) return null;
    const days = Math.min(90, dayjs(dataEnd).diff(date, "day"));
    const after = nights.filter(n => n.d >= date && n.d < addDays(date, days)), before = nights.filter(n => n.d < date && n.d >= addDays(date, -days));
    return { title: `Since ${ev.label}`, hint: `Average of the ${after.length} nights since ${fmtDay(date)} vs the ${before.length} nights in the ${days} days before.`,
      tiles: CMP.map(k => {
        const M = METRICS[k], a = mean(after.map(n => n[k]).filter(v => v != null)), bv = mean(before.map(n => n[k]).filter(v => v != null));
        const d = a != null && bv != null ? a - bv : null, rel = d != null && bv ? (d / Math.abs(bv)) * 100 : null;
        return { label: M.label, value: fmtVal(a, M.unit), from: fmtVal(bv, M.unit),
          change: rel == null ? "" : `${d > 0 ? "▲ +" : d < 0 ? "▼ −" : ""}${Math.abs(rel).toFixed(1)}%`, good: d != null && M.better * d > 0 };
      }) };
  }

  const METRIC_OPTIONS = ["deep", "total", "rem", "core", "awakeN", "awake", "eff", "bed", "wake"];
  return { glanceCards, trend, buckets, mix, nightStats, hypnogram, calendar, compare, METRIC_OPTIONS, labelOf };
})();
