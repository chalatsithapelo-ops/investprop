import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

// ═══════════════════════════════════════════════════════════════
//  SPV FINANCIAL REPORTING AUTOMATION
//  Generates: Income Statement, Balance Sheet, Investor Statement,
//             Annual Tax Report, SPV Portfolio Summary
// ═══════════════════════════════════════════════════════════════

// ─── SPV Income Statement (P&L) ───────────────────────────────

export const getSPVIncomeStatement = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      fromDate: z.string(),      // ISO date "2025-03-01"
      toDate: z.string(),        // ISO date "2026-02-28"
      taxYear: z.string().optional(), // e.g. "2026"
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const from = new Date(input.fromDate);
    const to = new Date(input.toDate);

    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: {
        id: true,
        title: true,
        address: true,
        city: true,
        price: true,
        fundingGoal: true,
        spv: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
            taxNumber: true,
            status: true,
          },
        },
      },
    });

    if (!property) return null;

    // Financial entries
    const entries = await db.propertyFinancialEntry.findMany({
      where: {
        propertyId: input.propertyId,
        date: { gte: from, lte: to },
      },
      orderBy: { date: "asc" },
    });

    // Distributions in period
    const distributions = await db.distribution.findMany({
      where: {
        propertyId: input.propertyId,
        createdAt: { gte: from, lte: to },
      },
      include: {
        payouts: true,
      },
    });

    // Revenue breakdown
    const income = entries.filter((e) => e.type === "INCOME");
    const expenses = entries.filter((e) => e.type === "EXPENSE");

    const revenueByCategory: Record<string, number> = {};
    for (const e of income) {
      revenueByCategory[e.category] = (revenueByCategory[e.category] ?? 0) + e.amount;
    }

    const expenseByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amount;
    }

    const totalRevenue = income.reduce((s, e) => s + e.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netOperatingIncome = totalRevenue - totalExpenses;

    // Tax calculations (27% corporate tax rate)
    const corporateTaxRate = 0.27;
    const taxableIncome = Math.max(0, netOperatingIncome);
    const estimatedCorporateTax = taxableIncome * corporateTaxRate;
    const profitAfterTax = netOperatingIncome - estimatedCorporateTax;

    // Distributions summary
    const totalDistributed = distributions.reduce((s, d) => s + d.netAmount, 0);
    const totalMgmtFees = distributions.reduce((s, d) => s + d.managementFee, 0);
    const totalDWT = distributions
      .flatMap((d) => d.payouts)
      .reduce((s, p) => s + p.taxWithheld, 0);

    // Monthly revenue/expense trend
    const monthlyTrend: Record<string, { revenue: number; expenses: number }> = {};
    for (const e of entries) {
      const month = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyTrend[month]) monthlyTrend[month] = { revenue: 0, expenses: 0 };
      if (e.type === "INCOME") monthlyTrend[month]!.revenue += e.amount;
      else monthlyTrend[month]!.expenses += e.amount;
    }

    const monthlyData = Object.entries(monthlyTrend)
      .map(([month, data]) => ({ month, ...data, net: data.revenue - data.expenses }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Yield calculations
    const propertyValue = property.price ?? property.fundingGoal;
    const grossYield = propertyValue > 0 ? (totalRevenue / propertyValue) * 100 : 0;
    const netYield = propertyValue > 0 ? (netOperatingIncome / propertyValue) * 100 : 0;

    return {
      property: {
        id: property.id,
        title: property.title,
        address: `${property.address}, ${property.city}`,
        value: propertyValue,
      },
      spv: property.spv,
      period: { from: input.fromDate, to: input.toDate, taxYear: input.taxYear },
      revenue: {
        total: totalRevenue,
        byCategory: Object.entries(revenueByCategory).map(([category, amount]) => ({ category, amount })),
      },
      expenses: {
        total: totalExpenses,
        byCategory: Object.entries(expenseByCategory).map(([category, amount]) => ({ category, amount })),
      },
      netOperatingIncome,
      tax: {
        corporateTaxRate,
        taxableIncome,
        estimatedCorporateTax,
        profitAfterTax,
      },
      distributions: {
        totalDistributed,
        totalMgmtFees,
        totalDWT,
        count: distributions.length,
      },
      yields: { grossYield, netYield },
      monthlyTrend: monthlyData,
      generatedAt: new Date().toISOString(),
    };
  });

// ─── SPV Balance Sheet ────────────────────────────────────────

export const getSPVBalanceSheet = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      asAtDate: z.string(), // ISO date
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const asAt = new Date(input.asAtDate);

    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: {
        id: true,
        title: true,
        price: true,
        fundingGoal: true,
        fundingRaised: true,
        spv: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
            taxNumber: true,
            bankName: true,
            bankAccountNumber: true,
          },
        },
      },
    });

    if (!property) return null;

    // All financial entries to date
    const entries = await db.propertyFinancialEntry.findMany({
      where: { propertyId: input.propertyId, date: { lte: asAt } },
    });

    const totalIncome = entries.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0);
    const totalExpenses = entries.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + e.amount, 0);
    const retainedEarnings = totalIncome - totalExpenses;

    // Total distributions paid out
    const distPaid = await db.distribution.aggregate({
      _sum: { netAmount: true },
      where: {
        propertyId: input.propertyId,
        status: "DISTRIBUTED",
        distributedAt: { lte: asAt },
      },
    });
    const totalDistributed = distPaid._sum.netAmount ?? 0;

    // Shareholder equity
    const shareClasses = await db.shareClass.findMany({
      where: { propertyId: input.propertyId },
      include: {
        holdings: {
          include: { investor: { select: { id: true, name: true } } },
        },
      },
    });

    const shareCapital = shareClasses.reduce(
      (s, sc) => s + sc.holdings.reduce((h, hold) => h + hold.sharesOwned * sc.pricePerShare, 0),
      0,
    );

    // Investor contributions
    const contributions = await db.investorContribution.aggregate({
      _sum: { contributionAmount: true },
      where: {
        propertyId: input.propertyId,
        status: "APPROVED",
      },
    });
    const totalContributions = contributions._sum.contributionAmount ?? 0;

    // Assets
    const propertyValue = property.price; // At cost (could be revalued)
    const cashReserve = totalContributions + totalIncome - totalExpenses - totalDistributed;

    // Liabilities (could be expanded with bond/loan tracking)
    const totalLiabilities = 0; // placeholder for bonds/loans

    // Equity
    const totalEquity = shareCapital + (retainedEarnings - totalDistributed);

    return {
      property: { id: property.id, title: property.title, value: propertyValue },
      spv: property.spv,
      asAtDate: input.asAtDate,
      assets: {
        propertyAtCost: propertyValue,
        cashAndEquivalents: Math.max(0, cashReserve),
        totalAssets: propertyValue + Math.max(0, cashReserve),
      },
      liabilities: {
        currentLiabilities: 0,
        longTermDebt: 0,
        totalLiabilities,
      },
      equity: {
        shareCapital,
        retainedEarnings: retainedEarnings - totalDistributed,
        totalEquity,
      },
      shareholders: shareClasses.flatMap((sc) =>
        sc.holdings.map((h) => ({
          investorId: h.investorId,
          investorName: h.investor.name,
          shareClass: sc.name,
          shares: h.sharesOwned,
          value: h.sharesOwned * sc.pricePerShare,
          percentage: sc.totalShares > 0 ? (h.sharesOwned / sc.totalShares) * 100 : 0,
        })),
      ),
      generatedAt: new Date().toISOString(),
    };
  });

// ─── Investor Statement ───────────────────────────────────────

export const getInvestorStatement = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const from = input.fromDate ? new Date(input.fromDate) : new Date(0);
    const to = input.toDate ? new Date(input.toDate) : new Date();

    // All holdings
    const holdings = await db.shareHolding.findMany({
      where: { investorId: user.id },
      include: {
        shareClass: { select: { name: true, pricePerShare: true, totalShares: true } },
        property: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            price: true,
            spv: {
              select: { id: true, name: true, registrationNumber: true },
            },
          },
        },
      },
    });

    // All payouts
    const payouts = await db.distributionPayout.findMany({
      where: {
        investorId: user.id,
        createdAt: { gte: from, lte: to },
      },
      include: {
        distribution: {
          select: { type: true, period: true, createdAt: true, propertyId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Contributions
    const contributions = await db.investorContribution.findMany({
      where: {
        investorId: user.id,
        status: "APPROVED",
      },
      include: {
        property: { select: { id: true, title: true } },
      },
      orderBy: { contributionDate: "desc" },
    });

    // Per-property summary
    const propertyMap = new Map<number, {
      propertyId: number;
      title: string;
      spvName: string | null;
      spvRegNumber: string | null;
      totalInvested: number;
      sharesOwned: number;
      ownershipPct: number;
      totalDividendsReceived: number;
      totalTaxWithheld: number;
      currentValue: number;
    }>();

    for (const h of holdings) {
      const existing = propertyMap.get(h.propertyId);
      const shareValue = h.sharesOwned * h.shareClass.pricePerShare;

      if (existing) {
        existing.sharesOwned += h.sharesOwned;
        existing.currentValue += shareValue;
        if (h.shareClass.totalShares > 0) {
          existing.ownershipPct += (h.sharesOwned / h.shareClass.totalShares) * 100;
        }
      } else {
        propertyMap.set(h.propertyId, {
          propertyId: h.propertyId,
          title: h.property.title,
          spvName: h.property.spv?.name ?? null,
          spvRegNumber: h.property.spv?.registrationNumber ?? null,
          totalInvested: 0,
          sharesOwned: h.sharesOwned,
          ownershipPct: h.shareClass.totalShares > 0 ? (h.sharesOwned / h.shareClass.totalShares) * 100 : 0,
          totalDividendsReceived: 0,
          totalTaxWithheld: 0,
          currentValue: shareValue,
        });
      }
    }

    // Add contribution amounts
    for (const c of contributions) {
      const entry = propertyMap.get(c.propertyId);
      if (entry) entry.totalInvested += c.contributionAmount;
    }

    // Add payout totals
    for (const p of payouts) {
      const entry = propertyMap.get(p.distribution.propertyId);
      if (entry) {
        entry.totalDividendsReceived += p.netAmount;
        entry.totalTaxWithheld += p.taxWithheld;
      }
    }

    const investments = Array.from(propertyMap.values());
    const totalInvested = investments.reduce((s, i) => s + i.totalInvested, 0);
    const totalCurrentValue = investments.reduce((s, i) => s + i.currentValue, 0);
    const totalDividends = investments.reduce((s, i) => s + i.totalDividendsReceived, 0);
    const totalTax = investments.reduce((s, i) => s + i.totalTaxWithheld, 0);

    return {
      investor: { id: user.id, name: user.name, email: user.email },
      period: { from: input.fromDate ?? "inception", to: input.toDate ?? "current" },
      summary: {
        totalInvested,
        totalCurrentValue,
        totalDividendsReceived: totalDividends,
        totalTaxWithheld: totalTax,
        unrealisedGainLoss: totalCurrentValue - totalInvested,
        totalReturn: totalInvested > 0 ? ((totalCurrentValue + totalDividends - totalInvested) / totalInvested) * 100 : 0,
        propertiesInvested: investments.length,
      },
      investments,
      recentPayouts: payouts.slice(0, 20).map((p) => ({
        date: p.createdAt,
        type: p.distribution.type,
        period: p.distribution.period,
        propertyId: p.distribution.propertyId,
        gross: p.grossAmount,
        taxWithheld: p.taxWithheld,
        net: p.netAmount,
        status: p.status,
      })),
      generatedAt: new Date().toISOString(),
    };
  });

// ─── Annual Tax Report (IT3 equivalent) ───────────────────────

export const getAnnualTaxReport = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      taxYear: z.number(), // SA tax year ending Feb, e.g. 2026 = Mar 2025 - Feb 2026
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    // SA tax year: 1 March to 28/29 February
    const from = new Date(`${input.taxYear - 1}-03-01`);
    const to = new Date(`${input.taxYear}-02-28`);

    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: {
        id: true,
        title: true,
        price: true,
        spv: {
          select: {
            name: true,
            registrationNumber: true,
            taxNumber: true,
          },
        },
      },
    });

    if (!property) return null;

    // P&L data
    const entries = await db.propertyFinancialEntry.findMany({
      where: {
        propertyId: input.propertyId,
        date: { gte: from, lte: to },
      },
    });

    const totalIncome = entries.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0);
    const totalExpenses = entries.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + e.amount, 0);

    // Expense categories for SARS deductions
    const deductibleExpenses: Record<string, number> = {};
    for (const e of entries.filter((e) => e.type === "EXPENSE")) {
      deductibleExpenses[e.category] = (deductibleExpenses[e.category] ?? 0) + e.amount;
    }

    // Distributions and DWT
    const distributions = await db.distribution.findMany({
      where: {
        propertyId: input.propertyId,
        createdAt: { gte: from, lte: to },
      },
      include: { payouts: true },
    });

    const dividendsPaid = distributions
      .filter((d) => d.type === "DIVIDEND")
      .reduce((s, d) => s + d.netAmount, 0);

    const dwtWithheld = distributions
      .flatMap((d) => d.payouts)
      .reduce((s, p) => s + p.taxWithheld, 0);

    // Per-investor DWT schedule (IT3(d) data)
    const investorDWT: Record<number, { investorId: number; totalDividends: number; dwtWithheld: number }> = {};
    for (const d of distributions) {
      for (const p of d.payouts) {
        if (!investorDWT[p.investorId]) {
          investorDWT[p.investorId] = { investorId: p.investorId, totalDividends: 0, dwtWithheld: 0 };
        }
        investorDWT[p.investorId]!.totalDividends += p.grossAmount;
        investorDWT[p.investorId]!.dwtWithheld += p.taxWithheld;
      }
    }

    // Corporate tax calculation
    const netProfit = totalIncome - totalExpenses;
    const taxableIncome = Math.max(0, netProfit);
    const corporateTax = taxableIncome * 0.27;

    // CGT if any sale proceeds recorded
    const saleProceeds = entries
      .filter((e) => e.category === "SALE_PROCEEDS")
      .reduce((s, e) => s + e.amount, 0);

    const baseCost = property.price;
    const capitalGain = saleProceeds > 0 ? saleProceeds - baseCost : 0;
    const cgtInclusion = capitalGain * 0.8; // 80% inclusion for companies
    const cgt = cgtInclusion * 0.27; // at corporate rate

    return {
      spv: property.spv,
      property: { id: property.id, title: property.title },
      taxYear: {
        year: input.taxYear,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
      incomeStatement: {
        totalIncome,
        totalExpenses,
        netProfit,
        deductibleExpenses: Object.entries(deductibleExpenses).map(([category, amount]) => ({ category, amount })),
      },
      corporateTax: {
        taxableIncome,
        rate: 0.27,
        estimatedTax: corporateTax,
      },
      dividendsTax: {
        totalDividendsDeclared: dividendsPaid,
        dwtRate: 0.20,
        totalDWTWithheld: dwtWithheld,
        investorSchedule: Object.values(investorDWT),
      },
      capitalGains: {
        saleProceeds,
        baseCost,
        capitalGain,
        inclusionRate: 0.80,
        includedGain: cgtInclusion,
        cgt,
      },
      totalEstimatedTax: corporateTax + cgt,
      generatedAt: new Date().toISOString(),
    };
  });

// ─── SPV Portfolio Summary (all properties in one SPV) ────────

export const getSPVPortfolioSummary = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      spvId: z.number(),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const spv = await db.sPV.findUnique({
      where: { id: input.spvId },
      include: {
        director: { select: { id: true, name: true } },
        properties: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            price: true,
            fundingGoal: true,
            fundingRaised: true,
            investmentStatus: true,
            shareClasses: {
              include: {
                holdings: {
                  include: {
                    investor: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!spv) return null;

    // Aggregate across all properties
    const totalPropertyValue = spv.properties.reduce((s, p) => s + p.price, 0);
    const totalFundingGoal = spv.properties.reduce((s, p) => s + p.fundingGoal, 0);
    const totalFundingRaised = spv.properties.reduce((s, p) => s + p.fundingRaised, 0);

    // Unique investors across all properties
    const investorSet = new Map<number, { id: number; name: string; properties: number; totalShares: number }>();
    for (const p of spv.properties) {
      for (const sc of p.shareClasses) {
        for (const h of sc.holdings) {
          const existing = investorSet.get(h.investorId);
          if (existing) {
            existing.properties += 1;
            existing.totalShares += h.sharesOwned;
          } else {
            investorSet.set(h.investorId, {
              id: h.investorId,
              name: h.investor.name,
              properties: 1,
              totalShares: h.sharesOwned,
            });
          }
        }
      }
    }

    // Distributions across all properties
    const propIds = spv.properties.map((p) => p.id);
    const totalDistributions = await db.distribution.aggregate({
      _sum: { netAmount: true },
      _count: true,
      where: { propertyId: { in: propIds } },
    });

    // Financial entries aggregate
    const entries = await db.propertyFinancialEntry.findMany({
      where: { propertyId: { in: propIds } },
    });
    const totalIncome = entries.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0);
    const totalExpenses = entries.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + e.amount, 0);

    return {
      spv: {
        id: spv.id,
        name: spv.name,
        registrationNumber: spv.registrationNumber,
        taxNumber: spv.taxNumber,
        status: spv.status,
        director: spv.director,
      },
      portfolio: {
        propertyCount: spv.properties.length,
        totalPropertyValue,
        totalFundingGoal,
        totalFundingRaised,
        fundingProgress: totalFundingGoal > 0 ? (totalFundingRaised / totalFundingGoal) * 100 : 0,
      },
      properties: spv.properties.map((p) => ({
        id: p.id,
        title: p.title,
        address: `${p.address}, ${p.city}`,
        value: p.price,
        fundingGoal: p.fundingGoal,
        fundingRaised: p.fundingRaised,
        investmentStatus: p.investmentStatus,
        investorCount: p.shareClasses.flatMap((sc) => sc.holdings).length,
      })),
      investors: Array.from(investorSet.values()),
      financials: {
        totalIncome,
        totalExpenses,
        netIncome: totalIncome - totalExpenses,
        totalDistributed: totalDistributions._sum.netAmount ?? 0,
        distributionCount: totalDistributions._count,
      },
      generatedAt: new Date().toISOString(),
    };
  });
