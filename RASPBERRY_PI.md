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
rsync -av --exclude='health.db' --exclude='logs/' --exclude='__pycache__' --exclude='certs/' \
  Dockerfile requirements.txt docker-compose.yml env.example app/ static/ \
  pi@pi-host:~/health/
```

## Configure

On the Pi, create a `.env` file with a real secret key:

```bash
echo "SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" > ~/health/.env
```

> **Note:** Changing the key invalidates all existing login sessions — users must log in again.

## HTTPS setup

### Generate certificates (one-time)

This uses **mkcert**, which creates a local CA so browsers trust the cert without warnings.

**On the Pi — install mkcert:**

```bash
sudo apt-get install -y libnss3-tools
# Choose the binary matching your OS (arm64 for 64-bit, arm for 32-bit):
curl -LO https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-arm64
chmod +x mkcert-v1.4.4-linux-arm64
sudo mv mkcert-v1.4.4-linux-arm64 /usr/local/bin/mkcert
```

**Create the local CA and generate a certificate:**

Replace `192.168.1.42` with the Pi's actual LAN IP address.

```bash
mkcert -install                       # creates local root CA (once)

mkdir -p ~/health/certs
cd ~/health/certs
mkcert -key-file key.pem -cert-file cert.pem \
    192.168.1.42 \
    raspberrypi.local \
    localhost \
    127.0.0.1
```

**Trust the CA on each client device (one-time per device):**

Copy the root CA from the Pi:
```bash
scp pi@<pi-ip>:$(ssh pi@<pi-ip> 'mkcert -CAROOT')/rootCA.pem ~/rootCA-healthpi.pem
```

Then import it:
- **macOS**: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/rootCA-healthpi.pem`
- **Windows**: `certutil -addstore -f "ROOT" rootCA-healthpi.pem`
- **Linux**: copy to `/usr/local/share/ca-certificates/healthpi-root.crt`, then `sudo update-ca-certificates`
- **iOS**: Email the file to the device → open it → Settings > General > VPN & Device Management → install → Settings > General > About > Certificate Trust Settings → enable
- **Firefox (all platforms)**: Settings > Privacy & Security > View Certificates > Authorities > Import

**Fallback — self-signed cert (browser warning on first visit):**

```bash
mkdir -p ~/health/certs
openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
    -keyout ~/health/certs/key.pem \
    -out    ~/health/certs/cert.pem \
    -subj "/CN=raspberrypi.local" \
    -addext "subjectAltName=IP:192.168.1.42,IP:127.0.0.1,DNS:raspberrypi.local,DNS:localhost"
```

## Database file permissions

After the first `docker compose up`, lock down the database file so only the app can read it:

```bash
cd ~/health
sudo chown 1000:1000 health.db     # UID 1000 = appuser inside the container
chmod 600 health.db                # owner read/write only

# Also harden the supporting directories:
sudo chown -R 1000:1000 logs/ avatars/
chmod 750 logs/ avatars/
```

Permissions survive container rebuilds because the file lives on the host. Re-run
`chmod 600 health.db` only if you ever delete and recreate the database file.

## Start

```bash
cd ~/health
docker compose up -d
```

## Verify

```bash
curl -k https://localhost:8443/api/auth/me   # expect: 401 Unauthorized
```

Open `https://<pi-ip>:8443` in a browser — the login screen should appear.

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
rsync -av --exclude='health.db' --exclude='logs/' --exclude='__pycache__' --exclude='certs/' \
  Dockerfile requirements.txt docker-compose.yml env.example app/ static/ \
  pi@<pi-ip>:~/health/

ssh pi@<pi-ip> "cd ~/health && docker compose up --build -d"
```
