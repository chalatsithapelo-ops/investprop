SELECT id, title, substring("imageUrl" from 1 for 80) as image_url FROM "Property" ORDER BY id LIMIT 8;
