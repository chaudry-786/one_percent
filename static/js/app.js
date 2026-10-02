// Alpine component for the whole page. Markup lives in templates/; logic in core/habits/sleep/exercise/heart.js.
document.addEventListener("alpine:init", () => {
  Alpine.data("onePercent", () => ({
    tab: "habits",
    dark: true,
    // sleep explorer
    metric: "deep", range: "1y", from: "", to: "", group: "week", dow: [0, 1, 2, 3, 4, 5, 6],
    selPeriod: null, selection: null, skipTap: false, night: OP.last, moreOpen: false,
    // exercise / heart
    walks: false, exWeeklyHint: "", hrvRange: "", bucketHint: "", bucketInfo: null, speechDailyHint: "", speechUrl: OP.APP.accentUrl || "",
    // sheets
    optionsOpen: false, targetsOpen: false,
    targets: { ...OP.habits.DEFAULTS, ...(OP.APP.habits || {}) }, draft: {},
    events: OP.events.list, newEvent: { date: "", label: "" }, cmpEvent: null,
    quote: OP.habits.quote(),
    heartGlance: OP.heart.glanceCards(),
    webapp: !!OP.APP.webapp, meta: OP.APP.meta || {},

    get sleepGlance() { return OP.sleep.glanceCards(this.targets); },
    get habitCards() { return OP.habits.cards(this.targets); },
    get speechGlance() { return OP.speech.glanceCards(); },
    get exGlance() { return OP.exercise.glanceCards(this.targets.gymDays); },
    get exStatus() { return OP.exercise.status(this.targets.gymDays); },
    get compare() { return this.cmpEvent ? OP.sleep.compare(this.cmpEvent) : null; },
    get bounds() {
      if (this.range === "custom" && this.from && this.to && this.from <= this.to) return [this.from, this.to];
      const days = { "30d": 30, "90d": 90, "6m": 182, "1y": 365, all: 5000 }[this.range] || 365;
      return [OP.addDays(OP.dataEnd, -days), OP.dataEnd];
    },
    get nightsInView() { const [a, b] = this.bounds, dows = new Set(this.dow); return OP.nights.filter(n => n.d >= a && n.d <= b && dows.has(n.dow)); },
    get filterTags() {
      const tags = [];
      if (this.range === "custom" && this.from && this.to) tags.push({ text: `${OP.fmtDay(this.from)} – ${OP.fmtDay(this.to)}`, clear: () => { this.range = "1y"; } });
      if (this.dow.length < 7) tags.push({ text: this.dow.length === 2 && this.dow.includes(4) && this.dow.includes(5) ? "Weekends only" : "Some nights only", clear: () => { this.dow = [0, 1, 2, 3, 4, 5, 6]; } });
      return tags;
    },
    get subtitle() {
      const n = OP.nights;
      return `${n.length} nights · ${OP.workouts.length} workouts · ${OP.fmtDay(n[0].d)} → ${OP.fmtDay(n.at(-1).d)}` + (this.meta.processedAt ? ` · updated ${this.meta.processedAt}` : "");
    },

    init() {
      let saved = null;
      try { saved = localStorage.getItem("op-theme"); } catch { /* storage blocked */ }
      this.dark = saved ? saved === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
      this.applyTheme();
      // the open tab lives in the URL (#sleep, #exercise, #heart, #speech) so a refresh stays on it; Habits is the plain URL
      const TABS = ["habits", "sleep", "exercise", "heart", "speech"], fromHash = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "habits");
      this.tab = fromHash();
      this.$watch("tab", t => history.replaceState(null, "", t === "habits" ? location.pathname : `#${t}`));
      addEventListener("hashchange", () => { this.tab = fromHash(); });
      for (const k of ["metric", "group", "range", "from", "to"]) this.$watch(k, () => { this.selPeriod = null; });
      for (const k of ["tab", "metric", "range", "from", "to", "group", "dow", "selPeriod", "night", "moreOpen", "walks", "events", "targets"]) this.$watch(k, () => this.render());
      this.render();
    },
    applyTheme() { document.documentElement.classList.toggle("dark", this.dark); },
    toggleTheme() {
      this.dark = !this.dark;
      try { localStorage.setItem("op-theme", this.dark ? "dark" : "light"); } catch { /* storage blocked */ }
      this.applyTheme(); OP.resetCharts(); this.render();
    },
    // redraw the active tab's charts once the DOM has updated
    render() {
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(() => this.$nextTick(() => {
        const b = this.bounds;
        if (this.tab === "sleep") {
          const list = this.nightsInView;
          if (!list.length) return;
          OP.sleep.trend(this, list, b);
          OP.sleep.buckets(this, list, b);
          OP.sleep.mix(list);
          OP.sleep.hypnogram(this.night);
          if (this.moreOpen) OP.sleep.calendar(this, list, b);
        } else if (this.tab === "exercise") OP.exercise.render(this, b);
        else if (this.tab === "heart") OP.heart.render(this, b);
        else if (this.tab === "speech") OP.speech.render(this, b);
      }));
    },
    showNight(d) {
      this.night = d;
      this.$nextTick(() => document.getElementById("nightCard")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    },
    stepNight(dir) {
      const i = OP.nights.findIndex(n => n.d === this.night) + dir;
      if (i >= 0 && i < OP.nights.length) this.night = OP.nights[i].d;
    },
    pickNight(d) { const n = OP.nights.reduce((a, x) => (Math.abs(dayjs(x.d).diff(d)) < Math.abs(dayjs(a.d).diff(d)) ? x : a)); this.night = n.d; },
    toggleDow(i) { const s = new Set(this.dow); s.has(i) ? s.delete(i) : s.add(i); if (s.size) this.dow = [...s].sort(); },

    // events
    async saveEvents(list) {
      if (!this.webapp) { this.events = OP.events.list = list; return; }
      try { const r = await OP.api("/api/events", { events: list }); this.events = OP.events.list = r.events; }
      catch { alert("Couldn't save the event. Check your connection and try again."); }
    },
    addEvent() {
      if (!this.newEvent.date || !this.newEvent.label.trim()) return;
      this.saveEvents([...this.events, { date: this.newEvent.date, label: this.newEvent.label.trim() }]);
      this.cmpEvent = this.newEvent.date;
      this.newEvent = { date: "", label: "" };
    },
    removeEvent(e) {
      if (this.cmpEvent === e.date) this.cmpEvent = null;
      this.saveEvents(this.events.filter(x => !(x.date === e.date && x.label === e.label)));
    },

    // habit targets
    openTargets() { this.draft = { ...this.targets }; this.targetsOpen = true; },
    async saveTargets() {
      const habits = { wakeBy: this.draft.wakeBy, gymDays: +this.draft.gymDays, accentMin: +this.draft.accentMin };
      try { this.targets = { ...this.targets, ...(await OP.api("/api/settings", { habits })).habits }; this.targetsOpen = false; }
      catch { alert("Couldn't save targets. Check your connection and try again."); }
    },

    upload() {
      if (window.SleepUpload) return SleepUpload.open();
      const s = document.createElement("script");
      s.src = "/static/upload.js";
      s.onload = () => SleepUpload.open();
      document.head.append(s);
    },
  }));
});
