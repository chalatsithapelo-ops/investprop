// Greenfield demo seed: 3 development projects (build-and-sell, commercial
// rental, affordable rental) each with a professional team, statutory
// approvals, unit inventory and sample double-entry journal postings so the
// General Ledger, Trial Balance, Capital Accounts and Project Readiness screens
// are demonstrable end-to-end.
//
// Usage: node scripts/seed-greenfield-demo.mjs
// Idempotent: deletes any existing project with the same title (cascade) first.

import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";

const db = new PrismaClient();

// Minimal mirror of src/accounting-calculations.ts CHART_OF_ACCOUNTS so the
// seed can denormalise account name/type onto each journal line.
const ACCOUNTS = {
  "1000": { name: "Bank", type: "ASSET" },
  "1200": { name: "Development WIP / Inventory", type: "ASSET" },
  "2000": { name: "Contract Liabilities (customer deposits)", type: "LIABILITY" },
  "2100": { name: "Retention Payable", type: "LIABILITY" },
  "2200": { name: "VAT Output (payable)", type: "LIABILITY" },
  "3000": { name: "Investor Capital", type: "EQUITY" },
  "4000": { name: "Development Sales Revenue", type: "INCOME" },
  "5000": { name: "Cost of Sales", type: "EXPENSE" },
};

function line(accountCode, debit, credit, memo, investorId) {
  const a = ACCOUNTS[accountCode];
  if (!a) throw new Error(`Unknown account ${accountCode}`);
  return {
    accountCode,
    accountName: a.name,
    accountType: a.type,
    debit: debit || 0,
    credit: credit || 0,
    memo: memo || null,
    investorId: investorId ?? null,
  };
}

async function postEntry(db, propertyId, postedById, kind, date, description, reference, lines) {
  const totalDebit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
  if (totalDebit !== totalCredit) {
    throw new Error(`Unbalanced ${kind} on property ${propertyId}: ${totalDebit} != ${totalCredit}`);
  }
  return db.journalEntry.create({
    data: {
      propertyId,
      kind,
      entryDate: date,
      description,
      reference: reference || null,
      postedById,
      lines: { create: lines },
    },
  });
}

async function resetProjectByTitle(title) {
  const existing = await db.property.findFirst({ where: { title } });
  if (existing) {
    // Cascade relations (dev, units, approvals, professionals, journal) drop on delete.
    await db.property.delete({ where: { id: existing.id } });
  }
}

async function main() {
  console.log("Seeding greenfield demo projects...");
  const password = await bcryptjs.hash("password123", 10);

  const manager = await db.user.upsert({
    where: { email: "devmanager@demo.com" },
    update: { password, role: "DEVELOPMENT_MANAGER", emailVerified: true },
    create: {
      email: "devmanager@demo.com",
      password,
      name: "Sarah Development",
      role: "DEVELOPMENT_MANAGER",
      emailVerified: true,
      updatedAt: new Date(),
    },
  });

  // Ensure three verified investors for capital accounts.
  const investorDefs = [
    { email: "investor@demo.com", name: "John Investor" },
    { email: "investor2@demo.com", name: "Naledi Mokoena" },
    { email: "investor3@demo.com", name: "Thabo Ndlovu" },
  ];
  const investors = [];
  for (const i of investorDefs) {
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
    investors.push(u);
  }

  const mgr = manager.id;
  const D = (s) => new Date(s);

  // ======================================================================
  // PROJECT 1 — Build-and-sell (AFFORDABLE_RESALE): 12 units, construction-ready
  // ======================================================================
  const title1 = "Midrand Affordable Homes (Build & Sell)";
  await resetProjectByTitle(title1);
  const p1 = await db.property.create({
    data: {
      title: title1,
      description: "12-unit affordable freehold development for sale. Fully approved, team appointed.",
      address: "Erf 5521, Midrand",
      city: "Midrand",
      state: "Gauteng",
      zipCode: "1685",
      price: 24000000,
      imageUrl: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800",
      isPublished: true,
      investmentStatus: "FUNDED",
      fundingGoal: 8000000,
      minimumInvestment: 100000,
      expectedReturns: 24,
      bedrooms: 3,
      bathrooms: 2,
      squareMeters: 4000,
      userId: mgr,
    },
  });
  await db.propertyDevelopment.create({
    data: {
      propertyId: p1.id,
      projectName: "Midrand Affordable Homes",
      totalBudget: 18000000,
      startDate: D("2026-03-01"),
      estimatedEndDate: D("2027-09-01"),
      numberOfUnits: 12,
      landAcquisitionCost: 3000000,
      hardCosts: 12000000,
      softCosts: 1800000,
      financingCosts: 600000,
      contingencyPercent: 10,
      contingencyAmount: 1200000,
      expectedSalePricePerUnit: 2000000,
      totalExpectedRevenue: 24000000,
      expectedProfit: 5400000,
      expectedROI: 30,
      expectedIRR: 24,
      developmentTimelineMonths: 18,
      developmentType: "AFFORDABLE_RESALE",
      totalSquareMeters: 4000,
      equityAmount: 8000000,
      seniorDebtAmount: 10000000,
      seniorDebtRate: 11.5,
      preSaleThresholdPercent: 30,
      vatApplicable: true,
      peakFunding: 15000000,
      developmentStage: "CONSTRUCTION",
      userId: mgr,
      fundingGoal: 8000000,
    },
  });

  // Professional team — all appointed.
  const team1 = [
    ["TOWN_PLANNER", "Urban Edge Planning", "SACPLAN", 180000],
    ["ARCHITECT", "Studio 9 Architects", "SACAP", 420000],
    ["QUANTITY_SURVEYOR", "Cost Logic QS", "SACQSP", 260000],
    ["CIVIL_ENGINEER", "Terra Civils", "ECSA", 310000],
    ["STRUCTURAL_ENGINEER", "Stratum Structural", "ECSA", 280000],
    ["HEALTH_SAFETY_AGENT", "SafeSite Agents", "SACPCMP", 150000],
  ];
  for (const [role, firm, body, fee] of team1) {
    await db.developmentProfessional.create({
      data: {
        propertyId: p1.id,
        role,
        isRequired: true,
        status: "APPOINTED",
        firmName: firm,
        registrationBody: body,
        feeAmount: fee,
        appointedAt: D("2026-02-01"),
        createdById: mgr,
      },
    });
  }

  // Statutory approvals — all approved.
  const approvals1 = [
    "REZONING", "SITE_DEVELOPMENT_PLAN", "BUILDING_PLANS", "ENVIRONMENTAL_AUTHORISATION", "NHBRC_ENROLMENT",
  ];
  for (const type of approvals1) {
    await db.developmentApproval.create({
      data: {
        propertyId: p1.id,
        type,
        status: "APPROVED",
        isRequired: true,
        authority: "City of Johannesburg",
        decisionAt: D("2026-02-15"),
        createdById: mgr,
      },
    });
  }

  // Unit inventory — mix of sold/reserved/available.
  for (let i = 1; i <= 12; i++) {
    const status = i <= 4 ? "SOLD" : i <= 6 ? "RESERVED" : "AVAILABLE";
    await db.developmentUnit.create({
      data: {
        propertyId: p1.id,
        unitNumber: `U${String(i).padStart(2, "0")}`,
        status,
        sizeSqm: 95,
        listPrice: 2000000,
        soldPrice: status === "SOLD" ? 2000000 : null,
        buyerName: status === "SOLD" ? `Buyer ${i}` : null,
        depositPaid: status === "SOLD" || status === "RESERVED" ? 200000 : 0,
        bondApproved: status === "SOLD",
        reservedAt: status !== "AVAILABLE" ? D("2026-04-01") : null,
        soldAt: status === "SOLD" ? D("2026-05-01") : null,
        createdById: mgr,
      },
    });
  }

  // Journal postings — capital in, deposits, one transfer with revenue + VAT.
  await postEntry(db, p1.id, mgr, "CAPITAL_CONTRIBUTION", D("2026-02-05"), `Capital contribution — ${investors[0].name}`, `INV-${investors[0].id}`, [
    line("1000", 4000000, 0, "Cash received"),
    line("3000", 0, 4000000, "Investor capital", investors[0].id),
  ]);
  await postEntry(db, p1.id, mgr, "CAPITAL_CONTRIBUTION", D("2026-02-06"), `Capital contribution — ${investors[1].name}`, `INV-${investors[1].id}`, [
    line("1000", 2500000, 0, "Cash received"),
    line("3000", 0, 2500000, "Investor capital", investors[1].id),
  ]);
  await postEntry(db, p1.id, mgr, "CAPITAL_CONTRIBUTION", D("2026-02-07"), `Capital contribution — ${investors[2].name}`, `INV-${investors[2].id}`, [
    line("1000", 1500000, 0, "Cash received"),
    line("3000", 0, 1500000, "Investor capital", investors[2].id),
  ]);
  // Deposits for 6 units (sold + reserved).
  for (let i = 1; i <= 6; i++) {
    await postEntry(db, p1.id, mgr, "DEPOSIT_RECEIVED", D("2026-04-10"), `Deposit received — U${String(i).padStart(2, "0")}`, `U${String(i).padStart(2, "0")}`, [
      line("1000", 200000, 0, "Cash received"),
      line("2000", 0, 200000, "Contract liability"),
    ]);
  }
  // Transfer of 2 units — IFRS 15 revenue recognition with 15% output VAT.
  for (let i = 1; i <= 2; i++) {
    const ref = `U${String(i).padStart(2, "0")}`;
    const gross = 2000000;
    const vat = Math.round((gross * 0.15) / 1.15 * 100) / 100; // 260869.57
    const net = Math.round((gross - vat) * 100) / 100; // 1739130.43
    const cost = 1300000;
    await postEntry(db, p1.id, mgr, "REVENUE_RECOGNITION", D("2026-05-15"), `Revenue recognised on transfer — ${ref}`, ref, [
      line("2000", 200000, 0, "Release deposit"),
      line("1000", 1800000, 0, "Transfer proceeds"),
      line("4000", 0, net, "Development sales revenue"),
      line("2200", 0, vat, "Output VAT at transfer"),
      line("5000", cost, 0, "Cost of sales"),
      line("1200", 0, cost, "Release inventory"),
    ]);
  }

  console.log(`  ✓ ${title1}`);

  // ======================================================================
  // PROJECT 2 — Commercial rental (COMMERCIAL_RENTAL): approvals pending
  // ======================================================================
  const title2 = "Centurion Neighbourhood Centre (Commercial Rental)";
  await resetProjectByTitle(title2);
  const p2 = await db.property.create({
    data: {
      title: title2,
      description: "4,500sqm GLA neighbourhood retail centre to hold for rental income. In entitlements.",
      address: "Cnr John Vorster & Lenchen, Centurion",
      city: "Centurion",
      state: "Gauteng",
      zipCode: "0157",
      price: 62000000,
      imageUrl: "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=800",
      isPublished: true,
      investmentStatus: "RAISING_FUNDS",
      fundingGoal: 22000000,
      minimumInvestment: 250000,
      expectedReturns: 16,
      squareMeters: 4500,
      userId: mgr,
    },
  });
  await db.propertyDevelopment.create({
    data: {
      propertyId: p2.id,
      projectName: "Centurion Neighbourhood Centre",
      totalBudget: 55000000,
      startDate: D("2026-10-01"),
      estimatedEndDate: D("2028-06-01"),
      numberOfUnits: 18,
      landAcquisitionCost: 12000000,
      hardCosts: 34000000,
      softCosts: 5000000,
      financingCosts: 2500000,
      contingencyPercent: 8,
      contingencyAmount: 2720000,
      developmentTimelineMonths: 20,
      developmentType: "COMMERCIAL_RENTAL",
      expectedMonthlyRentPerUnit: 55000,
      annualOperatingExpenses: 2400000,
      stabilizedCapRate: 9.0,
      expectedGrossYield: 11.5,
      expectedNetYield: 8.8,
      totalSquareMeters: 4500,
      equityAmount: 22000000,
      seniorDebtAmount: 25000000,
      seniorDebtRate: 11.75,
      vatApplicable: true,
      peakFunding: 48000000,
      developmentStage: "PLANNING_APPROVALS",
      userId: mgr,
      fundingGoal: 22000000,
    },
  });
  const team2 = [
    ["TOWN_PLANNER", "Urban Edge Planning", "SACPLAN", 320000, "APPOINTED"],
    ["ARCHITECT", "Metro Commercial Architects", "SACAP", 780000, "APPOINTED"],
    ["QUANTITY_SURVEYOR", "Cost Logic QS", "SACQSP", 540000, "APPOINTED"],
    ["CIVIL_ENGINEER", "Terra Civils", "ECSA", 460000, "APPOINTED"],
    ["TRAFFIC_ENGINEER", "FlowLine Traffic", "ECSA", 210000, "SHORTLISTED"],
    ["FIRE_CONSULTANT", "Ignis Fire", "SAQCC", 180000, "NOT_APPOINTED"],
  ];
  for (const [role, firm, body, fee, status] of team2) {
    await db.developmentProfessional.create({
      data: {
        propertyId: p2.id,
        role,
        isRequired: true,
        status,
        firmName: firm,
        registrationBody: body,
        feeAmount: fee,
        appointedAt: status === "APPOINTED" ? D("2026-08-01") : null,
        createdById: mgr,
      },
    });
  }
  const approvals2 = [
    ["REZONING", "APPROVED"],
    ["SITE_DEVELOPMENT_PLAN", "IN_REVIEW"],
    ["TRAFFIC_IMPACT_APPROVAL", "SUBMITTED"],
    ["BUILDING_PLANS", "NOT_STARTED"],
    ["ENVIRONMENTAL_AUTHORISATION", "IN_REVIEW"],
    ["BULK_SERVICES_AGREEMENT", "NOT_STARTED"],
  ];
  for (const [type, status] of approvals2) {
    await db.developmentApproval.create({
      data: {
        propertyId: p2.id,
        type,
        status,
        isRequired: true,
        authority: "City of Tshwane",
        submittedAt: status !== "NOT_STARTED" ? D("2026-07-01") : null,
        createdById: mgr,
      },
    });
  }
  // Partial capital raised so far.
  await postEntry(db, p2.id, mgr, "CAPITAL_CONTRIBUTION", D("2026-07-10"), `Capital contribution — ${investors[0].name}`, `INV-${investors[0].id}`, [
    line("1000", 5000000, 0, "Cash received"),
    line("3000", 0, 5000000, "Investor capital", investors[0].id),
  ]);
  await postEntry(db, p2.id, mgr, "CAPITAL_CONTRIBUTION", D("2026-07-12"), `Capital contribution — ${investors[2].name}`, `INV-${investors[2].id}`, [
    line("1000", 3000000, 0, "Cash received"),
    line("3000", 0, 3000000, "Investor capital", investors[2].id),
  ]);
  console.log(`  ✓ ${title2}`);

  // ======================================================================
  // PROJECT 3 — Affordable rental (AFFORDABLE_RENTAL): early appraisal
  // ======================================================================
  const title3 = "Soshanguve SHRA Social Rental (Affordable Rental)";
  await resetProjectByTitle(title3);
  const p3 = await db.property.create({
    data: {
      title: title3,
      description: "40-unit SHRA-backed social rental block. Early appraisal — assembling team & approvals.",
      address: "Block H, Soshanguve",
      city: "Pretoria",
      state: "Gauteng",
      zipCode: "0152",
      price: 34000000,
      imageUrl: "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=800",
      isPublished: true,
      investmentStatus: "PLANNING",
      fundingGoal: 12000000,
      minimumInvestment: 100000,
      expectedReturns: 14,
      squareMeters: 3200,
      userId: mgr,
    },
  });
  await db.propertyDevelopment.create({
    data: {
      propertyId: p3.id,
      projectName: "Soshanguve SHRA Social Rental",
      totalBudget: 30000000,
      startDate: D("2027-01-01"),
      estimatedEndDate: D("2028-10-01"),
      numberOfUnits: 40,
      landAcquisitionCost: 4000000,
      hardCosts: 21000000,
      softCosts: 3000000,
      financingCosts: 1500000,
      contingencyPercent: 10,
      contingencyAmount: 3000000,
      developmentTimelineMonths: 22,
      developmentType: "AFFORDABLE_RENTAL",
      expectedMonthlyRentPerUnit: 4200,
      annualOperatingExpenses: 960000,
      stabilizedCapRate: 8.0,
      expectedGrossYield: 9.5,
      expectedNetYield: 7.2,
      totalSquareMeters: 3200,
      equityAmount: 12000000,
      seniorDebtAmount: 14000000,
      seniorDebtRate: 10.5,
      vatApplicable: false,
      peakFunding: 26000000,
      developmentStage: "APPRAISAL",
      userId: mgr,
      fundingGoal: 12000000,
    },
  });
  const team3 = [
    ["TOWN_PLANNER", "Urban Edge Planning", "SACPLAN", 240000, "SHORTLISTED"],
    ["ARCHITECT", "Social Housing Studio", "SACAP", 560000, "NOT_APPOINTED"],
    ["QUANTITY_SURVEYOR", "Cost Logic QS", "SACQSP", 380000, "NOT_APPOINTED"],
    ["CIVIL_ENGINEER", "Terra Civils", "ECSA", 400000, "NOT_APPOINTED"],
  ];
  for (const [role, firm, body, fee, status] of team3) {
    await db.developmentProfessional.create({
      data: {
        propertyId: p3.id,
        role,
        isRequired: true,
        status,
        firmName: firm,
        registrationBody: body,
        feeAmount: fee,
        createdById: mgr,
      },
    });
  }
  const approvals3 = ["REZONING", "TOWNSHIP_ESTABLISHMENT", "SITE_DEVELOPMENT_PLAN", "ENVIRONMENTAL_AUTHORISATION"];
  for (const type of approvals3) {
    await db.developmentApproval.create({
      data: {
        propertyId: p3.id,
        type,
        status: "NOT_STARTED",
        isRequired: true,
        authority: "City of Tshwane / SHRA",
        createdById: mgr,
      },
    });
  }
  console.log(`  ✓ ${title3}`);

  console.log("\n✓ Greenfield demo ready");
  console.log("  Manager: devmanager@demo.com (password123)");
  console.log("  3 development projects with teams, approvals, units & ledger postings");
  console.log("  View: /admin/ledger and /admin/development-readiness");
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
