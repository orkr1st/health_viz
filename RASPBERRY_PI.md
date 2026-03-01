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

On the Pi, create a `.env` file and set a real secret key:

```bash
echo "SECRET_KEY=your-secret-here" > ~/health/.env
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

### Git-based workflow (recommended)

If the Pi has the repository checked out, updating is a pull and rebuild:

```bash
cd ~/health
git pull
docker compose up --build -d
```

The database and logs are safe — they are mounted as volumes (`health.db`, `logs/`) and are never overwritten by a rebuild.

**One-liner from your dev machine:**

```bash
ssh pi@<pi-ip> "cd ~/health && git pull && docker compose up --build -d"
```

**Optional helper script** — save as `update.sh` on the Pi and run it after each deployment:

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"
git pull
docker compose up --build -d
echo "Done."
```

### rsync-based workflow

If the Pi does not have a git remote configured, copy files manually from your dev machine and rebuild:

```bash
rsync -av --exclude='health.db' --exclude='logs/' --exclude='__pycache__' \
  Dockerfile requirements.txt docker-compose.yml app/ static/ \
  pi@<pi-ip>:~/health/

ssh pi@<pi-ip> "cd ~/health && docker compose up --build -d"
```
