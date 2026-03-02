FROM python:3.12-slim

# UID 1000 matches the default "pi" user on Raspberry Pi OS,
# so host-side volume files are owned by the same UID automatically.
RUN groupadd --gid 1000 appuser \
 && useradd  --uid 1000 --gid 1000 --no-create-home appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY static/ ./static/

# Create logs dir and fix ownership before switching user.
RUN mkdir -p logs \
 && chown -R appuser:appuser /app

USER appuser

EXPOSE 8443

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8443"]
