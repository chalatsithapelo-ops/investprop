#!/usr/bin/env bash
# Subsequent deploys — pulls latest code, rebuilds app image, runs migrations, restarts.
set -euo pipefail
cd /opt/investprop
git pull --ff-only
docker compose -f docker-compose.prod.yaml --env-file .env build app
docker compose -f docker-compose.prod.yaml --env-file .env up -d app
docker compose -f docker-compose.prod.yaml ps
echo "Deploy complete."
