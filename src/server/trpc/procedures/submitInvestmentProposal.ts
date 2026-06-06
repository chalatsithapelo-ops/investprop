import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "~/server/trpc/procedures/notifications";
import { calculateShareInfo } from "~/server/trpc/procedures/share-certificates";
import { FICA_THRESHOLD } from "~/server/trpc/procedures/fica-verification";
import { checkRateLimit, RATE_LIMITS } from "~/server/utils/rate-limiter";

/** Companies Act §96(1)(b): private offers limited to 50 persons per SPV. */
export const MAX_INVESTORS_PER_SPV = 50;
/** Platform-wide minimum investment to keep admin overhead viable. */
export const MIN_INVESTMENT_ZAR = 1000;
/** CPA-style cooling-off window in days. */
export const COOLING_OFF_DAYS = 5;

export const submitInvestmentProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      contributionAmount: z.number().positive(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and ensure user is an investor
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["INVESTOR"], "Only investors can submit investment proposals");

    // Email must be verified before investing
    if (!user.emailVerified) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Please verify your email address before submitting an investment proposal.",
      });
    }

    // Appropriateness questionnaire must be completed (FAIS hard gate).
    const userRecord = await db.user.findUnique({
      where: { id: user.id },
      select: { appropriatenessCompletedAt: true } as any,
    }) as any;
    if (!userRecord?.appropriatenessCompletedAt) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Please complete the suitability questionnaire before investing. This is a once-off step required by FAIS.",
      });
    }

    // Rate limit
    const rl = checkRateLimit(`investment:${user.id}`, RATE_LIMITS.INVESTMENT_CREATE);
    if (!rl.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many investment attempts. Try again in ${rl.retryAfter ?? 60}s.`,
      });
    }

    // Enforce R1,000 platform minimum
    if (input.contributionAmount < MIN_INVESTMENT_ZAR) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Minimum investment is R${MIN_INVESTMENT_ZAR.toLocaleString()}.`,
      });
    }

    // Verify property exists and is accepting investments
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
      },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    if (property.investmentStatus !== "RAISING_FUNDS" || !property.isPublished) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This property is not currently accepting investments",
      });
    }

    // Check if funding closing date has passed
    if (property.fundingClosingDate && new Date(property.fundingClosingDate) < new Date()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The investment period for this property has closed",
      });
    }

    // Check if investor has already submitted a proposal
    const existingContributions = await db.investorContribution.findMany({
      where: {
        propertyId: input.propertyId,
        investorId: user.id,
      },
    });

    // Calculate total already invested by this investor
    const totalAlreadyInvested = existingContributions.reduce(
      (sum, c) => sum + c.contributionAmount,
      0
    );

    // Use the sub-type funding goal (flip/rental/development) as source of truth
    const subTypeGoal =
      property.propertyFlip?.fundingGoal ??
      property.rentalBond?.fundingGoal ??
      property.propertyDevelopment?.fundingGoal ??
      0;
    const effectiveFundingGoal = subTypeGoal > 0 ? subTypeGoal : property.fundingGoal;

    // Calculate actual committed amount from non-rejected contributions
    const allContributions = await db.investorContribution.findMany({
      where: {
        propertyId: input.propertyId,
        status: { not: "REJECTED" },
      },
      select: { contributionAmount: true },
    });
    const actualCommitted = allContributions.reduce(
      (sum, c) => sum + c.contributionAmount, 0
    );

    // Companies Act §96(1)(b): ≤50 unique investors per SPV
    const uniqueInvestors = await db.investorContribution.findMany({
      where: {
        propertyId: input.propertyId,
        status: { not: "REJECTED" },
      },
      select: { investorId: true },
      distinct: ["investorId"],
    });
    const isNewInvestor = !uniqueInvestors.some((c) => c.investorId === user.id);
    if (isNewInvestor && uniqueInvestors.length >= MAX_INVESTORS_PER_SPV) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `This SPV has reached its maximum of ${MAX_INVESTORS_PER_SPV} investors (Companies Act §96(1)(b)). New investors cannot be added.`,
      });
    }

    // Check if contribution would exceed funding goal
    const totalFundingAfter = actualCommitted + input.contributionAmount;
    if (totalFundingAfter > effectiveFundingGoal) {
      const remaining = effectiveFundingGoal - actualCommitted;
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Investment amount exceeds remaining funding needed. Remaining: R${remaining.toLocaleString()}`,
      });
    }

    // ── FICA Threshold Check ─────────────────────────────────────
    // Investments of R20,000 or more require FICA verification
    const totalAfterThisInvestment = totalAlreadyInvested + input.contributionAmount;
    if (input.contributionAmount >= FICA_THRESHOLD || totalAfterThisInvestment >= FICA_THRESHOLD) {
      // Re-fetch user to get the latest FICA status
      const currentUser = await db.user.findUnique({
        where: { id: user.id },
        select: { ficaVerified: true, ficaExempt: true },
      });

      if (!currentUser?.ficaVerified) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `FICA verification is required for investments of R${FICA_THRESHOLD.toLocaleString()} or more. Your total investment amount (R${totalAfterThisInvestment.toLocaleString()}) meets this threshold. Please complete your FICA verification (ID Document, Proof of Address) in the KYC Compliance section before proceeding.`,
        });
      }
    }

    // Calculate expected return based on property type
    let expectedReturnRate = 0;
    if (property.propertyFlip) {
      expectedReturnRate = property.propertyFlip.expectedROI;
    } else if (property.rentalBond) {
      expectedReturnRate = property.rentalBond.cashOnCashReturn;
    } else if (property.propertyDevelopment) {
      expectedReturnRate = property.propertyDevelopment.expectedROI;
    }

    const expectedReturnAmount = input.contributionAmount * (expectedReturnRate / 100);

    // Calculate share information
    const shareInfo = await calculateShareInfo(input.propertyId, input.contributionAmount);

    // Create investment contribution with PENDING status
    const coolingOffExpiresAt = new Date(Date.now() + COOLING_OFF_DAYS * 24 * 60 * 60 * 1000);
    const contribution = await db.investorContribution.create({
      data: {
        propertyId: input.propertyId,
        investorId: user.id,
        contributionAmount: input.contributionAmount,
        expectedReturnRate,
        expectedReturnAmount,
        numberOfShares: shareInfo?.numberOfShares ?? null,
        sharePrice: shareInfo?.sharePrice ?? null,
        ownershipPercentage: shareInfo?.ownershipPercentage ?? null,
        status: "PENDING",
        notes: input.notes,
        coolingOffExpiresAt,
      },
      include: {
        property: {
          select: {
            title: true,
          },
        },
        investor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // ── Notify all DEVELOPMENT_MANAGER / PROJECT_MANAGER users ───────────
    const managers = await db.user.findMany({
      where: {
        role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] },
      },
      select: { id: true },
    });

    await Promise.all(
      managers.map((mgr) =>
        createNotification(
          mgr.id,
          `New Investment Proposal — R${input.contributionAmount.toLocaleString()}`,
          `${user.name} has submitted an investment proposal of R${input.contributionAmount.toLocaleString()} for "${contribution.property.title}". Please review the proposal in your dashboard.`,
          "INFO",
          "INVESTMENT",
          contribution.id
        )
      )
    );

    // Notify the investor that their proposal was received
    await createNotification(
      user.id,
      "Investment Proposal Submitted",
      `Your investment proposal of R${input.contributionAmount.toLocaleString()} for "${contribution.property.title}" has been submitted and is pending review.`,
      "SUCCESS",
      "INVESTMENT",
      contribution.id
    );

    return {
      success: true,
      contribution,
    };
  });
