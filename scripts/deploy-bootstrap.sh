#!/usr/bin/env bash
# Investprop VPS bootstrap — run ONCE on a fresh Ubuntu 24.04+ VPS as root.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<user>/investprop/main/scripts/deploy-bootstrap.sh | bash -s -- <github_repo_url>
# Or after cloning:
#   sudo bash scripts/deploy-bootstrap.sh

set -euo pipefail

REPO_URL="${1:-}"
APP_DIR="/opt/investprop"

log() { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo bash $0)" >&2; exit 1
fi

log "Updating apt + installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw fail2ban unattended-upgrades

log "Configuring UFW (allow 22, 80, 443)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "Enabling unattended security upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades || true

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

if [ ! -d "$APP_DIR/.git" ]; then
  if [ -z "$REPO_URL" ]; then
    echo "No repo URL given and $APP_DIR doesn't exist. Pass repo URL as arg." >&2; exit 1
  fi
  log "Cloning $REPO_URL into $APP_DIR"
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  log "Creating .env from template — fill in real secrets, then re-run this script"
  cp .env.production.example .env
  # Auto-generate strong secrets
  sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 48)|" .env
  sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 48)|" .env
  sed -i "s|ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(openssl rand -hex 16)|" .env
  sed -i "s|MINIO_SECRET_KEY=.*|MINIO_SECRET_KEY=$(openssl rand -hex 24)|" .env
  chmod 600 .env
  echo
  echo "===================================================================="
  echo "Generated .env at $APP_DIR/.env with random secrets."
  echo "Admin password (write it down):"
  grep '^ADMIN_PASSWORD=' .env
  echo "===================================================================="
fi

log "Building app image (this can take 5–10 min on first run)"
docker compose -f docker-compose.prod.yaml --env-file .env build

log "Starting stack"
docker compose -f docker-compose.prod.yaml --env-file .env up -d

log "Waiting for app to become healthy..."
sleep 15
docker compose -f docker-compose.prod.yaml ps

log "Done. Visit https://investprop.io once DNS has propagated."
echo "Logs:  docker compose -f $APP_DIR/docker-compose.prod.yaml logs -f app"
echo "Seed:  docker compose -f $APP_DIR/docker-compose.prod.yaml exec app node scripts/seed-demo.mjs"
