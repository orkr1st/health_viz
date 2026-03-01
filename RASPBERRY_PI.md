# Deploying on Raspberry Pi

Supports Raspberry Pi 3, 4, and 5 — both 32-bit (armv7) and 64-bit (arm64) OS.

## Prerequisites

Install Docker:

```bash
curl -sSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## Copy files to the Pi

From your dev machine (replace `pi-host` with hostname or IP):

```bash
rsync -av --exclude='health.db' --exclude='logs/' --exclude='__pycache__' \
  Dockerfile requirements.txt docker-compose.yml app/ static/ \
  pi@pi-host:~/health/
```

## Configure

On the Pi, edit `docker-compose.yml` and set a real secret key:

```yaml
environment:
  - SECRET_KEY=your-secret-here
```

## Start

```bash
cd ~/health
docker compose up -d
```

## Verify

```bash
curl http://localhost:8443/api/auth/me   # expect: 401 Unauthorized
```

Open `http://<pi-ip>:8443` in a browser — the login screen should appear.

## Updates

```bash
cd ~/health
docker compose down
# rsync new files from dev machine...
docker compose up -d --build
```
