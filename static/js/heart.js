// Heart tab: daily HRV (all readings that day), resting HR and walking HR.
OP.heart = (() => {
  const { daily, METRICS, mean, quantile, fmtVal, bigVal, hex, chart, axis, base, tipRow, glance, fmtDay, eventLines } = OP;
  const KEYS = [
    { key: "hrv", icon: "💓", top: "border-t-pink-500", bar: "fill-pink-500", chart: "hrvChart" },
    { key: "rhr", icon: "❤️", top: "border-t-red-500", bar: "fill-red-500", chart: "rhrChart" },
    { key: "walkHr", icon: "🚶", top: "border-t-orange-500", bar: "fill-orange-500", chart: "walkHrChart" },
  ];

  function glanceCards() {
    return KEYS.map(k => {
      const M = METRICS[k.key], st = glance(daily.map(r => ({ d: r.d, v: r[k.key] })), M);
      if (!st) return null;
      const [num, unit] = bigVal(st.avg7, M.unit);
      return { ...k, title: M.label, num, unit, ...st, label: `7-day average · latest ${fmtDay(st.last.d)}`,
        sub: st.usual != null ? `Your usual: ${fmtVal(st.usual, M.unit)}${M.better < 0 ? " · lower is better" : " · higher is better"}` : "" };
    }).filter(Boolean);
  }

  // daily values; long ranges show a weekly average line instead of dots
  function render(app, range) {
    const rows = daily.filter(r => r.d >= range[0] && r.d <= range[1]);
    const long = dayjs(range[1]).diff(range[0], "day") > 120;
    for (const k of KEYS) {
      const M = METRICS[k.key], c = hex(k.key), b = base(), pts = rows.filter(r => r[k.key] != null);
      let data, series;
      if (long) {
        const wk = new Map();
        for (const r of pts) { const w = OP.weekStart(r.d); (wk.get(w) || wk.set(w, []).get(w)).push(r[k.key]); }
        data = [...wk].sort().map(([w, v]) => [dayjs(w).valueOf(), mean(v), w]);
        series = [{ name: "Weekly average", type: "line", data, showSymbol: false, smooth: 0.25, lineStyle: { width: 2.5, color: c }, itemStyle: { color: c } }];
      } else {
        data = pts.map(r => [r.t, r[k.key], r.d]);
        series = [{ name: "Days", type: "scatter", data, symbolSize: 6, itemStyle: { color: c, opacity: 0.5 } },
          { name: "7-day average", type: "line", showSymbol: false, smooth: 0.2, lineStyle: { width: 2.5, color: c }, itemStyle: { color: c },
            data: pts.map((r, i) => [r.t, mean(pts.slice(Math.max(0, i - 6), i + 1).map(x => x[k.key]))]) }];
      }
      // your normal range: the middle half of days in view
      const s = pts.map(r => r[k.key]).sort((a, b2) => a - b2);
      if (s.length > 10) series[0].markArea = { silent: true, itemStyle: { color: c, opacity: 0.08 }, data: [[{ yAxis: quantile(s, 0.25) }, { yAxis: quantile(s, 0.75) }]] };
      const evs = eventLines(range, undefined, document.getElementById(k.chart).clientWidth);
      series[0].markLine = { symbol: "none", emphasis: { disabled: true }, data: evs };
      const c1 = chart(k.chart);
      c1.setOption({
        ...b, grid: { ...b.grid, top: (series.length > 1 ? 36 : 24) + Math.max(0, evs.rows - 1) * 22 }, legend: { ...b.legend, show: series.length > 1 },
        tooltip: { ...b.tooltip, trigger: "item", formatter: x => {
          if (x.componentType === "markLine") return x.data.evDate ? `<b>${x.name}</b><br>Tap to compare before &amp; after` : "";
          const v = Array.isArray(x.value) ? x.value : x.data;
          return `<b>${v[2] ? (long ? "Week of " + dayjs(v[2]).format("D MMM") : fmtDay(v[2])) : fmtDay(OP.iso(v[0]))}</b>${tipRow(c, x.seriesName, fmtVal(v[1], M.unit))}`;
        } },
        xAxis: axis({ type: "time", splitLine: { show: false } }),
        yAxis: axis({ type: "value", scale: true }),
        series,
      }, true);
      c1.off("click");
      c1.on("click", x => { if (x.componentType === "markLine" && x.data?.evDate) app.cmpEvent = x.data.evDate; });
      if (k.key === "hrv") app.hrvRange = s.length > 10 ? `${fmtVal(quantile(s, 0.25), "ms")} – ${fmtVal(quantile(s, 0.75), "ms")}` : "";
    }
  }

  return { glanceCards, render };
})();
