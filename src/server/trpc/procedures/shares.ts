import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";
import { createNotification } from "./notifications";

// ─── Create Share Class for a Property ─────────────────────────

export const createShareClass = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      name: z.string().default("Ordinary"),
      totalShares: z.number().int().min(1),
      pricePerShare: z.number().min(0.01),
      minimumShares: z.number().int().min(1).default(1),
      minimumInvestmentAmount: z.number().min(0).default(0),
      maxInvestors: z.number().int().min(1).nullish(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    // Auto-calculate: if minimumInvestmentAmount is 0, derive from minimumShares * pricePerShare
    const effectiveMinInvestment = input.minimumInvestmentAmount > 0
      ? input.minimumInvestmentAmount
      : input.minimumShares * input.pricePerShare;

    return db.shareClass.create({
      data: {
        propertyId: input.propertyId,
        name: input.name,
        totalShares: input.totalShares,
        pricePerShare: input.pricePerShare,
        minimumShares: input.minimumShares,
        minimumInvestmentAmount: effectiveMinInvestment,
        maxInvestors: input.maxInvestors ?? null,
      },
    });
  });

// ─── Get Share Classes & Holdings for a Property ───────────────

export const getShareInfo = baseProcedure
  .input(z.object({ propertyId: z.number() }))
  .query(async ({ input }) => {
    const shareClasses = await db.shareClass.findMany({
      where: { propertyId: input.propertyId },
      include: {
        holdings: {
          include: {
            investor: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    // Calculate summary for each class
    return shareClasses.map((sc) => {
      const totalSold = sc.holdings.reduce((s, h) => s + h.sharesOwned, 0);
      return {
        ...sc,
        totalSold,
        availableShares: sc.totalShares - totalSold,
        percentageSold: (totalSold / sc.totalShares) * 100,
      };
    });
  });

// ─── Purchase Shares ───────────────────────────────────────────

export const purchaseShares = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      shareClassId: z.number(),
      shares: z.number().int().min(1),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const shareClass = await db.shareClass.findUnique({
      where: { id: input.shareClassId },
      include: {
        holdings: true,
      },
    });
    if (!shareClass) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Share class not found" });
    }

    const scPropertyId = shareClass.propertyId;

    // Check minimum shares
    if (input.shares < shareClass.minimumShares) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Minimum purchase is ${shareClass.minimumShares} shares`,
      });
    }

    const totalAmount = input.shares * shareClass.pricePerShare;

    // Check minimum investment amount (in Rands)
    if ((shareClass as any).minimumInvestmentAmount && totalAmount < (shareClass as any).minimumInvestmentAmount) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Minimum investment is R${(shareClass as any).minimumInvestmentAmount.toLocaleString()}. Your amount: R${totalAmount.toLocaleString()}`,
      });
    }

    // Check max investors cap
    if ((shareClass as any).maxInvestors) {
      const uniqueInvestors = new Set(shareClass.holdings.map((h: any) => h.investorId));
      const isNewInvestor = !uniqueInvestors.has(user.id);
      if (isNewInvestor && uniqueInvestors.size >= (shareClass as any).maxInvestors) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This share class has reached its maximum of ${(shareClass as any).maxInvestors} investors. No new investors can be accepted.`,
        });
      }
    }

    // Check availability
    const totalSold = shareClass.holdings.reduce((s, h) => s + h.sharesOwned, 0);
    const available = shareClass.totalShares - totalSold;
    if (input.shares > available) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Only ${available} shares available (requested ${input.shares})`,
      });
    }

    // Use transaction for atomicity
    return db.$transaction(async (tx) => {
      // Upsert holding
      const existingHolding = await tx.shareHolding.findUnique({
        where: {
          shareClassId_investorId: {
            shareClassId: input.shareClassId,
            investorId: user.id,
          },
        },
      });

      const newBalance = (existingHolding?.sharesOwned ?? 0) + input.shares;
      const newAvgCost = existingHolding
        ? ((existingHolding.averageCostPerShare * existingHolding.sharesOwned) + totalAmount) / newBalance
        : shareClass.pricePerShare;

      const holding = await tx.shareHolding.upsert({
        where: {
          shareClassId_investorId: {
            shareClassId: input.shareClassId,
            investorId: user.id,
          },
        },
        create: {
          propertyId: shareClass.propertyId,
          shareClassId: input.shareClassId,
          investorId: user.id,
          sharesOwned: input.shares,
          averageCostPerShare: shareClass.pricePerShare,
        },
        update: {
          sharesOwned: newBalance,
          averageCostPerShare: newAvgCost,
        },
      });

      // Record in ledger
      await tx.shareLedgerEntry.create({
        data: {
          propertyId: shareClass.propertyId,
          shareClassId: input.shareClassId,
          investorId: user.id,
          transactionType: "PURCHASE",
          shares: input.shares,
          pricePerShare: shareClass.pricePerShare,
          totalAmount,
          reference: `Purchase of ${input.shares} shares`,
          balanceAfter: newBalance,
        },
      });

      // Update property funding — recalculate from actual PAID contributions
      // to avoid drift from incremental updates
      const paidContribs = await tx.investorContribution.findMany({
        where: {
          propertyId: shareClass.propertyId,
          paymentStatus: "PAID",
        },
        select: { contributionAmount: true },
      });
      const actualPaidTotal = paidContribs.reduce(
        (sum, c) => sum + c.contributionAmount, 0
      );
      await tx.property.update({
        where: { id: shareClass.propertyId },
        data: {
          fundingRaised: actualPaidTotal,
        },
      });

      return { holding, totalAmount };
    });

    // Notify investor of successful purchase
    const property = await db.property.findUnique({
      where: { id: scPropertyId },
      select: { title: true },
    });
    createNotification(
      user.id,
      "Shares Purchased",
      `You purchased ${input.shares} shares in "${property?.title ?? "Property"}" for R${totalAmount.toLocaleString("en-ZA")}`,
      "SUCCESS",
      "INVESTMENT",
      scPropertyId
    );

    // Notify managers
    const managers = await db.user.findMany({
      where: { role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] } },
      select: { id: true },
    });
    for (const mgr of managers) {
      createNotification(
        mgr.id,
        "New Share Purchase",
        `${user.name} purchased ${input.shares} shares in "${property?.title ?? "Property"}" for R${totalAmount.toLocaleString("en-ZA")}`,
        "INFO",
        "INVESTMENT",
        scPropertyId
      );
    }
  });

// ─── Transfer Shares ───────────────────────────────────────────

export const transferShares = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      shareClassId: z.number(),
      toInvestorId: z.number(),
      shares: z.number().int().min(1),
      pricePerShare: z.number().min(0),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const fromHolding = await db.shareHolding.findUnique({
      where: {
        shareClassId_investorId: {
          shareClassId: input.shareClassId,
          investorId: user.id,
        },
      },
    });

    if (!fromHolding || fromHolding.sharesOwned < input.shares) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Insufficient shares. You own ${fromHolding?.sharesOwned ?? 0}`,
      });
    }

    const shareClass = await db.shareClass.findUnique({
      where: { id: input.shareClassId },
    });
    if (!shareClass) throw new TRPCError({ code: "NOT_FOUND", message: "Share class not found" });

    const transferPropertyId = shareClass.propertyId;
    const totalAmount = input.shares * input.pricePerShare;

    return db.$transaction(async (tx) => {
      // Deduct from sender
      const fromNewBalance = fromHolding.sharesOwned - input.shares;
      if (fromNewBalance === 0) {
        await tx.shareHolding.delete({
          where: { id: fromHolding.id },
        });
      } else {
        await tx.shareHolding.update({
          where: { id: fromHolding.id },
          data: { sharesOwned: fromNewBalance },
        });
      }

      // Add to receiver
      const toHolding = await tx.shareHolding.findUnique({
        where: {
          shareClassId_investorId: {
            shareClassId: input.shareClassId,
            investorId: input.toInvestorId,
          },
        },
      });

      const toNewBalance = (toHolding?.sharesOwned ?? 0) + input.shares;
      const toAvgCost = toHolding
        ? ((toHolding.averageCostPerShare * toHolding.sharesOwned) + totalAmount) / toNewBalance
        : input.pricePerShare;

      await tx.shareHolding.upsert({
        where: {
          shareClassId_investorId: {
            shareClassId: input.shareClassId,
            investorId: input.toInvestorId,
          },
        },
        create: {
          propertyId: shareClass.propertyId,
          shareClassId: input.shareClassId,
          investorId: input.toInvestorId,
          sharesOwned: input.shares,
          averageCostPerShare: input.pricePerShare,
        },
        update: {
          sharesOwned: toNewBalance,
          averageCostPerShare: toAvgCost,
        },
      });

      // Ledger entries
      await tx.shareLedgerEntry.createMany({
        data: [
          {
            propertyId: shareClass.propertyId,
            shareClassId: input.shareClassId,
            investorId: user.id,
            transactionType: "TRANSFER_OUT",
            shares: -input.shares,
            pricePerShare: input.pricePerShare,
            totalAmount,
            reference: `Transfer to investor #${input.toInvestorId}`,
            balanceAfter: fromNewBalance,
          },
          {
            propertyId: shareClass.propertyId,
            shareClassId: input.shareClassId,
            investorId: input.toInvestorId,
            transactionType: "TRANSFER_IN",
            shares: input.shares,
            pricePerShare: input.pricePerShare,
            totalAmount,
            reference: `Transfer from investor #${user.id}`,
            balanceAfter: toNewBalance,
          },
        ],
      });

      return { success: true, sharesTransferred: input.shares };
    });

    // Notify the receiving investor
    const property = await db.property.findUnique({
      where: { id: transferPropertyId },
      select: { title: true },
    });
    createNotification(
      input.toInvestorId,
      "Shares Received",
      `You received ${input.shares} shares in "${property?.title ?? "Property"}" via transfer from another investor`,
      "SUCCESS",
      "INVESTMENT",
      transferPropertyId
    );

    // Notify transferring investor of confirmation
    createNotification(
      user.id,
      "Share Transfer Completed",
      `You transferred ${input.shares} shares in "${property?.title ?? "Property"}" successfully`,
      "SUCCESS",
      "INVESTMENT",
      transferPropertyId
    );

    // Notify managers
    const managers = await db.user.findMany({
      where: { role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] } },
      select: { id: true },
    });
    for (const mgr of managers) {
      createNotification(
        mgr.id,
        "Share Transfer",
        `${input.shares} shares in "${property?.title ?? "Property"}" transferred between investors`,
        "INFO",
        "INVESTMENT",
        transferPropertyId
      );
    }
  });

// ─── Get Share Ledger History ──────────────────────────────────

export const getShareLedger = baseProcedure
  .input(
    z.object({
      authToken: z.string().optional(),
      propertyId: z.number().optional(),
      investorId: z.number().optional(),
      limit: z.number().int().min(1).max(500).default(200),
    })
  )
  .query(async ({ input }) => {
    // Determine caller role for anonymization
    let callerRole = "INVESTOR";
    let callerId: number | null = null;
    if (input.authToken) {
      try {
        const user = await getAuthenticatedUser(input.authToken);
        callerRole = user.role;
        callerId = user.id;
      } catch {
        // Not authenticated — treat as public viewer
      }
    }

    const isManager = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"].includes(callerRole);

    // ── 1. Fetch real ShareLedgerEntry records ─────────────────
    const ledgerWhere: any = {};
    if (input.propertyId) ledgerWhere.propertyId = input.propertyId;
    if (input.investorId) ledgerWhere.investorId = input.investorId;

    const realEntries = await db.shareLedgerEntry.findMany({
      where: ledgerWhere,
      orderBy: { createdAt: "desc" },
      take: input.limit,
      include: {
        investor: { select: { id: true, name: true, email: true } },
        shareClass: { select: { id: true, name: true, pricePerShare: true } },
        property: { select: { id: true, title: true } },
      },
    });

    // ── 2. Fetch InvestorContribution lifecycle data ───────────
    const contribWhere: any = {};
    if (input.propertyId) contribWhere.propertyId = input.propertyId;
    if (input.investorId) contribWhere.investorId = input.investorId;

    const contributions = await db.investorContribution.findMany({
      where: contribWhere,
      orderBy: { createdAt: "desc" },
      include: {
        investor: { select: { id: true, name: true, email: true } },
        property: { select: { id: true, title: true } },
        certificate: { select: { id: true, certificateNumber: true, issueDate: true } },
      },
    });

    // ── 3. Synthesize ledger entries from contribution lifecycle ─
    const syntheticEntries: any[] = [];
    let syntheticId = 100000; // High offset to avoid ID collision

    for (const c of contributions) {
      const baseEntry = {
        propertyId: c.propertyId,
        investorId: c.investorId,
        property: c.property,
        investor: c.investor,
        shareClass: null, // contribution-based entries don't have share classes
      };

      // PROPOSAL_SUBMITTED — every contribution gets this
      syntheticEntries.push({
        ...baseEntry,
        id: syntheticId++,
        transactionType: "PROPOSAL_SUBMITTED",
        shares: c.numberOfShares ?? 0,
        pricePerShare: c.sharePrice ?? 0,
        totalAmount: c.contributionAmount,
        reference: `Investment proposal submitted — R${c.contributionAmount.toLocaleString()} for ${c.property?.title ?? "property"}`,
        balanceAfter: 0,
        createdAt: c.contributionDate ?? c.createdAt,
      });

      // PROPOSAL_APPROVED — if status is APPROVED (or further along)
      if (c.status === "APPROVED" && c.reviewedAt) {
        syntheticEntries.push({
          ...baseEntry,
          id: syntheticId++,
          transactionType: "PROPOSAL_APPROVED",
          shares: c.numberOfShares ?? 0,
          pricePerShare: c.sharePrice ?? 0,
          totalAmount: c.contributionAmount,
          reference: `Proposal approved — R${c.contributionAmount.toLocaleString()} investment approved by management`,
          balanceAfter: 0,
          createdAt: c.reviewedAt,
        });
      }

      // PROPOSAL_REJECTED
      if (c.status === "REJECTED" && c.reviewedAt) {
        syntheticEntries.push({
          ...baseEntry,
          id: syntheticId++,
          transactionType: "PROPOSAL_REJECTED",
          shares: 0,
          pricePerShare: 0,
          totalAmount: c.contributionAmount,
          reference: `Proposal rejected — R${c.contributionAmount.toLocaleString()} proposal was not approved`,
          balanceAfter: 0,
          createdAt: c.reviewedAt,
        });
      }

      // PAYMENT_SUBMITTED — if investor uploaded POP or initiated payment
      if (
        ["POP_SUBMITTED", "PAID"].includes(c.paymentStatus) &&
        c.paymentSubmittedAt
      ) {
        syntheticEntries.push({
          ...baseEntry,
          id: syntheticId++,
          transactionType: "PAYMENT_SUBMITTED",
          shares: c.numberOfShares ?? 0,
          pricePerShare: c.sharePrice ?? 0,
          totalAmount: c.contributionAmount,
          reference: `Payment submitted via ${c.paymentMethod ?? "bank transfer"} — R${c.contributionAmount.toLocaleString()}`,
          balanceAfter: 0,
          createdAt: c.paymentSubmittedAt,
        });
      }

      // PAYMENT_CONFIRMED — if fully paid
      if (c.paymentStatus === "PAID" && c.paymentReviewedAt) {
        syntheticEntries.push({
          ...baseEntry,
          id: syntheticId++,
          transactionType: "PAYMENT_CONFIRMED",
          shares: c.numberOfShares ?? 0,
          pricePerShare: c.sharePrice ?? 0,
          totalAmount: c.contributionAmount,
          reference: `Payment confirmed — R${c.contributionAmount.toLocaleString()} cleared for ${c.property?.title ?? "property"}`,
          balanceAfter: c.numberOfShares ?? 0,
          createdAt: c.paymentReviewedAt,
        });
      }

      // CERTIFICATE_ISSUED — if share certificate exists
      if (c.certificate) {
        syntheticEntries.push({
          ...baseEntry,
          id: syntheticId++,
          transactionType: "CERTIFICATE_ISSUED",
          shares: c.numberOfShares ?? 0,
          pricePerShare: c.sharePrice ?? 0,
          totalAmount: c.contributionAmount,
          reference: `Share certificate ${c.certificate.certificateNumber} issued — ${c.numberOfShares ?? 0} shares @ R${(c.sharePrice ?? 0).toLocaleString()}/share`,
          balanceAfter: c.numberOfShares ?? 0,
          createdAt: c.certificate.issueDate,
        });
      }
    }

    // ── 4. Merge real + synthetic entries ───────────────────────
    const realMapped = realEntries.map((entry) => ({
      ...entry,
      txHash: `0x${entry.id.toString(16).padStart(8, "0")}${entry.createdAt.getTime().toString(16)}`,
    }));

    const syntheticMapped = syntheticEntries.map((entry) => ({
      ...entry,
      txHash: `0x${entry.id.toString(16).padStart(8, "0")}${new Date(entry.createdAt).getTime().toString(16)}`,
    }));

    const allEntries = [...realMapped, ...syntheticMapped]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, input.limit);

    // ── 5. Privacy: Always show investor codes instead of real names ──
    // Build a code map from investor IDs
    const investorIds = [...new Set(allEntries.filter(e => e.investor).map(e => e.investor!.id))];
    const investorRecords = investorIds.length > 0
      ? await db.user.findMany({ where: { id: { in: investorIds } }, select: { id: true, investorCode: true } })
      : [];
    const codeMap = new Map<number, string>();
    for (const u of investorRecords) {
      codeMap.set(u.id, u.investorCode ?? `IP-INV-${u.id.toString().padStart(5, "0")}`);
    }

    return allEntries.map((entry) => ({
      ...entry,
      investor: entry.investor
        ? {
            id: entry.investor.id,
            name: entry.investor.id === callerId
              ? `${codeMap.get(entry.investor.id) ?? `IP-INV-${entry.investor.id.toString().padStart(5, "0")}`} (You)`
              : codeMap.get(entry.investor.id) ?? `IP-INV-${entry.investor.id.toString().padStart(5, "0")}`,
            email: null, // Never expose email on public ledger
          }
        : null,
    }));
  });

// ─── Get Investor Portfolio ────────────────────────────────────

export const getInvestorPortfolio = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const holdings = await db.shareHolding.findMany({
      where: { investorId: user.id },
      include: {
        property: {
          select: {
            id: true, title: true, price: true, imageUrl: true,
            city: true, state: true, investmentStatus: true,
            fundingGoal: true, fundingRaised: true,
            rentalBond: { select: { monthlyRent: true, capRate: true, netYield: true } },
            propertyFlip: { select: { expectedROI: true, expectedProfitMargin: true } },
            propertyDevelopment: { select: { expectedROI: true, expectedIRR: true, expectedNetYield: true } },
          },
        },
        shareClass: {
          select: { id: true, name: true, totalShares: true, pricePerShare: true },
        },
      },
    });

    // Fetch past distributions for each property to calculate actual yield
    const propertyIds = [...new Set(holdings.map((h) => h.propertyId))];
    const distributionPayouts = await db.distributionPayout.findMany({
      where: { investorId: user.id, distribution: { propertyId: { in: propertyIds } } },
      include: { distribution: { select: { propertyId: true, type: true, createdAt: true } } },
    });

    // Group payouts by property
    const payoutsByProperty: Record<number, typeof distributionPayouts> = {};
    for (const p of distributionPayouts) {
      const pid = p.distribution.propertyId;
      if (!payoutsByProperty[pid]) payoutsByProperty[pid] = [];
      payoutsByProperty[pid].push(p);
    }

    // Enrich with calculated fields + projected returns
    return holdings.map((h) => {
      const currentValue = h.sharesOwned * h.shareClass.pricePerShare;
      const investedAmount = h.sharesOwned * h.averageCostPerShare;
      const ownershipPct = (h.sharesOwned / h.shareClass.totalShares) * 100;
      const unrealizedGain = currentValue - investedAmount;

      // Projected returns from property type
      const rental = (h.property as any)?.rentalBond;
      const flip = (h.property as any)?.propertyFlip;
      const dev = (h.property as any)?.propertyDevelopment;

      let projectedAnnualYield = 0;
      let projectedAnnualIncome = 0;
      let projectedROI = 0;

      if (rental) {
        projectedAnnualYield = rental.netYield || rental.capRate || 0;
        projectedAnnualIncome = (rental.monthlyRent * 12 * ownershipPct) / 100;
        projectedROI = rental.capRate || 0;
      } else if (dev) {
        projectedAnnualYield = dev.expectedNetYield || 0;
        projectedROI = dev.expectedROI || 0;
        projectedAnnualIncome = (investedAmount * projectedAnnualYield) / 100;
      } else if (flip) {
        projectedROI = flip.expectedROI || 0;
        projectedAnnualYield = flip.expectedProfitMargin || 0;
        projectedAnnualIncome = (investedAmount * projectedROI) / 100;
      }

      // Historical distributions total
      const propertyPayouts = payoutsByProperty[h.propertyId] ?? [];
      const totalDistributed = propertyPayouts.reduce((s, p) => s + p.netAmount, 0);

      // Calculate actual yield based on distributions received
      const holdingMonths = Math.max(1, Math.round((Date.now() - new Date(h.createdAt).getTime()) / (30 * 86400000)));
      const annualizedDistYield = investedAmount > 0 ? (totalDistributed / investedAmount) * (12 / holdingMonths) * 100 : 0;

      // 5-year projection
      const projected5YearReturn = investedAmount > 0
        ? investedAmount * Math.pow(1 + projectedAnnualYield / 100, 5) - investedAmount + (projectedAnnualIncome * 5)
        : 0;

      return {
        ...h,
        currentValue,
        investedAmount,
        ownershipPercentage: ownershipPct,
        unrealizedGain,
        projectedAnnualYield,
        projectedAnnualIncome,
        projectedROI,
        totalDistributed,
        annualizedDistYield,
        projected5YearReturn,
      };
    });
  });

// ─── Cooling-Off Withdrawal Request ───────────────────────────
// CPA s16 gives consumers a 5-day cooling-off for direct marketing.
// We extend to 7 days as best practice for investor protection.

const COOLING_OFF_DAYS = 7;

export const requestCoolingOffWithdrawal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      shareHoldingId: z.number(),
      reason: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // Find the holding
    const holding = await db.shareHolding.findFirst({
      where: { id: input.shareHoldingId, investorId: user.id },
      include: { shareClass: true },
    });
    if (!holding) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Holding not found" });
    }

    // Find the original purchase ledger entry to determine purchase date
    const purchaseEntry = await db.shareLedgerEntry.findFirst({
      where: {
        investorId: user.id,
        propertyId: holding.propertyId,
        shareClassId: holding.shareClassId,
        transactionType: "PURCHASE",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!purchaseEntry) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No purchase record found for this holding",
      });
    }

    // Check cooling-off window
    const purchaseDate = new Date(purchaseEntry.createdAt);
    const coolingOffDeadline = new Date(purchaseDate);
    coolingOffDeadline.setDate(coolingOffDeadline.getDate() + COOLING_OFF_DAYS);

    if (new Date() > coolingOffDeadline) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `The ${COOLING_OFF_DAYS}-day cooling-off period expired on ${coolingOffDeadline.toLocaleDateString("en-ZA")}. You can sell your shares on the Share Marketplace instead.`,
      });
    }

    // Process the withdrawal within a transaction
    const refundAmount = holding.sharesOwned * holding.shareClass.pricePerShare;

    const result = await db.$transaction(async (tx: any) => {
      // Create ledger entry for the withdrawal
      await tx.shareLedgerEntry.create({
        data: {
          propertyId: holding.propertyId,
          shareClassId: holding.shareClassId,
          investorId: user.id,
          transactionType: "TRANSFER_OUT",
          shares: -holding.sharesOwned,
          pricePerShare: holding.shareClass.pricePerShare,
          totalAmount: refundAmount,
          reference: `Cooling-off withdrawal — ${input.reason ?? "No reason given"} — within ${COOLING_OFF_DAYS}-day window`,
          balanceAfter: 0,
        },
      });

      // Delete the holding
      await tx.shareHolding.delete({ where: { id: holding.id } });

      // Reduce the property's funding raised (if funding campaign exists)
      await tx.property.update({
        where: { id: holding.propertyId },
        data: {
          fundingRaised: { decrement: refundAmount },
        },
      }).catch(() => {
        // fundingRaised field may not exist on property — ignore
      });

      return {
        refundAmount,
        sharesReturned: holding.sharesOwned,
        propertyId: holding.propertyId,
      };
    });

    // Notify managers about cooling-off withdrawal
    const coolingProperty = await db.property.findUnique({
      where: { id: result.propertyId },
      select: { title: true },
    });
    const coolingManagers = await db.user.findMany({
      where: { role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] } },
      select: { id: true },
    });
    for (const mgr of coolingManagers) {
      createNotification(
        mgr.id,
        "Cooling-Off Withdrawal",
        `${user.name} exercised cooling-off withdrawal for ${result.sharesReturned} shares in "${coolingProperty?.title ?? "Property"}" — refund: R${result.refundAmount.toLocaleString("en-ZA")}`,
        "WARNING",
        "INVESTMENT",
        result.propertyId
      );
    }

    return {
      success: true,
      message: `Cooling-off withdrawal processed. ${result.sharesReturned} shares returned. Refund of R${result.refundAmount.toLocaleString("en-ZA")} will be processed within 7 business days.`,
      ...result,
    };
  });
