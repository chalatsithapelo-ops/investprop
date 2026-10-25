// Demo subscription seed: gives demo users ACTIVE subscriptions so each paid
// package can be tested end-to-end. Idempotent (upserts).
// Usage (inside app container): node scripts/seed-demo-subscriptions.mjs
//
// Coverage — one demo account per paid package:
//   investor@demo.com   -> INVESTOR_PLUS  (Investor Plus)
//   investor2@demo.com  -> PRO            (Pro)
//   investor3@demo.com  -> ENTERPRISE     (Enterprise)
//   investor4@demo.com  -> DISTRESSED     (DistressedDeals SA, standalone) [created if missing]
//   owner@demo.com      -> SELLER_PRO     (Seller Pro, standalone)
//
// Staff (devmanager / pm) bypass all paywalls by role, so they need no sub.

import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";

const db = new PrismaClient();

// tier -> monthly price (ZAR), mirrors PLAN_CATALOG in src/server/subscriptions/plans.ts
const PRICE = {
  INVESTOR_PLUS: 299,
  PRO: 799,
  ENTERPRISE: 2499,
  DISTRESSED: 499,
  SELLER_PRO: 499,
};

async function activate(userId, tier) {
  const now = new Date();
  const currentPeriodEnd = new Date(now);
  currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);

  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier,
      status: "ACTIVE",
      billingCycle: "MONTHLY",
      priceAmount: PRICE[tier],
      currentPeriodEnd,
      lastPaymentReference: `DEMO-SEED-${tier}`,
      lastPaymentAt: now,
      cancelAtPeriodEnd: false,
    },
    update: {
      tier,
      status: "ACTIVE",
      billingCycle: "MONTHLY",
      priceAmount: PRICE[tier],
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      lastPaymentReference: `DEMO-SEED-${tier}`,
      lastPaymentAt: now,
    },
  });
}

async function main() {
  console.log("Seeding demo subscriptions...");
  const password = await bcryptjs.hash("password123", 10);

  // Ensure a 4th investor account exists to host the standalone DISTRESSED tier.
  const inv4 = await db.user.upsert({
    where: { email: "investor4@demo.com" },
    update: { password },
    create: {
      email: "investor4@demo.com",
      password,
      name: "Lerato Dube",
      role: "INVESTOR",
      emailVerified: true,
      ficaVerified: true,
      ficaVerifiedAt: new Date(),
      updatedAt: new Date(),
    },
  });
  if (!inv4.investorCode) {
    await db.user.update({
      where: { id: inv4.id },
      data: { investorCode: `IP-INV-${String(inv4.id).padStart(5, "0")}` },
    });
  }

  const assignments = [
    { email: "investor@demo.com", tier: "INVESTOR_PLUS" },
    { email: "investor2@demo.com", tier: "PRO" },
    { email: "investor3@demo.com", tier: "ENTERPRISE" },
    { email: "investor4@demo.com", tier: "DISTRESSED" },
    { email: "owner@demo.com", tier: "SELLER_PRO" },
  ];

  for (const a of assignments) {
    const user = await db.user.findUnique({ where: { email: a.email } });
    if (!user) {
      console.warn(`  ! skipped ${a.email} — user not found`);
      continue;
    }
    await activate(user.id, a.tier);
    console.log(`  ✓ ${a.email} (id ${user.id}) -> ${a.tier}`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
