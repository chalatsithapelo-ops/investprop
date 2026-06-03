-- Expire any ACTIVE listing not refreshed in last 14 days
UPDATE "DistressedListing"
SET status = 'EXPIRED'
WHERE status IN ('ACTIVE','WATCHED')
  AND ("lastScrapedAt" IS NULL OR "lastScrapedAt" < NOW() - INTERVAL '14 days');

SELECT status, COUNT(*) FROM "DistressedListing" GROUP BY status;
