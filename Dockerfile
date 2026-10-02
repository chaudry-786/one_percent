FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

ENV PORT=8080
EXPOSE 8080

# One worker keeps memory predictable while an export is processed; threads serve page views meanwhile.
CMD ["sh", "-c", "gunicorn --bind :${PORT} --workers 1 --threads 4 --timeout 0 app:app"]
