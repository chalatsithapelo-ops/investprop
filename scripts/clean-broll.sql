-- Drop garbage Broll entries with impossible prices
DELETE FROM "DistressedListing" WHERE source='broll' AND "askingPrice" > 500000000;
SELECT COUNT(*) AS broll_remaining FROM "DistressedListing" WHERE source='broll';
SELECT MIN("askingPrice"), MAX("askingPrice"), AVG("askingPrice") FROM "DistressedListing" WHERE status='ACTIVE';
