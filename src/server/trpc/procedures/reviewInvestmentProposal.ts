import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";

export const reviewInvestmentProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      action: z.enum(["APPROVE", "REJECT"]),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and ensure user is a development manager
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers can review investment proposals"
    );

    // Fetch contribution with property details
    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: {
        property: true,
      },
    });

    if (!contribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Investment proposal not found",
      });
    }

    // Check if already reviewed
    if (contribution.status !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This proposal has already been reviewed",
      });
    }

    const newStatus = input.action === "APPROVE" ? "APPROVED" : "REJECTED";

    // Update contribution status
    const updatedContribution = await db.investorContribution.update({
      where: { id: input.contributionId },
      data: {
        status: newStatus,
        reviewedAt: new Date(),
        // When approved, set paymentStatus to AWAITING_PAYMENT so investor can pay
        ...(input.action === "APPROVE" ? { paymentStatus: "AWAITING_PAYMENT" } : {}),
      },
    });

    // NOTE: fundingRaised is NOT incremented here anymore.
    // It only gets incremented when the investor's payment is confirmed
    // (either via Paystack gateway verification or manager approving proof of payment).

    // Send notification to investor
    const notificationMessage =
      input.action === "APPROVE"
        ? `Your investment proposal of R${contribution.contributionAmount.toLocaleString()} for ${contribution.property.title} has been APPROVED. Please proceed to make your payment to complete the investment.`
        : `Your investment proposal for ${contribution.property.title} has been rejected.`;

    await createNotification(
      contribution.investorId,
      input.action === "APPROVE"
        ? "Proposal Approved — Payment Required"
        : "Investment Proposal Rejected",
      notificationMessage,
      input.action === "APPROVE" ? "SUCCESS" : "INFO",
      "INVESTMENT",
      contribution.propertyId
    );

    // Create audit log
    await createAuditLog(
      user.id,
      "REVIEW_INVESTMENT",
      "InvestorContribution",
      input.contributionId,
      { action: input.action, status: newStatus }
    );

    return updatedContribution;
  });
