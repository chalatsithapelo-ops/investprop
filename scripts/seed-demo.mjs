// Demo seed: creates users + 3 properties + 6 distressed listings
// Usage: node scripts/seed-demo.mjs

import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("Seeding demo data...");
  const password = await bcryptjs.hash("password123", 10);

  // Dev Manager (matches login page tile)
  const manager = await db.user.upsert({
    where: { email: "devmanager@demo.com" },
    update: { password },
    create: {
      email: "devmanager@demo.com",
      password,
      name: "Sarah Development",
      role: "DEVELOPMENT_MANAGER",
      emailVerified: true,
      updatedAt: new Date(),
    },
  });
  if (!manager.investorCode) {
    await db.user.update({
      where: { id: manager.id },
      data: { investorCode: `IP-INV-${String(manager.id).padStart(5, "0")}` },
    });
  }

  // Investors
  const investorRows = [
    { email: "investor@demo.com", name: "John Investor" },
    { email: "investor2@demo.com", name: "Naledi Mokoena" },
    { email: "investor3@demo.com", name: "Thabo Ndlovu" },
  ];
  for (const i of investorRows) {
    const u = await db.user.upsert({
      where: { email: i.email },
      update: { password },
      create: {
        email: i.email,
        password,
        name: i.name,
        role: "INVESTOR",
        emailVerified: true,
        ficaVerified: true,
        ficaVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    if (!u.investorCode) {
      await db.user.update({
        where: { id: u.id },
        data: { investorCode: `IP-INV-${String(u.id).padStart(5, "0")}` },
      });
    }
  }

  // Other roles (matches login page tiles)
  const otherRows = [
    { email: "pm@demo.com", name: "Mike Projects", role: "PROJECT_MANAGER" },
    { email: "owner@demo.com", name: "Olivia Owner", role: "PROPERTY_OWNER" },
    { email: "contractor@demo.com", name: "Carlos Contractor", role: "CONTRACTOR" },
  ];
  for (const r of otherRows) {
    await db.user.upsert({
      where: { email: r.email },
      update: { password },
      create: {
        email: r.email,
        password,
        name: r.name,
        role: r.role,
        emailVerified: true,
        updatedAt: new Date(),
      },
    });
  }

  // Property 1: Flip
  const flipProp = await db.property.create({
    data: {
      title: "Sandton Townhouse Flip",
      description: "3-bed townhouse, undervalued, ARV R3.5M after R350k renovation.",
      address: "12 Rivonia Rd, Sandton",
      city: "Sandton",
      state: "Gauteng",
      zipCode: "2196",
      price: 2100000,
      imageUrl: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
      isPublished: true,
      investmentStatus: "RAISING_FUNDS",
      fundingGoal: 2450000,
      minimumInvestment: 50000,
      expectedReturns: 22,
      bedrooms: 3,
      bathrooms: 2,
      squareMeters: 140,
      userId: manager.id,
    },
  });
  await db.propertyFlip.create({
    data: {
      propertyId: flipProp.id,
      flipType: "RESALE",
      purchasePrice: 2100000,
      renovationBudget: 350000,
      estimatedValue: 3500000,
      afterRepairValue: 3500000,
      estimatedRepairCosts: 350000,
      holdingCosts: 80000,
      closingCostsPurchase: 50000,
      closingCostsSale: 175000,
      expectedROI: 22,
      expectedProfitMargin: 15,
      daysToComplete: 180,
      totalInvestmentBudget: 2700000,
      userId: manager.id,
    },
  });

  // Property 2: Rental
  const rentalProp = await db.property.create({
    data: {
      title: "Cape Town Rental Apartment",
      description: "Sea Point 2-bed buy-to-let, R18k/month gross rent.",
      address: "45 Beach Rd, Sea Point",
      city: "Cape Town",
      state: "Western Cape",
      zipCode: "8005",
      price: 2800000,
      imageUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800",
      isPublished: true,
      investmentStatus: "RAISING_FUNDS",
      fundingGoal: 700000,
      minimumInvestment: 25000,
      expectedReturns: 9.5,
      bedrooms: 2,
      bathrooms: 2,
      squareMeters: 85,
      userId: manager.id,
    },
  });
  await db.rentalBond.create({
    data: {
      propertyId: rentalProp.id,
      bondAmount: 2240000,
      monthlyRent: 18000,
      leaseStartDate: new Date("2026-06-01"),
      leaseEndDate: new Date("2027-05-31"),
      purchasePrice: 2800000,
      annualPropertyTax: 12000,
      annualInsurance: 8400,
      monthlyMaintenanceReserve: 1500,
      monthlyManagementFee: 1440,
      vacancyRate: 5,
      appreciationRate: 6,
      downPaymentAmount: 560000,
      loanAmount: 2240000,
      interestRate: 11.5,
      loanTermYears: 20,
      totalInvestmentBudget: 700000,
      userId: manager.id,
    },
  });

  // Property 3: Development
  const devProp = await db.property.create({
    data: {
      title: "Pretoria East Affordable Rental Development",
      description: "8-unit affordable rental development on 2000sqm site.",
      address: "Erf 1234, Centurion",
      city: "Pretoria",
      state: "Gauteng",
      zipCode: "0157",
      price: 8500000,
      imageUrl: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800",
      isPublished: true,
      investmentStatus: "RAISING_FUNDS",
      fundingGoal: 3000000,
      minimumInvestment: 100000,
      expectedReturns: 18,
      bedrooms: 2,
      bathrooms: 1,
      squareMeters: 2000,
      userId: manager.id,
    },
  });
  await db.propertyDevelopment.create({
    data: {
      propertyId: devProp.id,
      projectName: "Centurion Affordable Rentals",
      totalBudget: 8500000,
      startDate: new Date("2026-07-01"),
      estimatedEndDate: new Date("2028-01-01"),
      numberOfUnits: 8,
      landAcquisitionCost: 1500000,
      hardCosts: 6000000,
      softCosts: 600000,
      contingencyPercent: 10,
      contingencyAmount: 600000,
      expectedSalePricePerUnit: 1500000,
      totalExpectedRevenue: 12000000,
      expectedProfit: 3500000,
      expectedROI: 41,
      expectedIRR: 22,
      developmentTimelineMonths: 18,
      developmentType: "AFFORDABLE_RENTAL",
      expectedMonthlyRentPerUnit: 6500,
      annualOperatingExpenses: 180000,
      stabilizedCapRate: 8.5,
      totalSquareMeters: 2000,
      userId: manager.id,
      fundingGoal: 3000000,
    },
  });

  // Distressed listings
  const listings = [
    { suburb: "Roodepoort", city: "Johannesburg", province: "Gauteng", price: 850000, mv: 1300000, type: "HOUSE" },
    { suburb: "Goodwood", city: "Cape Town", province: "Western Cape", price: 1200000, mv: 1800000, type: "APARTMENT" },
    { suburb: "Pinetown", city: "Durban", province: "KwaZulu-Natal", price: 950000, mv: 1450000, type: "HOUSE" },
    { suburb: "Centurion", city: "Pretoria", province: "Gauteng", price: 1400000, mv: 2100000, type: "HOUSE" },
    { suburb: "Walmer", city: "Port Elizabeth", province: "Eastern Cape", price: 720000, mv: 1100000, type: "APARTMENT" },
    { suburb: "Universitas", city: "Bloemfontein", province: "Free State", price: 680000, mv: 1050000, type: "HOUSE" },
  ];
  for (let i = 0; i < listings.length; i++) {
    const d = listings[i];
    await db.distressedListing.upsert({
      where: { source_externalId: { source: "MANUAL", externalId: `seed-${i}` } },
      update: {},
      create: {
        source: "MANUAL",
        externalId: `seed-${i}`,
        sourceUrl: `https://example.com/listing/${i}`,
        title: `Distressed ${d.suburb} ${d.type === "HOUSE" ? "house" : "apartment"}`,
        propertyType: d.type,
        suburb: d.suburb,
        city: d.city,
        province: d.province,
        askingPrice: d.price,
        marketValue: d.mv,
        discount: Math.round(((d.mv - d.price) / d.mv) * 100),
        bedrooms: 3,
        bathrooms: 2,
        auctionType: "BANK_REPO",
        status: "ACTIVE",
      },
    });
  }

  console.log("\n✓ Demo data ready (all passwords: password123)");
  console.log("  Manager:   devmanager@demo.com");
  console.log("  Investors: investor@demo.com, investor2@demo.com, investor3@demo.com");
  console.log("  Other:     pm@demo.com, owner@demo.com, contractor@demo.com");
  console.log("  3 properties + 6 distressed listings");
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
