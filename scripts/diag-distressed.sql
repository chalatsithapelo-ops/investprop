SELECT status, COUNT(*) FROM "DistressedListing" GROUP BY status;
SELECT source, COUNT(*) FROM "DistressedListing" WHERE status='ACTIVE' GROUP BY source;
SELECT COUNT(*) AS dup_groups FROM (SELECT source, "externalId" FROM "DistressedListing" WHERE status='ACTIVE' AND "externalId" IS NOT NULL GROUP BY source, "externalId" HAVING COUNT(*)>1) t;
SELECT COUNT(*) AS null_extid FROM "DistressedListing" WHERE status='ACTIVE' AND "externalId" IS NULL;
SELECT MIN("createdAt"), MAX("createdAt"), MIN("lastSeenAt"), MAX("lastSeenAt") FROM "DistressedListing" WHERE status='ACTIVE';
SELECT MIN("auctionDate"), MAX("auctionDate"), COUNT(*) FILTER (WHERE "auctionDate" IS NULL) AS null_auctions FROM "DistressedListing" WHERE status='ACTIVE';
