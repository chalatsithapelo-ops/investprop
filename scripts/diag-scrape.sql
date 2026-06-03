SELECT source, status, "listingsFound", "newListings", "scrapedAt" FROM "DistressedScrapeLog" ORDER BY "scrapedAt" DESC LIMIT 30;
SELECT source, MAX("lastScrapedAt") AS last_scraped, COUNT(*) AS active_count FROM "DistressedListing" WHERE status='ACTIVE' GROUP BY source ORDER BY last_scraped DESC NULLS LAST;
