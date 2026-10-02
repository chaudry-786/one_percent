"""Passphrase login for small personal Flask apps (shared by the hosted apps; keep copies in sync).

    from passauth import init_auth
    init_auth(app, title="My app")

Environment:
    APP_PASSPHRASE  the passphrase; if unset, auth is off (local development)
    COOKIE_KEY      secret used to sign the login cookie

A successful login sets a signed, HttpOnly cookie valid for 90 days. Changing either the
passphrase or COOKIE_KEY logs every device out.
"""

import hashlib
import hmac
import html
import os
import time
from urllib.parse import quote

from flask import make_response, redirect, request

COOKIE = "app_login"
MAX_AGE = 90 * 24 * 3600
OPEN_PATHS = ("/login", "/healthz")


def init_auth(app, title="Personal app"):
    passphrase = os.environ.get("APP_PASSPHRASE", "")

    @app.route("/healthz")
    def healthz():
        return "ok"

    if not passphrase:
        app.logger.warning("APP_PASSPHRASE not set: login disabled")
        return

    key = os.environ.get("COOKIE_KEY", "").encode()
    if not key:
        raise RuntimeError("COOKIE_KEY must be set when APP_PASSPHRASE is set")
    # tie tokens to the current passphrase so changing it invalidates every cookie
    pass_id = hashlib.sha256(passphrase.encode()).hexdigest()[:16]

    def token(expires: int) -> str:
        sig = hmac.new(key, f"{expires}:{pass_id}".encode(), hashlib.sha256).hexdigest()
        return f"{expires}.{sig}"

    def logged_in() -> bool:
        tok = request.cookies.get(COOKIE, "")
        exp, _, _ = tok.partition(".")
        if not exp.isdigit() or int(exp) < time.time():
            return False
        return hmac.compare_digest(token(int(exp)), tok)

    def safe_next(target: str) -> str:
        # only same-site relative paths, never "//evil.com"
        return target if target.startswith("/") and not target.startswith("//") else "/"

    @app.before_request
    def gate():
        if request.path in OPEN_PATHS or logged_in():
            return None
        if request.path.startswith("/api/"):
            return {"error": "login required"}, 401
        return redirect("/login?next=" + quote(request.full_path.rstrip("?")))

    @app.route("/login", methods=["GET", "POST"])
    def login():
        error = ""
        nxt = safe_next(request.values.get("next", "/"))
        if request.method == "POST":
            given = request.form.get("passphrase", "")
            if hmac.compare_digest(given.encode(), passphrase.encode()):
                resp = make_response(redirect(nxt))
                resp.set_cookie(
                    COOKIE, token(int(time.time()) + MAX_AGE), max_age=MAX_AGE, httponly=True, samesite="Lax",
                    secure=request.headers.get("X-Forwarded-Proto", request.scheme) == "https",
                )
                return resp
            time.sleep(1)  # slow down guessing
            error = "That passphrase didn't match."
        return LOGIN_PAGE.format(title=html.escape(title), next=html.escape(nxt), error=html.escape(error))

    @app.route("/logout")
    def logout():
        resp = make_response(redirect("/login"))
        resp.delete_cookie(COOKIE)
        return resp


LOGIN_PAGE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Sign in</title>
<style>
  :root {{ color-scheme: light dark; --bg:#f4f6f9; --card:#fff; --ink:#0f172a; --muted:#64748b; --line:rgba(15,23,42,.12); --accent:#2a78d6; --bad:#c23434; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg:#0b0f17; --card:#131a26; --ink:#f1f5f9; --muted:#94a3b8; --line:rgba(255,255,255,.1); --accent:#3987e5; --bad:#e66767; }} }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--ink);
         font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; padding:16px; }}
  form {{ width:100%; max-width:360px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:28px 24px; }}
  h1 {{ margin:0 0 4px; font-size:20px; }}
  p {{ margin:0 0 20px; color:var(--muted); font-size:14px; }}
  input {{ width:100%; height:44px; padding:0 12px; border-radius:10px; border:1px solid var(--line); background:transparent; color:var(--ink); font-size:16px; }}
  input:focus {{ outline:2px solid var(--accent); outline-offset:1px; }}
  button {{ width:100%; height:44px; margin-top:12px; border:0; border-radius:10px; background:var(--accent); color:#fff; font-size:16px; font-weight:600; cursor:pointer; }}
  .err {{ color:var(--bad); font-size:14px; margin-top:10px; min-height:1em; }}
</style></head>
<body>
<form method="post" action="/login">
  <h1>{title}</h1>
  <p>Enter your passphrase. This device will stay signed in for 90 days.</p>
  <input type="hidden" name="next" value="{next}">
  <input type="password" name="passphrase" autocomplete="current-password" autofocus required aria-label="Passphrase">
  <button type="submit">Sign in</button>
  <div class="err" role="alert">{error}</div>
</form>
</body></html>"""
