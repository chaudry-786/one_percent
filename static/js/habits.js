// Habits: four habits on fixed targets. Streaks use Atomic Habits' "never miss twice": one miss is forgiven, two end it.
OP.habits = (() => {
  const { nights, workouts, APP, addDays, weekStart, fmtDay, hm, clock, dataEnd, today } = OP;
  const DEFAULTS = { wakeBy: "07:15", deepMin: 45, asleepMin: 420, gymDays: 4, accentMin: 15 };
  const QUOTES = [
    "You do not rise to the level of your goals. You fall to the level of your systems.",
    "Every action you take is a vote for the type of person you wish to become.",
    "Getting 1% better every day counts for a lot in the long run.",
    "Missing once is an accident. Missing twice is the start of a new habit.",
    "Habits are the compound interest of self-improvement.",
  ];
  // Tailwind classes per habit (written out in full so Tailwind keeps them)
  const STYLE = {
    wake: { top: "border-t-amber-500", icon: "bg-amber-500/15", done: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
    sleep: { top: "border-t-violet-500", icon: "bg-violet-500/15", done: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
    gym: { top: "border-t-emerald-500", icon: "bg-emerald-500/15", done: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
    accent: { top: "border-t-orange-500", icon: "bg-orange-500/15", done: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  };
  const prettyWorkout = t => ({ TraditionalStrengthTraining: "Strength", FunctionalStrengthTraining: "Functional strength", HighIntensityIntervalTraining: "HIIT" })[t]
    || t.replace(/([a-z])([A-Z])/g, "$1 $2");

  function list(t) {
    const [wh, wm] = t.wakeBy.split(":").map(Number);
    const wake = new Map(), sleep = new Map(), gym = new Map(), accent = new Map();
    for (const n of nights) {
      const morning = addDays(n.d, 1); // wake-up and sleep count on the morning you wake
      wake.set(morning, { done: n.wake - 720 <= wh * 60 + wm, text: `up at ${clock(n.wake)}` });
      sleep.set(morning, { done: n.deep >= t.deepMin && n.total >= t.asleepMin, text: `${hm(n.total)} asleep · ${Math.round(n.deep)}m deep` });
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
      { id: "sleep", name: "Sleep well", icon: "🌙", target: `${t.deepMin}m+ deep and ${hm(t.asleepMin)}+ asleep`, who: "someone who sleeps well", map: sleep, gaps: "unknown", asOf: dataEnd, start: firstOf(sleep) },
      { id: "gym", name: "Train", icon: "🏋️", target: `${t.gymDays} days a week · any workout but walks`, who: "an athlete", map: gym, gaps: "miss", asOf: dataEnd, start: firstOf(gym), weekly: t.gymDays },
    ];
    if (APP.accent) habits.push({ id: "accent", name: "Accent practice", icon: "🗣️", target: `${t.accentMin}+ min a day`, who: "a confident speaker", map: accent, gaps: "miss", asOf: today, start: firstOf(accent), live: true, minTarget: t.accentMin });
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

  // one card's worth of data for the template
  function card(h) {
    const st = stats(h), r = h.map.get(h.asOf);
    const label = h.asOf === today ? "Today" : `Latest · ${fmtDay(h.asOf)}`;
    let now;
    if (h.weekly) now = { text: `This week · ${st.thisWeek} of ${h.weekly} days`, done: st.thisWeek >= h.weekly };
    else if (h.id === "accent") now = r?.done ? { text: `${label} · ${Math.round(r.min)} min`, done: true }
      : { text: `${label} · ${r ? Math.round(r.min) : 0} of ${h.minTarget} min`, done: false, link: APP.accentUrl };
    else now = r ? { text: `${label} · ${r.text}`, done: r.done } : { text: `${label} · no data`, done: false };
    // last 5 weeks, Monday first
    const firstMon = addDays(weekStart(h.asOf), -28);
    const rows = Array.from({ length: 5 }, (_, w) => {
      const mon = addDays(firstMon, w * 7);
      const cells = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(mon, i), s = status(h, d), rec = h.map.get(d);
        return { d, s, today: d === today, title: `${fmtDay(d)}${rec ? ": " + rec.text : s === "unknown" ? ": no data" : s === "miss" ? ": not done" : ""}` };
      });
      const n = st.weeks?.get(mon) || 0;
      return { cells, week: h.weekly && mon <= h.asOf ? { text: `${n}/${h.weekly}`, hit: n >= h.weekly } : null };
    });
    return { ...h, style: STYLE[h.id], st, now, rows };
  }

  return { DEFAULTS, quote: () => QUOTES[Math.floor(Date.now() / 864e5) % QUOTES.length], cards: t => list(t).map(card), list, stats, status };
})();
