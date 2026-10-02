// One Percent: shared data, formatting, colours and chart helpers. Everything lives on window.OP.
window.OP = (() => {
  dayjs.extend(window.dayjs_plugin_isoWeek);
  const { data: DATA, config: APP } = JSON.parse(document.getElementById("op-data").textContent);

  // ---------- dates (ISO yyyy-mm-dd strings throughout) ----------
  const iso = x => dayjs(x).format("YYYY-MM-DD");
  const addDays = (d, n) => dayjs(d).add(n, "day").format("YYYY-MM-DD");
  const weekStart = d => dayjs(d).startOf("isoWeek").format("YYYY-MM-DD");
  const dow = d => dayjs(d).isoWeekday() - 1; // Monday = 0
  const fmtDay = d => dayjs(d).format("ddd D MMM");
  const today = APP.today || iso(new Date());

  // ---------- data ----------
  const ASLEEP = ["deep", "core", "rem", "unspecified"];
  const nights = DATA.nights.map(n => {
    const total = ASLEEP.reduce((s, k) => s + n[k], 0), inbed = n.wake - n.bed;
    return { ...n, total, inbed, eff: inbed > 0 ? Math.min(100, (total / inbed) * 100) : null, t: dayjs(n.d).valueOf(), dow: dow(n.d) };
  });
  const workouts = (DATA.workouts || []).map(([d, start, dur, type, group]) => ({ d, start, dur, type, group, t: dayjs(d).valueOf() }));
  const daily = (DATA.daily || []).map(r => ({ ...r, t: dayjs(r.d).valueOf() }));
  const segments = DATA.segments || {};
  const dataEnd = addDays(nights.at(-1).d, 1); // morning after the latest night = when the export was made
  const first = nights[0].d, last = nights.at(-1).d;

  // ---------- numbers & formatting ----------
  const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const quantile = (s, q) => { if (!s.length) return null; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
  const hm = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`; };
  const clock = afterNoon => { const m = (((Math.round(afterNoon) + 720) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

  // what each metric means: unit decides formatting, better = +1 higher is better, -1 lower, 0 neither
  const METRICS = {
    deep: { label: "Deep sleep", unit: "min", better: 1 },
    total: { label: "Total sleep", unit: "dur", better: 1 },
    rem: { label: "REM sleep", unit: "min", better: 1 },
    core: { label: "Core sleep", unit: "dur", better: 0 },
    awake: { label: "Time awake", unit: "min", better: -1 },
    awakeN: { label: "Wake-ups", unit: "count", better: -1 },
    eff: { label: "Efficiency", unit: "pct", better: 1 },
    bed: { label: "Bedtime", unit: "clock", better: 0 },
    wake: { label: "Wake time", unit: "clock", better: 0 },
    hrv: { label: "HRV", unit: "ms", better: 1 },
    rhr: { label: "Resting HR", unit: "bpm", better: -1 },
    walkHr: { label: "Walking HR", unit: "bpm", better: -1 },
  };
  const fmtVal = (v, unit) => {
    if (v == null || Number.isNaN(v)) return "–";
    return { min: `${Math.round(v)} min`, dur: hm(v), count: `${+v.toFixed(1)}`, pct: `${v.toFixed(0)}%`, clock: clock(v), ms: `${Math.round(v)} ms`, bpm: `${Math.round(v)} bpm` }[unit] ?? String(v);
  };
  // big number + small unit for glance cards
  const bigVal = (v, unit) => {
    if (v == null) return ["–", ""];
    return { min: [Math.round(v), "min"], dur: [hm(v), ""], count: [+v.toFixed(1), ""], pct: [v.toFixed(0), "%"], ms: [Math.round(v), "ms"], bpm: [Math.round(v), "bpm"] }[unit] ?? [fmtVal(v, unit), ""];
  };
  const fmtDiff = (d, unit) => {
    const a = Math.abs(d);
    return { min: `${Math.round(a)} min`, dur: hm(a), clock: `${Math.round(a)} min`, count: `${+a.toFixed(1)}`, pct: `${a.toFixed(1)} pts`, ms: `${Math.round(a)} ms`, bpm: `${+a.toFixed(1)} bpm` }[unit];
  };
  const axisFmt = unit => v => ({ dur: `${+(v / 60).toFixed(1)}h`, clock: clock(v), pct: `${v}%`, min: `${v}m` })[unit] ?? v;

  // ---------- colours: hex for charts (light / dark) ----------
  const isDark = () => document.documentElement.classList.contains("dark");
  const HEX = {
    light: { deep: "#2a78d6", core: "#1baf7a", rem: "#4a3aa7", unspecified: "#898781", awake: "#eb6834", total: "#eda100", awakeN: "#eb6834",
      eff: "#e87ba4", bed: "#e87ba4", wake: "#e87ba4", hrv: "#e87ba4", rhr: "#e34948", walkHr: "#eb6834",
      strength: "#2a78d6", running: "#eb6834", cardio: "#1baf7a", walking: "#eda100",
      ink: "#0f172a", ink2: "#475569", muted: "#94a3b8", grid: "#e2e8f0", axis: "#cbd5e1", surface: "#ffffff", record: "#b7791f", accent: "#2563eb",
      speech: "#7c3aed", speechNew: "#7c3aed", speechRepeat: "#c4b5fd", morning: "#eda100" },
    dark: { deep: "#3987e5", core: "#199e70", rem: "#9085e9", unspecified: "#898781", awake: "#d95926", total: "#c98500", awakeN: "#d95926",
      eff: "#d55181", bed: "#d55181", wake: "#d55181", hrv: "#d55181", rhr: "#e66767", walkHr: "#d95926",
      strength: "#3987e5", running: "#d95926", cardio: "#199e70", walking: "#c98500",
      ink: "#f1f5f9", ink2: "#cbd5e1", muted: "#64748b", grid: "#1e293b", axis: "#334155", surface: "#0f172a", record: "#f2b705", accent: "#3b82f6",
      speech: "#9d7cf0", speechNew: "#9d7cf0", speechRepeat: "#4c3d8f", morning: "#c98500" },
  };
  const hex = k => HEX[isDark() ? "dark" : "light"][k] || HEX.light.accent;

  // ---------- charts ----------
  const charts = {};
  function chart(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (charts[id] && charts[id].getDom() !== el) { charts[id].dispose(); delete charts[id]; }
    return (charts[id] ||= echarts.init(el, null, { renderer: "canvas" }));
  }
  const resetCharts = () => { for (const k in charts) { charts[k].dispose(); delete charts[k]; } };
  window.addEventListener("resize", () => Object.values(charts).forEach(c => c.resize()));
  const axis = (extra = {}) => ({
    axisLine: { lineStyle: { color: hex("axis") } }, axisTick: { show: false },
    axisLabel: { color: hex("muted"), fontSize: 11, hideOverlap: true }, splitLine: { lineStyle: { color: hex("grid") } }, ...extra,
  });
  const base = () => ({
    backgroundColor: "transparent", animationDuration: 300,
    textStyle: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: hex("ink2") },
    grid: { left: 4, right: 12, top: 30, bottom: 4, containLabel: true },
    legend: { type: "scroll", top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: hex("ink2") } },
    tooltip: { backgroundColor: hex("surface"), borderColor: hex("axis"), textStyle: { color: hex("ink"), fontSize: 12.5 }, extraCssText: "border-radius:10px;" },
  });
  const tipRow = (color, label, value) =>
    `<div style="display:flex;justify-content:space-between;gap:14px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:6px"></i>${label}</span><b>${value}</b></div>`;

  // ---------- events (e.g. "New mattress"): saved on the server ----------
  const events = { list: APP.events || [] };
  // vertical lines for events in range. Labels that would collide move up a row (pass the chart width in px);
  // the returned array's .rows says how many rows were used, so charts can make room at the top.
  function eventLines(range, toX = e => dayjs(e.date).valueOf(), width = 900) {
    const a = dayjs(range[0]).valueOf(), span = dayjs(range[1]).valueOf() - a || 1, plot = width - 70, ends = [];
    const out = events.list.filter(e => e.date >= range[0] && e.date <= range[1]).sort((x, y) => (x.date < y.date ? -1 : 1)).map(e => {
      const x = 50 + ((dayjs(e.date).valueOf() - a) / span) * plot, w = e.label.length * 6.6 + 12;
      const align = x + w / 2 > width - 4 ? "right" : x - w / 2 < 4 ? "left" : "center"; // keep labels inside the chart
      const left = align === "right" ? x - w : align === "left" ? x : x - w / 2;
      let row = ends.findIndex(end => end < left - 4);
      if (row < 0) row = ends.length;
      ends[row] = left + w;
      return {
        xAxis: toX(e), evDate: e.date, name: e.label,
        lineStyle: { color: hex("ink2"), type: "solid", width: 1, opacity: 0.7 },
        label: { formatter: e.label, position: "end", align, distance: 5 + row * 22, color: hex("ink"), fontSize: 11, fontWeight: 600, backgroundColor: hex("grid"), padding: [3, 6], borderRadius: 4 },
      };
    });
    out.rows = ends.length;
    return out;
  }

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401) { location.href = "/login"; throw new Error("signed out"); }
    if (!r.ok) throw new Error(`server ${r.status}`);
    return r.json();
  }

  // ---------- "at a glance" statistics for a dated series ----------
  // points: [{d, v}] sorted by date. Latest 7 values vs the 28 before ("your usual"); 30-day mini bars; record badge.
  function glance(points, { unit, better, spanDays = 30, dayText, avgLine = false }) {
    const vals = points.filter(p => p.v != null);
    if (!vals.length) return null;
    const lastP = vals.at(-1);
    const recent = vals.slice(-7), prior = vals.slice(-35, -7);
    const avg7 = mean(recent.map(p => p.v)), usual = prior.length >= 7 ? mean(prior.map(p => p.v)) : null;
    let trend = { text: "Building your baseline", good: false };
    if (usual != null) {
      const diff = avg7 - usual, rel = usual ? diff / Math.abs(usual) : 0;
      if (unit === "clock") { // times of day: earlier / later, steady within 5 minutes
        const word = `${Math.round(Math.abs(diff))} min ${diff < 0 ? "earlier" : "later"} than usual`;
        trend = Math.abs(diff) < 5 ? { text: "Steady at your usual", good: false }
          : better && Math.sign(diff) === better ? { text: `${diff < 0 ? "↑" : "↓"} ${word}`, good: true } : { text: word, good: false };
      } else if (Math.abs(rel) < 0.03) trend = { text: "Steady at your usual", good: false };
      else if (better && Math.sign(diff) === better)
        trend = { text: `${diff > 0 ? "↑" : "↓"} ${fmtDiff(diff, unit)} ${diff > 0 ? "more" : "less"} than usual`, good: true };
      else trend = { text: `${fmtDiff(diff, unit)} ${diff > 0 ? "above" : "below"} your usual`, good: false };
    }
    // record: best 7-value average this calendar year
    let badge = null;
    const year = lastP.d.slice(0, 4), yearVals = vals.filter(p => p.d.startsWith(year));
    if (better && yearVals.length >= 21) {
      let best = -Infinity;
      for (let i = 6; i < yearVals.length - 1; i++) best = Math.max(best, better * mean(yearVals.slice(i - 6, i + 1).map(p => p.v)));
      if (better * avg7 > best) badge = `Best week of ${year}`;
    }
    // mini line chart: the last spanDays calendar days ending at the latest point (gaps kept)
    const byDay = new Map(points.map(p => [p.d, p.v]));
    const days = Array.from({ length: spanDays }, (_, i) => addDays(lastP.d, i - spanDays + 1));
    const roll = d => mean(Array.from({ length: 7 }, (_, i) => byDay.get(addDays(d, -i))).filter(v => v != null));
    const chart = { kind: "line", unit, ref: usual, refText: usual == null ? "" : `usual ${short(usual, unit)}`,
      from: dayjs(days[0]).format("D MMM"), to: dayjs(days.at(-1)).format("D MMM"),
      points: days.map(d => {
        const v = byDay.get(d) ?? null, a = avgLine ? roll(d) : null;
        return { v, avg: a, text: v == null ? `${(dayText || fmtDay)(d)} · no data` : `${(dayText || fmtDay)(d)} · ${fmtVal(v, unit)}${avgLine ? ` · 7-day average ${fmtVal(a, unit)}` : ""}` };
      }) };
    if (avgLine) chart.avgLine = true;
    return { last: lastP, avg7, usual, trend, badge, chart };
  }

  // short labels for mini-chart scales
  function short(v, unit) {
    if (v == null) return "";
    return { clock: clock(v), dur: hm(v), min: `${Math.round(v)}m`, count: `${+v.toFixed(1)}`, pct: `${Math.round(v)}%` }[unit] ?? `${Math.round(v)}`;
  }

  const TONES = { good: "#10b981", warn: "#f59e0b", bad: "#f43f5e" }; // optional per-bar meaning: hit / partly / missed
  // Mini chart for glance cards, as HTML + SVG (Alpine can't loop inside <svg>).
  // c: {kind: "line"|"bars", unit, points: [{v, avg?, text, current?}], ref, refText, from, to, avgLine?}; pick: highlighted index or null (= latest)
  function mini(c, pick) {
    const n = c.points.length, W = 300, H = 60, bars = c.kind === "bars";
    const lastI = c.points.findLastIndex(p => p.v != null), sel = pick ?? lastI;
    const vals = c.points.flatMap(p => [p.v, c.avgLine ? p.avg : null]).filter(v => v != null);
    if (!vals.length) return "";
    let lo = bars ? 0 : Math.min(...vals), hi = Math.max(...vals, ...(c.ref != null ? [c.ref] : []));
    if (!bars && c.ref != null) lo = Math.min(lo, c.ref);
    if (hi === lo) hi = lo + 1;
    const pad = bars ? 0 : (hi - lo) * 0.1, y0 = lo - pad, y1 = hi + pad;
    const X = i => (bars ? ((i + 0.5) * W) / n : n === 1 ? W / 2 : (i * W) / (n - 1)), Y = v => H - ((v - y0) / (y1 - y0)) * H;
    const pct = v => `${((Y(v) / H) * 100).toFixed(1)}%`;
    const dot = (x, y, w, extra = "") => `<path d="M${x} ${y}h0" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" vector-effect="non-scaling-stroke" ${extra}/>`;
    const path = key => { let d = "", on = false; c.points.forEach((p, i) => { if (p[key] == null) { on = false; return; } d += `${on ? "L" : "M"}${X(i).toFixed(1)} ${Y(p[key]).toFixed(1)}`; on = true; }); return d; };
    let svg = "";
    if (c.ref != null) svg += `<line x1="0" x2="${W}" y1="${Y(c.ref)}" y2="${Y(c.ref)}" class="stroke-slate-400" stroke-dasharray="4 3" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if (bars) {
      const bw = (W / n) * 0.7;
      c.points.forEach((p, i) => {
        const h = Math.max(1.5, H - Y(p.v || 0)), x = X(i) - bw / 2;
        svg += p.current
          ? `<rect x="${x}" y="${H - h}" width="${bw}" height="${h}" fill="currentColor" fill-opacity="${i === sel ? 0.35 : 0.15}" stroke="currentColor" stroke-dasharray="3 2" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`
          : `<rect x="${x}" y="${H - h}" width="${bw}" height="${h}" rx="1" fill="${TONES[p.tone] || "currentColor"}" opacity="${i === sel ? 1 : p.tone ? 0.75 : 0.45}"/>`;
      });
    } else if (c.avgLine) {
      c.points.forEach((p, i) => { if (p.v != null) svg += dot(X(i), Y(p.v), 4, 'opacity="0.35"'); });
      svg += `<path d="${path("avg")}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    } else {
      svg += `<path d="${path("v")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity="0.85" vector-effect="non-scaling-stroke"/>`;
      c.points.forEach((p, i) => { if (p.v != null) svg += dot(X(i), Y(p.v), 3.5); });
    }
    // highlighted point + its value
    const sp = c.points[sel], sv = c.avgLine ? sp?.avg : sp?.v;
    let tag = "";
    if (sv != null && !bars) { // bar charts skip the value tag: it covers neighbouring bars (the label line above shows a tapped bar)
      const fx = X(sel) / W, ty = Y(sv);
      svg += dot(X(sel), Y(sv), 9, 'class="stroke-white dark:stroke-slate-900"') + dot(X(sel), Y(sv), 6.5);
      const shift = fx > 0.85 ? "-100%" : fx < 0.15 ? "0%" : "-50%";
      tag = `<span class="absolute whitespace-nowrap rounded bg-white/90 px-1 font-semibold text-slate-900 dark:bg-slate-900/90 dark:text-white" style="left:${(fx * 100).toFixed(1)}%;top:${((ty / H) * 100).toFixed(1)}%;transform:translate(${shift},-135%)">${short(sv, c.unit)}</span>`;
    }
    const top = bars ? hi : Math.max(...vals), bottom = bars ? 0 : Math.min(...vals);
    return `<div class="relative mb-1 mt-4 h-20 select-none text-[10px] leading-none">
      <span class="absolute left-0 -translate-y-1/2 text-slate-500" style="top:${pct(top)}">${short(top, c.unit)}</span>
      <span class="absolute left-0 -translate-y-1/2 text-slate-500" style="top:${pct(bottom)}">${short(bottom, c.unit)}</span>
      <div data-plot class="absolute inset-y-0 left-10 right-[4.5rem]">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="absolute inset-0 h-full w-full overflow-visible">${svg}</svg>${tag}
      </div>
      ${c.ref != null ? `<span class="absolute right-0 w-[4.25rem] -translate-y-1/2 text-slate-500" style="top:${pct(c.ref)}">${c.refText}</span>` : ""}
    </div>
    <div class="ml-10 mr-[4.5rem] flex justify-between text-[10px] text-slate-500"><span>${c.from}</span><span>${c.to}</span></div>`;
  }
  // tap on a mini chart → nearest index with data; tapping the same one again clears
  function pickAt(e, c, pick) {
    const r = e.currentTarget.querySelector("[data-plot]").getBoundingClientRect(), n = c.points.length;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    let i = c.kind === "bars" ? Math.min(n - 1, Math.floor(f * n)) : Math.round(f * (n - 1));
    const ok = j => c.points[j] && (c.kind === "bars" || c.points[j].v != null);
    for (let k = 0; !ok(i) && k < n; k++) i = ok(i - k) ? i - k : ok(i + k) ? i + k : i;
    return i === pick ? null : i;
  }

  return {
    DATA, APP, nights, workouts, daily, segments, first, last, dataEnd, today, METRICS, ASLEEP,
    iso, addDays, weekStart, dow, fmtDay, mean, quantile, hm, clock, fmtVal, bigVal, fmtDiff, axisFmt,
    hex, isDark, chart, resetCharts, axis, base, tipRow, events, eventLines, api, glance, mini, pickAt, short,
  };
})();
