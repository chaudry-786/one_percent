#!/usr/bin/env bash
# Run One Percent locally: rebuilds the Tailwind CSS on every change and serves the app on http://127.0.0.1:5000.
#   ./dev.sh                 files stored in .store/, no login
#   ACCENT_PROGRESS_FILE=path/to/progress.json ./dev.sh   to include accent practice
set -euo pipefail
cd "$(dirname "$0")"
TW=.tools/tailwindcss
if [[ ! -x $TW ]]; then
  mkdir -p .tools
  curl -sSL -o $TW https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-linux-x64
  chmod +x $TW
fi
$TW -i static/src/app.css -o static/dist/app.css --minify
$TW -i static/src/app.css -o static/dist/app.css --watch=always >/dev/null 2>&1 &
trap 'kill $!' EXIT
venv/bin/flask --app app run --debug
