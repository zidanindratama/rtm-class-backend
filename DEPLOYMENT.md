# RTM Class Backend Deployment Guide

## 1) Local development with Docker (hot reload)
1. Copy env:
   - `cp .env.example .env`
   - `cp .env.local.example .env.local`
2. Run:
   - `npm run docker:up:dev`
3. Open:
   - API: `http://localhost:5000/api/v1`
   - Swagger: `http://localhost:5000/docs`
4. Stop:
   - `npm run docker:down`

Notes:
- `docker:up:dev` runs API dev container, PostgreSQL, Redis, migration, and seed.
- If host ports conflict, adjust `POSTGRES_HOST_PORT` and `REDIS_HOST_PORT`.

## 2) First-time VM setup
Target VM path:
- `/opt/rtm-class/rtm-class-backend`

Run these commands in VM:
```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 3) Manual production deployment in VM
```bash
mkdir -p /opt/rtm-class/rtm-class-backend
cd /opt/rtm-class/rtm-class-backend

# First clone only
git clone https://github.com/<your-org-or-user>/<your-repo>.git .

cp .env.example .env
# edit .env and set real values
nano .env
```

Minimum `.env` production checklist:
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `DATABASE_URL` (use host `postgres` only if using dockerized DB from this compose stack)
- `REDIS_URL` (use host `redis` only if using dockerized Redis from this compose stack)
- `CORS_ORIGINS`
- `EMAIL_*` (if OTP email enabled)
- `CLOUDINARY_*` (if upload enabled)

Deploy:
```bash
chmod +x scripts/deploy.sh
APP_DIR=/opt/rtm-class/rtm-class-backend ./scripts/deploy.sh
```

If production uses external PostgreSQL/Redis (not Docker services in this repo):
```bash
USE_EXTERNAL_INFRA=true APP_DIR=/opt/rtm-class/rtm-class-backend ./scripts/deploy.sh
```
Notes:
- In this mode, deploy script skips `postgres` and `redis` containers.
- Ensure `.env` points to external endpoints (for example `DATABASE_URL` and `REDIS_URL` must not use docker hostnames like `postgres` / `redis`).

Update deploy:
```bash
cd /opt/rtm-class/rtm-class-backend
git pull origin main
APP_DIR=/opt/rtm-class/rtm-class-backend ./scripts/deploy.sh
```

## 4) GitHub Actions CI/CD setup
This repo already includes:
- `.github/workflows/ci-cd.yml`

### Required GitHub Secrets
Set in `Settings > Secrets and variables > Actions`:
- `VPS_HOST` = `<your-vps-ip-or-domain>`
- `VPS_USERNAME` = `<your-vps-user>`
- `VPS_PASSWORD` = `<your-vps-password>`
- `VPS_PORT` = `<your-ssh-port>` (usually `22`)
- `VPS_APP_DIR` = `<deploy-directory>` (example: `/opt/rtm-class/rtm-class-backend`)

## 5) CD flow
1. Push to `main`.
2. `CI/CD` workflow runs build/test checks.
3. It SSH to VM and ensures app directory exists.
4. It pulls latest code.
5. It runs deploy script:
   - `scripts/deploy.sh`
6. Script runs migration deploy, then restarts API stack.

## 6) Useful commands in VM
```bash
cd /opt/rtm-class/rtm-class-backend

docker compose --profile prod ps
docker compose --profile prod logs -f api
docker compose --profile prod logs -f api-migrate
docker compose --profile prod restart api
docker compose --profile prod down
docker system df
```

## 7) Setup domain `api.rtm-corndog.my.id` with Nginx
### A. Point DNS
At DNS provider, create record:
- Type: `A`
- Host/Name: `api`
- Value: `<your-vps-ip>`
- TTL: default

### B. Install Nginx + Certbot in VM
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo ufw allow 'Nginx Full'
# optional (recommended): close direct API port from public internet
# sudo ufw delete allow 5000
```

### C. Create Nginx reverse proxy config
```bash
sudo tee /etc/nginx/sites-available/api.rtm-corndog.my.id >/dev/null <<'EOF'
server {
    listen 80;
    server_name api.rtm-corndog.my.id;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
EOF
```

Enable site:
```bash
sudo ln -sf /etc/nginx/sites-available/api.rtm-corndog.my.id /etc/nginx/sites-enabled/api.rtm-corndog.my.id
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### D. Enable HTTPS (Let's Encrypt)
After DNS propagated:
```bash
sudo certbot --nginx -d api.rtm-corndog.my.id
```

Choose redirect to HTTPS when prompted.

### E. Verify
```bash
curl -I http://api.rtm-corndog.my.id/api/v1
curl -I https://api.rtm-corndog.my.id/api/v1
sudo systemctl status nginx --no-pager
```
