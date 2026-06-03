UPDATE "DistressedListing"
SET status = 'EXPIRED'
WHERE status IN ('ACTIVE','WATCHED')
  AND "auctionDate" IS NOT NULL
  AND "auctionDate" < NOW();

SELECT status, COUNT(*) FROM "DistressedListing" GROUP BY status;
