# Build the stylesheet with Tailwind's standalone CLI (no Node needed)
FROM debian:bookworm-slim AS css
WORKDIR /src
ADD --chmod=755 https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-linux-x64 /usr/local/bin/tailwindcss
COPY tailwind.config.js .
COPY static/src static/src
COPY static/js static/js
COPY templates templates
RUN tailwindcss -i static/src/app.css -o static/dist/app.css --minify

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .
COPY --from=css /src/static/dist static/dist

ENV PORT=8080
EXPOSE 8080

# One worker keeps memory predictable while an export is processed; threads serve page views meanwhile.
CMD ["sh", "-c", "gunicorn --bind :${PORT} --workers 1 --threads 4 --timeout 0 app:app"]
