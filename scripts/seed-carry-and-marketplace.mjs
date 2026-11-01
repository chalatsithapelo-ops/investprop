// Phase 3b demo seed: platform carry on all properties + 3 new properties
// (one per strategy) + a fully-populated secondary-market share class so the
// order book visibly shows WHO is selling, HOW MANY shares and AT WHAT price,
// with a funded buyer wallet to demonstrate instant DvP settlement.
//
// Idempotent: safe to re-run. Usage (in prod container):
//   docker compose -f docker-compose.prod.yaml exec -T app node scripts/seed-carry-and-marketplace.mjs
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const CARRY = 20; // % platform carry applied to every property
const PUBLIC_FRACTION = (100 - CARRY) / 100;

function investorCode(id) {
  return `IP-INV-${String(id).padStart(5, "0")}`;
}

async function ensureInvestorCode(user) {
  if (user.investorCode) return user;
  return db.user.update({
    where: { id: user.id },
    data: { investorCode: investorCode(user.id) },
  });
}

/** Carry-aware share count for a funding goal at R1/share (matches backend). */
function totalSharesFor(fundingGoal) {
  return Math.max(1, Math.round(fundingGoal / PUBLIC_FRACTION));
}

async function main() {
  console.log("── Phase 3b: carry + marketplace demo seed ──");

  // 1) Apply the platform carry to EVERY existing property.
  const carried = await db.property.updateMany({ data: { platformCarryPct: CARRY } });
  console.log(`✓ platformCarryPct=${CARRY} applied to ${carried.count} properties`);

  // Owner for the new demo properties: prefer the demo manager, else any manager.
  const manager =
    (await db.user.findUnique({ where: { email: "devmanager@demo.com" } })) ??
    (await db.user.findFirst({ where: { role: "DEVELOPMENT_MANAGER" } })) ??
    (await db.user.findFirst({ where: { role: "ADMIN" } }));
  if (!manager) throw new Error("No manager/admin user found to own demo properties");

  // 2) Three new published, carry-bearing properties — one per strategy.
  // Flip
  let flip = await db.property.findFirst({ where: { title: "Bryanston Villa Flip (Demo)" } });
  if (!flip) {
    flip = await db.property.create({
      data: {
        title: "Bryanston Villa Flip (Demo)",
        description: "4-bed Bryanston villa bought under market; light renovation then resale. ARV R6.2M.",
        address: "8 Ballyclare Dr, Bryanston",
        city: "Sandton",
        state: "Gauteng",
        zipCode: "2191",
        price: 4200000,
        imageUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
        imageUrls: ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
        isPublished: true,
        investmentStatus: "RAISING_FUNDS",
        fundingGoal: 4900000,
        minimumInvestment: 50000,
        expectedReturns: 24,
        platformCarryPct: CARRY,
        riskRating: "MEDIUM",
        bedrooms: 4,
        bathrooms: 3,
        squareMeters: 320,
        userId: manager.id,
      },
    });
    await db.propertyFlip.create({
      data: {
        propertyId: flip.id,
        flipType: "RESALE",
        purchasePrice: 4200000,
        renovationBudget: 500000,
        estimatedValue: 6200000,
        afterRepairValue: 6200000,
        estimatedRepairCosts: 500000,
        holdingCosts: 120000,
        closingCostsPurchase: 80000,
        closingCostsSale: 310000,
        expectedROI: 24,
        expectedProfitMargin: 18,
        daysToComplete: 150,
        totalInvestmentBudget: 4900000,
        fundingGoal: 4900000,
        userId: manager.id,
      },
    });
    console.log(`✓ Created flip property #${flip.id}`);
  } else {
    console.log(`• Flip property already exists #${flip.id}`);
  }

  // Rental (this one gets the rich, tradeable share class)
  let rental = await db.property.findFirst({ where: { title: "Umhlanga Ridge Rental (Demo)" } });
  if (!rental) {
    rental = await db.property.create({
      data: {
        title: "Umhlanga Ridge Rental (Demo)",
        description: "Modern 2-bed buy-to-let in Umhlanga Ridge, R21k/month gross rent, strong tenant demand.",
        address: "19 Centenary Blvd, Umhlanga Ridge",
        city: "Durban",
        state: "KwaZulu-Natal",
        zipCode: "4319",
        price: 3100000,
        imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800",
        imageUrls: ["https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800"],
        isPublished: true,
        investmentStatus: "RAISING_FUNDS",
        fundingGoal: 1000000,
        minimumInvestment: 25000,
        expectedReturns: 10.5,
        platformCarryPct: CARRY,
        riskRating: "LOW",
        bedrooms: 2,
        bathrooms: 2,
        squareMeters: 95,
        userId: manager.id,
      },
    });
    await db.rentalBond.create({
      data: {
        propertyId: rental.id,
        bondAmount: 2480000,
        monthlyRent: 21000,
        leaseStartDate: new Date("2026-07-01"),
        leaseEndDate: new Date("2027-06-30"),
        purchasePrice: 3100000,
        annualPropertyTax: 14000,
        annualInsurance: 9600,
        monthlyMaintenanceReserve: 1600,
        monthlyManagementFee: 1680,
        vacancyRate: 4,
        appreciationRate: 6,
        downPaymentAmount: 620000,
        loanAmount: 2480000,
        interestRate: 11.25,
        loanTermYears: 20,
        totalInvestmentBudget: 1000000,
        fundingGoal: 1000000,
        userId: manager.id,
      },
    });
    console.log(`✓ Created rental property #${rental.id}`);
  } else {
    console.log(`• Rental property already exists #${rental.id}`);
  }

  // Development
  let dev = await db.property.findFirst({ where: { title: "Centurion Mixed-Use Development (Demo)" } });
  if (!dev) {
    dev = await db.property.create({
      data: {
        title: "Centurion Mixed-Use Development (Demo)",
        description: "12-unit mixed-use development near the Gautrain, retail ground floor + residential above.",
        address: "Erf 5521, Highveld, Centurion",
        city: "Pretoria",
        state: "Gauteng",
        zipCode: "0169",
        price: 11500000,
        imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800",
        imageUrls: ["https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800"],
        isPublished: true,
        investmentStatus: "RAISING_FUNDS",
        fundingGoal: 4000000,
        minimumInvestment: 100000,
        expectedReturns: 19,
        platformCarryPct: CARRY,
        riskRating: "HIGH",
        bedrooms: 2,
        bathrooms: 1,
        squareMeters: 2600,
        userId: manager.id,
      },
    });
    await db.propertyDevelopment.create({
      data: {
        propertyId: dev.id,
        projectName: "Highveld Mixed-Use",
        totalBudget: 11500000,
        startDate: new Date("2026-09-01"),
        estimatedEndDate: new Date("2028-03-01"),
        numberOfUnits: 12,
        landAcquisitionCost: 2500000,
        hardCosts: 7500000,
        softCosts: 900000,
        contingencyPercent: 10,
        contingencyAmount: 750000,
        expectedSalePricePerUnit: 1650000,
        totalExpectedRevenue: 16500000,
        expectedProfit: 5000000,
        expectedROI: 43,
        expectedIRR: 24,
        developmentTimelineMonths: 18,
        developmentType: "COMMERCIAL_RENTAL",
        expectedMonthlyRentPerUnit: 9500,
        annualOperatingExpenses: 240000,
        stabilizedCapRate: 8.75,
        totalSquareMeters: 2600,
        userId: manager.id,
        fundingGoal: 4000000,
      },
    });
    console.log(`✓ Created development property #${dev.id}`);
  } else {
    console.log(`• Development property already exists #${dev.id}`);
  }

  // 3) A fully-populated, tradeable share class on the rental property.
  const investors = [];
  for (const email of ["investor@demo.com", "investor2@demo.com", "investor3@demo.com"]) {
    const u = await db.user.findUnique({ where: { email } });
    if (u) investors.push(await ensureInvestorCode(u));
  }
  if (investors.length < 3) {
    console.log(`⚠ Only ${investors.length} demo investors found — skipping marketplace seeding.`);
  } else {
    const [john, naledi, thabo] = investors;
    const price = 100; // R100 / share
    const totalShares = totalSharesFor(rental.fundingGoal); // carry-aware

    const shareClass = await db.shareClass.upsert({
      where: { propertyId_name: { propertyId: rental.id, name: "Ordinary" } },
      update: { totalShares, pricePerShare: price, priceCollarPct: 25 },
      create: {
        propertyId: rental.id,
        name: "Ordinary",
        totalShares,
        pricePerShare: price,
        minimumShares: 1,
        priceCollarPct: 25,
      },
    });
    console.log(`✓ Share class #${shareClass.id} (${totalShares} shares @ R${price})`);

    // Holdings: three distinct investors hold shares (so availableShares shows
    // and sellers have inventory to list).
    const holdings = [
      { investor: naledi, shares: 3000, avg: 95 },
      { investor: thabo, shares: 2000, avg: 92 },
      { investor: john, shares: 1000, avg: 100 },
    ];
    for (const h of holdings) {
      await db.shareHolding.upsert({
        where: { shareClassId_investorId: { shareClassId: shareClass.id, investorId: h.investor.id } },
        update: { sharesOwned: h.shares, averageCostPerShare: h.avg },
        create: {
          propertyId: rental.id,
          shareClassId: shareClass.id,
          investorId: h.investor.id,
          sharesOwned: h.shares,
          averageCostPerShare: h.avg,
        },
      });
    }
    console.log(`✓ Holdings set for 3 investors (6000 of ${totalShares} shares issued)`);

    // Resting orders: clear previous demo orders on this class, then create a
    // visible book — two sellers (Naledi, Thabo) and one resting buyer (John).
    // The buy price sits below the asks so nothing crosses and all rows show.
    await db.shareOrder.deleteMany({
      where: {
        shareClassId: shareClass.id,
        status: { in: ["OPEN", "PARTIALLY_FILLED"] },
        investorId: { in: investors.map((i) => i.id) },
      },
    });
    await db.shareOrder.createMany({
      data: [
        { shareClassId: shareClass.id, investorId: naledi.id, side: "SELL", quantity: 500, pricePerShare: 110 },
        { shareClassId: shareClass.id, investorId: thabo.id, side: "SELL", quantity: 300, pricePerShare: 108 },
        { shareClassId: shareClass.id, investorId: john.id, side: "BUY", quantity: 200, pricePerShare: 100 },
      ],
    });
    console.log("✓ Order book seeded: 2 sell offers + 1 buy offer (cross-investor)");

    // Fund John's wallet so he can buy a seller's shares and settle INSTANTLY.
    const johnWallet = await db.wallet.upsert({
      where: { userId: john.id },
      update: {},
      create: { userId: john.id, balanceCents: 0 },
    });
    const targetCents = 5_000_000; // R50,000
    if (johnWallet.balanceCents < targetCents) {
      const topUp = targetCents - johnWallet.balanceCents;
      await db.$transaction([
        db.walletTransaction.create({
          data: {
            walletId: johnWallet.id,
            type: "DEPOSIT",
            amountCents: topUp,
            balanceAfter: targetCents,
            status: "COMPLETED",
            reference: `demo-seed-topup-${Date.now()}`,
            description: "Demo seed wallet top-up for instant trade settlement",
          },
        }),
        db.wallet.update({ where: { id: johnWallet.id }, data: { balanceCents: targetCents } }),
      ]);
      console.log(`✓ Funded ${john.email} wallet to R${(targetCents / 100).toFixed(0)} for instant DvP`);
    } else {
      console.log(`• ${john.email} wallet already funded (R${(johnWallet.balanceCents / 100).toFixed(0)})`);
    }

    console.log(
      `\nDemo trade walkthrough: log in as ${john.email} (password123) → Portfolio → Marketplace →` +
        ` ${rental.title}. The order book shows ${naledi.investorCode} selling 500 @ R110 and` +
        ` ${thabo.investorCode} selling 300 @ R108. Tap Buy at R108 → it matches Thabo (not John) and` +
        ` settles instantly from John's funded wallet.`,
    );
  }

  console.log("\n✓ Seed complete.");
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
