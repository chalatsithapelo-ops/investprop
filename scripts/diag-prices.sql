SELECT MIN("askingPrice"), MAX("askingPrice"), AVG("askingPrice"), COUNT(*) FROM "DistressedListing" WHERE status='ACTIVE';
SELECT id, source, title, "askingPrice", "propertyType" FROM "DistressedListing" WHERE status='ACTIVE' ORDER BY "askingPrice" DESC LIMIT 10;
SELECT DISTINCT "propertyType", COUNT(*) FROM "DistressedListing" WHERE status='ACTIVE' GROUP BY "propertyType" ORDER BY 2 DESC;
