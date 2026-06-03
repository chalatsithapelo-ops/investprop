import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";

// ═══════════════════════════════════════════════════════════════
//  FICA Verification
//  South African FICA threshold: investments ≥ R20,000 require
//  verified ID, proof of address, and bank confirmation letter.
//  Investments under R20,000 are exempt from full FICA checks.
// ═══════════════════════════════════════════════════════════════

export const FICA_THRESHOLD = 20_000; // R20,000

// ─────────────────────────────────────────────────────────────
//  1. Get My FICA Status (Investor self-check)
// ─────────────────────────────────────────────────────────────

export const getMyFicaStatus = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // Pull KYC docs for this user
    const docs = await db.kYCDocument.findMany({
      where: { investorId: user.id },
      select: {
        id: true,
        documentType: true,
        status: true,
        documentUrl: true,
        createdAt: true,
        reviewNotes: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const requiredTypes = ["ID_DOCUMENT", "PROOF_OF_ADDRESS"];
    const approvedTypes = docs
      .filter((d) => d.status === "APPROVED")
      .map((d) => d.documentType);
    const pendingTypes = docs
      .filter((d) => d.status === "PENDING")
      .map((d) => d.documentType);

    const missingDocs = requiredTypes.filter(
      (t) => !approvedTypes.includes(t as any) && !pendingTypes.includes(t as any),
    );
    const pendingDocs = requiredTypes.filter(
      (t) => pendingTypes.includes(t as any) && !approvedTypes.includes(t as any),
    );

    // Calculate total approved/pending investment amount by this user
    const contributions = await db.investorContribution.findMany({
      where: {
        investorId: user.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: { contributionAmount: true },
    });
    const totalInvested = contributions.reduce(
      (sum, c) => sum + c.contributionAmount,
      0,
    );

    return {
      ficaVerified: user.ficaVerified,
      ficaVerifiedAt: user.ficaVerifiedAt,
      ficaExempt: user.ficaExempt,
      ficaRejectedAt: user.ficaRejectedAt,
      ficaRejectedReason: user.ficaRejectedReason,
      // Whether user currently needs FICA (based on threshold)
      ficaRequired: totalInvested >= FICA_THRESHOLD || !user.ficaExempt,
      totalInvested,
      threshold: FICA_THRESHOLD,
      // Document status
      documentsSubmitted: docs.length,
      documentsApproved: approvedTypes.length,
      documentsPending: pendingDocs.length,
      missingDocuments: missingDocs,
      pendingDocuments: pendingDocs,
      allDocumentsApproved: missingDocs.length === 0 && pendingDocs.length === 0 && approvedTypes.length >= requiredTypes.length,
      documents: docs,
    };
  });

// ─────────────────────────────────────────────────────────────
//  2. Verify Investor FICA (Manager action)
// ─────────────────────────────────────────────────────────────

export const verifyInvestorFica = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      investorId: z.number(),
      action: z.enum(["VERIFY", "REJECT"]),
      reason: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can verify FICA status",
    );

    const investor = await db.user.findUnique({
      where: { id: input.investorId },
    });

    if (!investor) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Investor not found" });
    }

    if (input.action === "VERIFY") {
      // Check that all required KYC docs are approved
      const docs = await db.kYCDocument.findMany({
        where: { investorId: input.investorId },
      });
      const approvedTypes = docs
        .filter((d) => d.status === "APPROVED")
        .map((d) => d.documentType);
      const requiredTypes = ["ID_DOCUMENT", "PROOF_OF_ADDRESS"];
      const missingDocs = requiredTypes.filter(
        (t) => !approvedTypes.includes(t as any),
      );

      if (missingDocs.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot verify FICA: missing approved documents — ${missingDocs.join(", ")}. Approve the KYC documents first.`,
        });
      }

      await db.user.update({
        where: { id: input.investorId },
        data: {
          ficaVerified: true,
          ficaVerifiedAt: new Date(),
          ficaVerifiedById: user.id,
          ficaRejectedAt: null,
          ficaRejectedReason: null,
        },
      });

      await createNotification(
        input.investorId,
        "FICA Verification Approved",
        "Your FICA verification has been approved! You can now invest in amounts of R20,000 and above.",
        "SUCCESS",
        "SYSTEM",
        null,
      );

      await createAuditLog(
        user.id,
        "VERIFY_FICA",
        "User",
        input.investorId,
        { action: "VERIFY", verifiedBy: user.name },
      );

      return { success: true, action: "VERIFY" };
    } else {
      // REJECT
      await db.user.update({
        where: { id: input.investorId },
        data: {
          ficaVerified: false,
          ficaVerifiedAt: null,
          ficaRejectedAt: new Date(),
          ficaRejectedReason: input.reason ?? "FICA verification rejected",
        },
      });

      await createNotification(
        input.investorId,
        "FICA Verification Rejected",
        `Your FICA verification has been rejected. Reason: ${input.reason ?? "Insufficient documentation"}. Please upload the required documents and try again.`,
        "ERROR",
        "SYSTEM",
        null,
      );

      await createAuditLog(
        user.id,
        "REJECT_FICA",
        "User",
        input.investorId,
        { action: "REJECT", reason: input.reason },
      );

      return { success: true, action: "REJECT" };
    }
  });

// ─────────────────────────────────────────────────────────────
//  3. Get All Investors FICA Status (Manager dashboard)
// ─────────────────────────────────────────────────────────────

export const getInvestorsFicaStatus = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      filter: z.enum(["ALL", "VERIFIED", "UNVERIFIED", "PENDING_DOCS"]).optional(),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can view investor FICA status",
    );

    const investors = await db.user.findMany({
      where: { role: "INVESTOR" },
      select: {
        id: true,
        name: true,
        email: true,
        ficaVerified: true,
        ficaVerifiedAt: true,
        ficaExempt: true,
        ficaRejectedAt: true,
        ficaRejectedReason: true,
        createdAt: true,
        // KYC profile fields
        idNumber: true,
        dateOfBirth: true,
        phoneNumber: true,
        residentialAddress: true,
        city: true,
        province: true,
        postalCode: true,
        taxNumber: true,
        companyName: true,
        companyRegNumber: true,
        kycSubmittedAt: true,
        kycDocuments: {
          select: {
            id: true,
            documentType: true,
            documentUrl: true,
            status: true,
            reviewNotes: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        investorContributions: {
          where: { status: { in: ["PENDING", "APPROVED"] } },
          select: { contributionAmount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = investors.map((inv) => {
      const totalInvested = inv.investorContributions.reduce(
        (sum, c) => sum + c.contributionAmount,
        0,
      );
      const requiredTypes = ["ID_DOCUMENT", "PROOF_OF_ADDRESS"];
      const approvedTypes = inv.kycDocuments
        .filter((d) => d.status === "APPROVED")
        .map((d) => d.documentType);
      const pendingTypes = inv.kycDocuments
        .filter((d) => d.status === "PENDING")
        .map((d) => d.documentType);
      const missingDocs = requiredTypes.filter(
        (t) => !approvedTypes.includes(t as any),
      );
      const hasPendingDocs = pendingTypes.length > 0;

      return {
        id: inv.id,
        name: inv.name,
        email: inv.email,
        ficaVerified: inv.ficaVerified,
        ficaVerifiedAt: inv.ficaVerifiedAt,
        ficaExempt: inv.ficaExempt,
        ficaRejectedAt: inv.ficaRejectedAt,
        ficaRejectedReason: inv.ficaRejectedReason,
        createdAt: inv.createdAt,
        // KYC profile details
        idNumber: inv.idNumber,
        dateOfBirth: inv.dateOfBirth,
        phoneNumber: inv.phoneNumber,
        residentialAddress: inv.residentialAddress,
        city: inv.city,
        province: inv.province,
        postalCode: inv.postalCode,
        taxNumber: inv.taxNumber,
        companyName: inv.companyName,
        companyRegNumber: inv.companyRegNumber,
        kycSubmittedAt: inv.kycSubmittedAt,
        totalInvested,
        requiresFica: totalInvested >= FICA_THRESHOLD,
        documentsApproved: approvedTypes.length,
        documentsPending: pendingTypes.length,
        missingDocuments: missingDocs,
        hasPendingDocs,
        allDocsApproved: missingDocs.length === 0 && approvedTypes.length >= requiredTypes.length,
        kycDocuments: inv.kycDocuments,
      };
    });

    // Apply filter
    let filtered = enriched;
    if (input.filter === "VERIFIED") {
      filtered = enriched.filter((i) => i.ficaVerified);
    } else if (input.filter === "UNVERIFIED") {
      filtered = enriched.filter((i) => !i.ficaVerified);
    } else if (input.filter === "PENDING_DOCS") {
      filtered = enriched.filter((i) => i.hasPendingDocs);
    }

    // Summary stats
    const totalInvestors = investors.length;
    const verified = investors.filter((i) => i.ficaVerified).length;
    const unverified = investors.filter((i) => !i.ficaVerified).length;
    const requiresFica = enriched.filter((i) => i.requiresFica && !i.ficaVerified).length;

    return {
      investors: filtered,
      stats: {
        totalInvestors,
        verified,
        unverified,
        requiresFicaUrgent: requiresFica,
      },
    };
  });
