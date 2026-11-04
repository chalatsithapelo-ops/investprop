import type { User } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";

// Match the existing legal-document staff policy. Owner roles alone confer no access.
export type EvidenceUser = Pick<User, "id" | "role">;

export function isEvidenceStaff(user: EvidenceUser): boolean {
  return ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role);
}

export interface PropertyEvidenceAccessOptions {
  /** Shared published evidence is public to authenticated users; financials are not. */
  allowPublished?: boolean;
}

/** Authorize using only authoritative server records, never caller-supplied relationships. */
export async function requirePropertyEvidenceAccess(
  user: EvidenceUser,
  propertyId: number,
  options: PropertyEvidenceAccessOptions = {},
) {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true, userId: true, isPublished: true, deletedAt: true },
  });
  if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
  if (isEvidenceStaff(user)) return property;
  if (property.deletedAt) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this property" });
  }
  if (property.userId === user.id || ((options.allowPublished ?? true) && property.isPublished)) {
    return property;
  }

  const holding = await db.shareHolding.findFirst({
    where: { propertyId, investorId: user.id, sharesOwned: { gt: 0 } },
    select: { id: true },
  });
  if (holding) return property;

  // A proposal, approval without payment, or POP upload is not investment evidence.
  // Paid contributions and actual received-share ledger entries preserve past-investor
  // access after an exit, including secondary buyers who have no primary contribution.
  const contribution = await db.investorContribution.findFirst({
    where: {
      propertyId,
      investorId: user.id,
      deletedAt: null,
      cancelledAt: null,
      status: { in: ["APPROVED", "REFUND_REQUESTED", "REFUNDED"] },
      paymentStatus: "PAID",
      contributionAmount: { gt: 0 },
    },
    select: { id: true },
  });
  if (contribution) return property;
  const receivedShares = await db.shareLedgerEntry.findFirst({
    where: {
      propertyId,
      investorId: user.id,
      shares: { gt: 0 },
      transactionType: { in: ["PURCHASE", "TRANSFER_IN", "BONUS_ISSUE"] },
    },
    select: { id: true },
  });
  if (receivedShares) return property;
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this property" });
}

/** Read authorization metadata only: callers must invoke this before content/cache reads. */
export async function requireLegalEvidenceAccess(user: EvidenceUser, documentId: number) {
  const document = await db.legalDocument.findUnique({
    where: { id: documentId },
    select: { id: true, propertyId: true, generatedFor: true },
  });
  if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
  if (!isEvidenceStaff(user) && document.generatedFor !== null && document.generatedFor !== user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this document" });
  }
  // Even ownership of a personal document does not grant access to its property.
  await requirePropertyEvidenceAccess(user, document.propertyId);
  return document;
}
