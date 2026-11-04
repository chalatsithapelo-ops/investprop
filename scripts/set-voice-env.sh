#!/usr/bin/env bash
set -euo pipefail
cd /opt/investprop
cp .env ".env.bak.$(date +%s)"

for K in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET AGENT_SHARED_SECRET VOICE_AGENT_ENABLED VOICE_AGENT_NAME; do
  grep -v "^${K}=" .env > .env.tmp || true
  mv .env.tmp .env
done

printf 'Paste LIVEKIT_URL (wss://...livekit.cloud): '
read -r LK_URL
echo "LIVEKIT_URL=${LK_URL}" >> .env

printf 'Paste LIVEKIT_API_KEY: '
read -rs LK_KEY; echo
echo "LIVEKIT_API_KEY=${LK_KEY}" >> .env

printf 'Paste LIVEKIT_API_SECRET: '
read -rs LK_SECRET; echo
echo "LIVEKIT_API_SECRET=${LK_SECRET}" >> .env

printf 'Paste AGENT_SHARED_SECRET (or press Enter to auto-generate): '
read -rs AG; echo
if [ -z "${AG}" ]; then
  AG="$(openssl rand -hex 32)"
  echo '(auto-generated AGENT_SHARED_SECRET)'
fi
echo "AGENT_SHARED_SECRET=${AG}" >> .env

echo 'VOICE_AGENT_ENABLED=true' >> .env
echo 'VOICE_AGENT_NAME=investprop-office-agent' >> .env

echo '=== Saved. Non-secret values: ==='
grep -E '^(LIVEKIT_URL|VOICE_AGENT_ENABLED|VOICE_AGENT_NAME)=' .env
echo '=== Secret keys present (values hidden): ==='
grep -Eo '^(LIVEKIT_API_KEY|LIVEKIT_API_SECRET|AGENT_SHARED_SECRET|OPENAI_API_KEY)=' .env || true
