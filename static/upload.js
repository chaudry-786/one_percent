// Upload an Apple Health export: get a signed URL, PUT the zip straight to storage, then ask the
// server to process it. Exposes window.SleepUpload.open().
(function () {
  "use strict";
  const STYLE = `
  .su-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.55); display: grid; place-items: center; padding: 16px; }
  .su-sheet { width: 100%; max-width: 440px; background: var(--surface, #131a26); color: var(--ink, #f1f5f9);
    border: 1px solid var(--border, rgba(255,255,255,.1)); border-radius: 16px; padding: 22px 20px 18px;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
  .su-sheet h2 { margin: 0 0 6px; font-size: 18px; }
  .su-sheet ol { margin: 0 0 16px; padding-left: 20px; color: var(--ink-2, #b4bfcf); font-size: 13.5px; }
  .su-pick { display: flex; align-items: center; justify-content: center; height: 46px; border-radius: 10px; cursor: pointer;
    background: var(--accent, #3987e5); color: #fff; font-weight: 600; }
  .su-pick input { display: none; }
  .su-bar { height: 8px; border-radius: 999px; background: var(--surface-2, #1b2433); overflow: hidden; margin-top: 16px; }
  .su-bar i { display: block; height: 100%; width: 0; background: var(--accent, #3987e5); transition: width .2s; }
  .su-bar.busy i { width: 35% !important; animation: su-slide 1.2s ease-in-out infinite; }
  @keyframes su-slide { from { transform: translateX(-100%); } to { transform: translateX(290%); } }
  .su-status { margin-top: 10px; font-size: 13.5px; color: var(--ink-2, #b4bfcf); min-height: 1.5em; }
  .su-status.err { color: var(--bad, #e66767); }
  .su-row { display: flex; justify-content: flex-end; margin-top: 12px; }
  .su-row button { border: 1px solid var(--border, rgba(255,255,255,.1)); background: transparent; color: inherit; border-radius: 10px; height: 36px; padding: 0 14px; cursor: pointer; }
  `;
  let root, busy = false;

  function build() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);
    root = document.createElement("div");
    root.className = "su-backdrop";
    root.hidden = true;
    root.innerHTML = `
      <div class="su-sheet" role="dialog" aria-modal="true" aria-labelledby="su-title">
        <h2 id="su-title">Upload Health export</h2>
        <ol>
          <li>In the Health app, tap your picture → <b>Export All Health Data</b>.</li>
          <li>Choose <b>Save to Files</b>.</li>
          <li>Pick that <b>export.zip</b> below. Takes a minute or two.</li>
        </ol>
        <label class="su-pick"><input type="file" accept=".zip,application/zip"><span>Choose export.zip</span></label>
        <div class="su-bar" hidden><i></i></div>
        <div class="su-status" role="status"></div>
        <div class="su-row"><button type="button" class="su-close">Close</button></div>
      </div>`;
    document.body.append(root);
    root.querySelector("input").addEventListener("change", e => e.target.files[0] && run(e.target.files[0]));
    root.querySelector(".su-close").onclick = close;
    root.addEventListener("click", e => { if (e.target === root) close(); });
    window.addEventListener("beforeunload", e => { if (busy) { e.preventDefault(); e.returnValue = ""; } });
  }
  function open() { if (!root) build(); root.hidden = false; setStatus(""); }
  function close() { if (!busy) root.hidden = true; }
  function setStatus(text, err) { const s = root.querySelector(".su-status"); s.textContent = text; s.classList.toggle("err", !!err); }
  function setBar(pct, indeterminate) {
    const bar = root.querySelector(".su-bar");
    bar.hidden = pct == null && !indeterminate;
    bar.classList.toggle("busy", !!indeterminate);
    bar.querySelector("i").style.width = indeterminate ? "" : `${pct || 0}%`;
  }
  async function api(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    if (r.status === 401) { location.href = "/login?next=/"; throw new Error("Please sign in again."); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Server error (${r.status})`);
    return data;
  }
  function put(url, file, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("PUT", url);
      x.setRequestHeader("Content-Type", "application/zip");
      x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total * 100);
      x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status})`)));
      x.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
      x.send(file);
    });
  }
  async function run(file) {
    if (busy) return;
    if (!/\.zip$/i.test(file.name)) return setStatus("That isn't a .zip file. Choose the export.zip from the Health app.", true);
    busy = true;
    root.querySelector(".su-pick").style.display = "none";
    const mb = (file.size / 1e6).toFixed(0);
    try {
      setStatus("Preparing upload…");
      const { url, object } = await api("/api/upload-url");
      await put(url, file, pct => { setBar(pct); setStatus(`Uploading ${mb} MB… ${pct.toFixed(0)}%`); });
      setBar(null, true);
      setStatus("Processing your data. This takes about a minute, keep this page open.");
      const r = await api("/api/process", { object });
      setBar(100);
      setStatus(`Done: ${r.nights} nights and ${r.workouts} workouts, up to ${r.to}. Reloading…`);
      busy = false;
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      busy = false;
      setBar(null);
      setStatus(e.message, true);
      root.querySelector(".su-pick").style.display = "";
      root.querySelector("input").value = "";
    }
  }
  window.SleepUpload = { open };
})();
