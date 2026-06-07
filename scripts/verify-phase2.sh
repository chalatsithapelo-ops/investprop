#!/bin/bash
set -e
echo "=== app status ==="
docker ps --filter name=investprop-app --format '{{.Status}}'
echo "=== git head ==="
cd /opt/investprop && git log --oneline -1
echo "=== pg env ==="
docker exec investprop-postgres-1 sh -c 'echo USER=$POSTGRES_USER DB=$POSTGRES_DB'
echo "=== distressed_listing new cols ==="
docker exec investprop-postgres-1 sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='"'"'DistressedListing'"'"' AND column_name IN ('"'"'aiGrade'"'"','"'"'aiRiskScore'"'"','"'"'aiSummary'"'"','"'"'dedupGroupId'"'"','"'"'convertedToPropertyId'"'"','"'"'remindersSent'"'"','"'"'latitude'"'"','"'"'longitude'"'"','"'"'convertedAt'"'"','"'"'aiScoredAt'"'"','"'"'aiUnderwriting'"'"') ORDER BY 1;"'
echo "=== price history table exists ==="
docker exec investprop-postgres-1 sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -tAc "SELECT to_regclass('"'"'public.\"DistressedListingPriceHistory\"'"'"');"'
echo "=== distressed-finder route loads ==="
docker exec investprop-app-1 wget -qO- http://localhost:8010/distressed-finder | grep -oE "Investprop|AI Screen Batch|Dedup" | sort -u
