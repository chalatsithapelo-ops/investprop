import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";
import { env } from "~/server/env";
import { issueCertificate, ensureShareHoldingForContribution } from "./share-certificates";

// ═══════════════════════════════════════════════════════════════
//  Investment Payment Flow
//  After a proposal is approved, the investor must pay.
//  Two options: (1) Paystack gateway  (2) Upload Proof of Payment
// ═══════════════════════════════════════════════════════════════

const PAYSTACK_BASE = "https://api.paystack.co";

async function paystackRequest(path: string, method: string, body?: any) {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Payment gateway not configured. Set PAYSTACK_SECRET_KEY in environment.",
    });
  }
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.status) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: data.message ?? "Payment gateway error",
    });
  }
  return data;
}

// ─────────────────────────────────────────────────────────────
//  Helper: confirm payment & update funding raised
// ─────────────────────────────────────────────────────────────

async function confirmPaymentAndUpdateFunding(
  contributionId: number,
  paymentMethod: string,
  paymentReference: string | null,
  reviewedBy?: number,
) {
  const contribution = await db.investorContribution.findUnique({
    where: { id: contributionId },
    include: { property: true, investor: true },
  });

  if (!contribution) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Contribution not found",
    });
  }

  // Mark payment as confirmed
  await db.investorContribution.update({
    where: { id: contributionId },
    data: {
      paymentStatus: "PAID",
      paymentMethod,
      paymentReference,
      paymentReviewedAt: new Date(),
      ...(reviewedBy ? { paymentReviewedBy: reviewedBy } : {}),
    },
  });

  // Recalculate fundingRaised from actual PAID contributions
  // (avoids drift from double-increments or stale data)
  const paidContributions = await db.investorContribution.findMany({
    where: {
      propertyId: contribution.propertyId,
      paymentStatus: "PAID",
    },
    select: { contributionAmount: true },
  });
  const actualPaidTotal = paidContributions.reduce(
    (sum, c) => sum + c.contributionAmount, 0
  );

  await db.property.update({
    where: { id: contribution.propertyId },
    data: {
      fundingRaised: actualPaidTotal,
    },
  });

  // Use sub-type funding goal for the FUNDED check
  const propertyWithSubTypes = await db.property.findUnique({
    where: { id: contribution.propertyId },
    include: {
      propertyFlip: { select: { fundingGoal: true } },
      rentalBond: { select: { fundingGoal: true } },
      propertyDevelopment: { select: { fundingGoal: true } },
    },
  });

  if (propertyWithSubTypes) {
    const subTypeGoal =
      propertyWithSubTypes.propertyFlip?.fundingGoal ??
      propertyWithSubTypes.rentalBond?.fundingGoal ??
      propertyWithSubTypes.propertyDevelopment?.fundingGoal ??
      0;
    const effectiveGoal = subTypeGoal > 0 ? subTypeGoal : propertyWithSubTypes.fundingGoal;

    if (actualPaidTotal >= effectiveGoal) {
      await db.property.update({
        where: { id: contribution.propertyId },
        data: {
          investmentStatus: "FUNDED",
          isPublished: false,
        },
      });
    }
  }

  // Notify the investor
  await createNotification(
    contribution.investorId,
    "Payment Confirmed",
    `Your payment of R${contribution.contributionAmount.toLocaleString()} for ${contribution.property.title} has been confirmed. Your investment is now active! Your share certificate will be issued shortly.`,
    "SUCCESS",
    "INVESTMENT",
    contribution.propertyId,
  );

  // Issue share certificate automatically
  let certificate = null;
  try {
    certificate = await issueCertificate(
      contributionId,
      reviewedBy ?? 0,
    );
  } catch (err) {
    // Log but don't fail — certificate can be issued later
    console.error("Failed to auto-issue certificate:", err);
  }

  // Materialise the investor's ShareHolding so distributions can be created.
  // (The contribution and the ShareHolding ledger are two views of the same
  // ownership; the distribution engine reads ShareHolding.)
  try {
    await ensureShareHoldingForContribution(contributionId);
  } catch (err) {
    // Log but don't fail — holding can be reconciled later
    console.error("Failed to create share holding:", err);
  }

  // Notify managers
  const managers = await db.user.findMany({
    where: {
      role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] },
    },
  });
  for (const mgr of managers) {
    await createNotification(
      mgr.id,
      "Investment Payment Received",
      `${contribution.investor.name} has completed payment of R${contribution.contributionAmount.toLocaleString()} for ${contribution.property.title}. Funding is now at R${actualPaidTotal.toLocaleString()} / R${(propertyWithSubTypes ? (propertyWithSubTypes.propertyFlip?.fundingGoal ?? propertyWithSubTypes.rentalBond?.fundingGoal ?? propertyWithSubTypes.propertyDevelopment?.fundingGoal ?? propertyWithSubTypes.fundingGoal) : 0).toLocaleString()}.`,
      "SUCCESS",
      "INVESTMENT",
      contribution.propertyId,
    );
  }

  return { contribution, updatedProperty: propertyWithSubTypes, certificate };
}

// ─────────────────────────────────────────────────────────────
//  1. Initiate Paystack Payment for Investment
// ─────────────────────────────────────────────────────────────

export const initiateInvestmentPayment = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      callbackUrl: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: { property: true },
    });

    if (!contribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contribution not found",
      });
    }

    // Only the investor who owns this contribution can pay
    if (contribution.investorId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only pay for your own investment",
      });
    }

    // Must be approved and awaiting payment
    if (
      contribution.status !== "APPROVED" ||
      !["NOT_PAID", "AWAITING_PAYMENT", "POP_REJECTED"].includes(contribution.paymentStatus)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This contribution is not awaiting payment. Current status: " +
          contribution.status +
          " / " +
          contribution.paymentStatus,
      });
    }

    const reference = `inv-${contribution.id}-${Date.now()}`;

    const result = await paystackRequest("/transaction/initialize", "POST", {
      amount: Math.round(contribution.contributionAmount * 100), // cents
      email: user.email,
      reference,
      currency: "ZAR",
      callback_url: input.callbackUrl,
      metadata: {
        contributionId: contribution.id,
        propertyId: contribution.propertyId,
        investorId: user.id,
        type: "INVESTMENT_PAYMENT",
      },
    });

    // Mark payment as processing
    await db.investorContribution.update({
      where: { id: contribution.id },
      data: {
        paymentStatus: "PROCESSING",
        paymentMethod: "PAYSTACK",
        paymentReference: reference,
      },
    });

    await createAuditLog(user.id, "INITIATE_INVESTMENT_PAYMENT", "InvestorContribution", contribution.id, {
      reference,
      amount: contribution.contributionAmount,
    });

    return {
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
      reference: result.data.reference,
    };
  });

// ─────────────────────────────────────────────────────────────
//  2. Verify Paystack Investment Payment
// ─────────────────────────────────────────────────────────────

export const verifyInvestmentPayment = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      reference: z.string(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
    });

    if (!contribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contribution not found",
      });
    }

    if (contribution.investorId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only verify your own payment",
      });
    }

    // Verify with Paystack
    const result = await paystackRequest(
      `/transaction/verify/${input.reference}`,
      "GET",
    );

    if (result.data.status === "success") {
      // Payment confirmed
      await confirmPaymentAndUpdateFunding(
        contribution.id,
        "PAYSTACK",
        input.reference,
      );

      await createAuditLog(
        user.id,
        "VERIFY_INVESTMENT_PAYMENT",
        "InvestorContribution",
        contribution.id,
        { reference: input.reference, status: "success" },
      );

      return { success: true, status: "PAID" };
    } else {
      // Update status
      await db.investorContribution.update({
        where: { id: contribution.id },
        data: {
          paymentStatus:
            result.data.status === "failed"
              ? "AWAITING_PAYMENT"
              : "PROCESSING",
        },
      });

      return { success: false, status: result.data.status };
    }
  });

// ─────────────────────────────────────────────────────────────
//  3. Submit Proof of Payment (POP)
// ─────────────────────────────────────────────────────────────

export const submitProofOfPayment = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      proofOfPaymentUrl: z.string(),
      paymentReference: z.string().optional(),
      notes: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: { property: true },
    });

    if (!contribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contribution not found",
      });
    }

    if (contribution.investorId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only submit proof of payment for your own investment",
      });
    }

    if (contribution.status !== "APPROVED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Only approved proposals can have proof of payment submitted",
      });
    }

    if (contribution.paymentStatus === "PAID") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Payment has already been confirmed for this contribution",
      });
    }

    // Update contribution with POP
    const updated = await db.investorContribution.update({
      where: { id: input.contributionId },
      data: {
        proofOfPaymentUrl: input.proofOfPaymentUrl,
        paymentReference: input.paymentReference ?? null,
        paymentMethod: "PROOF_OF_PAYMENT",
        paymentStatus: "POP_SUBMITTED",
        paymentSubmittedAt: new Date(),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });

    // Notify all development managers
    const managers = await db.user.findMany({
      where: {
        role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] },
      },
    });

    for (const mgr of managers) {
      await createNotification(
        mgr.id,
        "Proof of Payment Received",
        `${user.name} has submitted proof of payment of R${contribution.contributionAmount.toLocaleString()} for ${contribution.property.title}. Please review and confirm.`,
        "WARNING",
        "INVESTMENT",
        contribution.propertyId,
      );
    }

    await createAuditLog(
      user.id,
      "SUBMIT_PROOF_OF_PAYMENT",
      "InvestorContribution",
      input.contributionId,
      {
        proofOfPaymentUrl: input.proofOfPaymentUrl,
        amount: contribution.contributionAmount,
      },
    );

    return updated;
  });

// ─────────────────────────────────────────────────────────────
//  4. Review Proof of Payment (Manager)
// ─────────────────────────────────────────────────────────────

export const reviewProofOfPayment = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      action: z.enum(["APPROVE", "REJECT"]),
      reviewNotes: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can review proof of payment",
    );

    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: { property: true, investor: true },
    });

    if (!contribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contribution not found",
      });
    }

    if (contribution.paymentStatus !== "POP_SUBMITTED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This contribution does not have a proof of payment pending review",
      });
    }

    if (input.action === "APPROVE") {
      // Confirm payment and update funding
      await confirmPaymentAndUpdateFunding(
        contribution.id,
        "PROOF_OF_PAYMENT",
        contribution.paymentReference,
        user.id,
      );
    } else {
      // Reject POP — investor can re-submit
      await db.investorContribution.update({
        where: { id: input.contributionId },
        data: {
          paymentStatus: "POP_REJECTED",
          paymentReviewedAt: new Date(),
          paymentReviewedBy: user.id,
          paymentReviewNotes: input.reviewNotes ?? null,
        },
      });

      await createNotification(
        contribution.investorId,
        "Proof of Payment Rejected",
        `Your proof of payment for ${contribution.property.title} has been rejected.${input.reviewNotes ? " Reason: " + input.reviewNotes : ""} Please re-submit a valid proof of payment.`,
        "ERROR",
        "INVESTMENT",
        contribution.propertyId,
      );
    }

    await createAuditLog(
      user.id,
      "REVIEW_PROOF_OF_PAYMENT",
      "InvestorContribution",
      input.contributionId,
      {
        action: input.action,
        reviewNotes: input.reviewNotes,
      },
    );

    return { success: true, action: input.action };
  });

// ─────────────────────────────────────────────────────────────
//  5. Get Pending Payments (Manager view)
// ─────────────────────────────────────────────────────────────

export const getPendingPayments = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can view pending payments",
    );

    return db.investorContribution.findMany({
      where: {
        paymentStatus: "POP_SUBMITTED",
      },
      include: {
        investor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        property: {
          select: {
            id: true,
            title: true,
            fundingGoal: true,
            fundingRaised: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { paymentSubmittedAt: "asc" },
    });
  });

// ─────────────────────────────────────────────────────────────
//  6. Get My Approved (Awaiting Payment) Contributions
// ─────────────────────────────────────────────────────────────

export const getMyAwaitingPayment = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    return db.investorContribution.findMany({
      where: {
        investorId: user.id,
        status: "APPROVED",
        paymentStatus: {
          in: ["NOT_PAID", "AWAITING_PAYMENT", "POP_REJECTED"],
        },
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            fundingGoal: true,
            fundingRaised: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { reviewedAt: "desc" },
    });
  });
