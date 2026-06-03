import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Simulate getMyDocuments for user id=6 (Naledi Mokoena)
const userId = 6;

// 1. Personal legal docs
const personalDocs = await db.legalDocument.findMany({
  where: { generatedFor: userId },
  orderBy: { createdAt: "desc" },
});
console.log("Personal docs:", personalDocs.length);

// 2. Holdings
const holdings = await db.shareHolding.findMany({
  where: { investorId: userId },
  select: { propertyId: true },
});
console.log("Holdings:", holdings);

// 3. Real certificates
const realCerts = await db.shareCertificate.findMany({
  where: { investorId: userId, isValid: true },
});
console.log("Real certificates:", realCerts.length, realCerts.map(c => c.certificateNumber));

// 4. Check auth - what does session look like?
const sessions = await db.session.findMany({
  where: { userId: userId },
  select: { id: true, token: true, userId: true, expiresAt: true },
});
console.log("Sessions for user 6:", sessions.length);

await db.$disconnect();
