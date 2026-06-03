import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════
//  Share Certificate Management
//  Certificates are auto-issued when payment is confirmed.
//  Each certificate has internal security for tamper detection.
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/** Generate a unique certificate number: CERT-{propertyId}-{seq}-{YYYY} */
async function generateCertificateNumber(propertyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.shareCertificate.count({
    where: { propertyId },
  });
  const seq = String(count + 1).padStart(4, "0");
  return `CERT-${propertyId}-${seq}-${year}`;
}

/** Create an SHA-256 hash of key certificate fields for tamper detection */
function computeValidationHash(data: {
  certificateNumber: string;
  contributionId: number;
  propertyId: number;
  investorId: number;
  numberOfShares: number;
  sharePrice: number;
  totalValue: number;
  ownershipPercentage: number;
  issueDate: string;
  fingerprint: string;
}): string {
  const payload = [
    data.certificateNumber,
    data.contributionId,
    data.propertyId,
    data.investorId,
    data.numberOfShares.toFixed(6),
    data.sharePrice.toFixed(4),
    data.totalValue.toFixed(2),
    data.ownershipPercentage.toFixed(6),
    data.issueDate,
    data.fingerprint,
    // Internal salt — never exposed
    "propvest-sa-cert-salt-v1-2026",
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

/** Calculate share info for a given contribution amount and property */
export async function calculateShareInfo(
  propertyId: number,
  contributionAmount: number,
): Promise<{
  numberOfShares: number;
  sharePrice: number;
  ownershipPercentage: number;
  shareClassName: string;
} | null> {
  // Try to find a share class for this property
  const shareClasses = await db.shareClass.findMany({
    where: { propertyId },
    orderBy: { createdAt: "asc" },
  });

  if (shareClasses.length === 0) {
    // No share class — fall back to funding-goal-based calculation
    const property = await db.property.findUnique({
      where: { id: propertyId },
    });
    if (!property || property.fundingGoal <= 0) return null;

    // Each R1 of funding goal = 1 share (effectively, shares = amount)
    // ownershipPercentage = (contribution / fundingGoal) * 100
    const effectiveSharePrice = 1; // R1 per share
    const numShares = contributionAmount / effectiveSharePrice;
    const ownershipPct = (contributionAmount / property.fundingGoal) * 100;

    return {
      numberOfShares: numShares,
      sharePrice: effectiveSharePrice,
      ownershipPercentage: ownershipPct,
      shareClassName: "Ordinary",
    };
  }

  // Use the first (primary) share class
  const sc = shareClasses[0]!;
  const numShares = contributionAmount / sc.pricePerShare;
  const ownershipPct = (numShares / sc.totalShares) * 100;

  return {
    numberOfShares: numShares,
    sharePrice: sc.pricePerShare,
    ownershipPercentage: ownershipPct,
    shareClassName: sc.name,
  };
}

// ─────────────────────────────────────────────────────────────
//  Issue a certificate (called from confirmPaymentAndUpdateFunding)
// ─────────────────────────────────────────────────────────────

export async function issueCertificate(
  contributionId: number,
  issuedById: number,
  ipAddress?: string,
): Promise<any> {
  const contribution = await db.investorContribution.findUnique({
    where: { id: contributionId },
    include: {
      property: true,
      investor: true,
      certificate: true,
    },
  });

  if (!contribution) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contribution not found" });
  }

  // Don't re-issue if already exists
  if (contribution.certificate) {
    return contribution.certificate;
  }

  // Calculate share info
  const shareInfo = await calculateShareInfo(
    contribution.propertyId,
    contribution.contributionAmount,
  );

  const numberOfShares = shareInfo?.numberOfShares ?? contribution.numberOfShares ?? 0;
  const sharePrice = shareInfo?.sharePrice ?? contribution.sharePrice ?? 0;
  const ownershipPct = shareInfo?.ownershipPercentage ?? contribution.ownershipPercentage ?? 0;
  const shareClassName = shareInfo?.shareClassName ?? "Ordinary";

  // Update contribution with calculated share info if not already set
  if (!contribution.numberOfShares) {
    await db.investorContribution.update({
      where: { id: contributionId },
      data: {
        numberOfShares,
        sharePrice,
        ownershipPercentage: ownershipPct,
      },
    });
  }

  const certificateNumber = await generateCertificateNumber(contribution.propertyId);
  const fingerprint = crypto.randomUUID();
  const issueDate = new Date();

  const validationHash = computeValidationHash({
    certificateNumber,
    contributionId: contribution.id,
    propertyId: contribution.propertyId,
    investorId: contribution.investorId,
    numberOfShares,
    sharePrice,
    totalValue: contribution.contributionAmount,
    ownershipPercentage: ownershipPct,
    issueDate: issueDate.toISOString(),
    fingerprint,
  });

  const certificate = await db.shareCertificate.create({
    data: {
      certificateNumber,
      contributionId: contribution.id,
      propertyId: contribution.propertyId,
      investorId: contribution.investorId,
      investorName: contribution.investor.name,
      propertyTitle: contribution.property.title,
      propertyAddress: `${contribution.property.address}, ${contribution.property.city}, ${contribution.property.state}`,
      numberOfShares,
      sharePrice,
      totalValue: contribution.contributionAmount,
      ownershipPercentage: ownershipPct,
      shareClassName,
      issueDate,
      validationHash,
      internalFingerprint: fingerprint,
      issuedById,
      ipAddressAtIssuance: ipAddress ?? null,
      auditTrail: [
        {
          action: "ISSUED",
          userId: issuedById,
          timestamp: issueDate.toISOString(),
          details: `Certificate ${certificateNumber} issued for contribution #${contribution.id}`,
        },
      ],
    },
  });

  // Notify investor about their certificate
  await createNotification(
    contribution.investorId,
    "Share Certificate Issued",
    `Your share certificate (${certificateNumber}) for ${contribution.property.title} has been issued. You own ${numberOfShares.toLocaleString()} shares (${ownershipPct.toFixed(2)}% ownership). View your certificate in "My Certificates".`,
    "SUCCESS",
    "INVESTMENT",
    contribution.propertyId,
  );

  await createAuditLog(
    issuedById,
    "ISSUE_SHARE_CERTIFICATE",
    "ShareCertificate",
    certificate.id,
    {
      certificateNumber,
      contributionId,
      numberOfShares,
      ownershipPercentage: ownershipPct,
    },
  );

  return certificate;
}

// ─────────────────────────────────────────────────────────────
//  1. Get My Certificates (Investor view — public fields only)
// ─────────────────────────────────────────────────────────────

export const getMyCertificates = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const certificates = await db.shareCertificate.findMany({
      where: {
        investorId: user.id,
        isValid: true,
      },
      select: {
        // Only public fields — never expose internal tracking
        id: true,
        certificateNumber: true,
        propertyTitle: true,
        propertyAddress: true,
        investorName: true,
        numberOfShares: true,
        sharePrice: true,
        totalValue: true,
        ownershipPercentage: true,
        issueDate: true,
        shareClassName: true,
        isValid: true,
        propertyId: true,
        property: {
          select: {
            imageUrl: true,
            fundingGoal: true,
            fundingRaised: true,
            status: true,
          },
        },
      },
      orderBy: { issueDate: "desc" },
    });

    return certificates;
  });

// ─────────────────────────────────────────────────────────────
//  2. Get Certificate Detail (Investor — single certificate)
// ─────────────────────────────────────────────────────────────

export const getCertificateDetail = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      certificateId: z.number(),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const cert = await db.shareCertificate.findUnique({
      where: { id: input.certificateId },
      select: {
        id: true,
        certificateNumber: true,
        propertyTitle: true,
        propertyAddress: true,
        investorName: true,
        numberOfShares: true,
        sharePrice: true,
        totalValue: true,
        ownershipPercentage: true,
        issueDate: true,
        shareClassName: true,
        isValid: true,
        propertyId: true,
        investorId: true,
        property: {
          select: {
            imageUrl: true,
            fundingGoal: true,
            fundingRaised: true,
            status: true,
            title: true,
          },
        },
      },
    });

    if (!cert) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not found" });
    }

    // Only the certificate owner can view it
    if (cert.investorId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only view your own certificates",
      });
    }

    return cert;
  });

// ─────────────────────────────────────────────────────────────
//  2b. Get Certificate PDF Data (for PDF generation)
//      Investors can access their own; managers can access any
// ─────────────────────────────────────────────────────────────

export const getCertificatePDFData = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      certificateId: z.number(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const isManager = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role);

    const cert = await db.shareCertificate.findUnique({
      where: { id: input.certificateId },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            state: true,
            fundingGoal: true,
            spv: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
              },
            },
          },
        },
        investor: {
          select: {
            id: true,
            name: true,
            email: true,
            investorCode: true,
          },
        },
        contribution: {
          select: {
            id: true,
            contributionAmount: true,
            paymentMethod: true,
            paymentStatus: true,
            paymentReference: true,
          },
        },
      },
    });

    if (!cert) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not found" });
    }

    // Investors can only access their own certificates
    if (!isManager && cert.investorId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only download your own certificates",
      });
    }

    // ── DOWNLOAD TRACKING ──────────────────────────────────────
    // Every PDF download gets a unique copy number and document serial
    const newCopyNumber = (cert.downloadCount ?? 0) + 1;
    const documentSerial = `DS-${cert.certificateNumber}-${newCopyNumber.toString().padStart(3, "0")}-${Date.now().toString(36).toUpperCase()}`;
    const downloadTimestamp = new Date();

    const downloadEntry = {
      copyNumber: newCopyNumber,
      documentSerial,
      downloadedBy: user.id,
      downloadedByName: user.name,
      downloadedByRole: user.role,
      timestamp: downloadTimestamp.toISOString(),
    };

    // Update download count and log
    await db.shareCertificate.update({
      where: { id: cert.id },
      data: {
        downloadCount: newCopyNumber,
        downloadLog: [
          ...((cert.downloadLog as any[]) ?? []),
          downloadEntry,
        ],
        auditTrail: [
          ...((cert.auditTrail as any[]) ?? []),
          {
            action: "PDF_DOWNLOADED",
            userId: user.id,
            timestamp: downloadTimestamp.toISOString(),
            details: `PDF copy #${newCopyNumber} downloaded by ${user.name} (${user.role}). Serial: ${documentSerial}`,
          },
        ],
      },
    });

    await createAuditLog(
      user.id,
      "DOWNLOAD_CERTIFICATE_PDF",
      "ShareCertificate",
      cert.id,
      {
        certificateNumber: cert.certificateNumber,
        copyNumber: newCopyNumber,
        documentSerial,
      },
    );

    return {
      certificateNumber: cert.certificateNumber,
      investorName: cert.investorName,
      investorCode: cert.investor?.investorCode ?? `IP-INV-${cert.investorId.toString().padStart(5, "0")}`,
      propertyTitle: cert.propertyTitle,
      propertyAddress: cert.propertyAddress,
      numberOfShares: cert.numberOfShares,
      sharePrice: cert.sharePrice,
      totalValue: cert.totalValue,
      ownershipPercentage: cert.ownershipPercentage,
      shareClassName: cert.shareClassName,
      issueDate: cert.issueDate,
      isValid: cert.isValid,
      fingerprint: cert.internalFingerprint,
      validationHash: cert.validationHash,
      verificationCount: cert.verificationCount,
      propertyCity: cert.property?.city ?? "",
      propertyState: cert.property?.state ?? "",
      fundingGoal: cert.property?.fundingGoal ?? 0,
      paymentMethod: cert.contribution?.paymentMethod ?? "N/A",
      paymentReference: cert.contribution?.paymentReference ?? "N/A",
      // ── SPV details (legal entity holding the property) ──
      spvName: cert.property?.spv?.name ?? null,
      spvRegistrationNumber: cert.property?.spv?.registrationNumber ?? null,
      // ── Anti-fraud / traceability fields ──
      copyNumber: newCopyNumber,
      documentSerial,
      downloadTimestamp: downloadTimestamp.toISOString(),
      downloadedBy: user.name,
      totalDownloads: newCopyNumber,
      issuedAt: cert.createdAt,
    };
  });

// ─────────────────────────────────────────────────────────────
//  3. Validate Certificate (Internal — managers only)
//     Verifies authenticity by recomputing the hash
// ─────────────────────────────────────────────────────────────

export const validateCertificate = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      certificateNumber: z.string(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can validate certificates",
    );

    const cert = await db.shareCertificate.findUnique({
      where: { certificateNumber: input.certificateNumber },
      include: {
        investor: { select: { id: true, name: true, email: true } },
        property: { select: { id: true, title: true, fundingGoal: true, fundingRaised: true } },
        contribution: {
          select: {
            id: true,
            contributionAmount: true,
            paymentStatus: true,
            paymentMethod: true,
            paymentReference: true,
            status: true,
          },
        },
      },
    });

    if (!cert) {
      return {
        valid: false,
        exists: false,
        message: "No certificate found with this number",
        certificateNumber: input.certificateNumber,
      };
    }

    // Recompute hash to detect tampering
    const expectedHash = computeValidationHash({
      certificateNumber: cert.certificateNumber,
      contributionId: cert.contributionId,
      propertyId: cert.propertyId,
      investorId: cert.investorId,
      numberOfShares: cert.numberOfShares,
      sharePrice: cert.sharePrice,
      totalValue: cert.totalValue,
      ownershipPercentage: cert.ownershipPercentage,
      issueDate: cert.issueDate.toISOString(),
      fingerprint: cert.internalFingerprint,
    });

    const hashValid = expectedHash === cert.validationHash;

    // Update verification tracking
    await db.shareCertificate.update({
      where: { id: cert.id },
      data: {
        verificationCount: { increment: 1 },
        lastVerifiedAt: new Date(),
        lastVerifiedById: user.id,
        auditTrail: [
          ...((cert.auditTrail as any[]) ?? []),
          {
            action: "VALIDATED",
            userId: user.id,
            timestamp: new Date().toISOString(),
            details: `Validated by ${user.name}. Hash ${hashValid ? "PASSED" : "FAILED"}`,
          },
        ],
        ...(hashValid ? {} : { fraudFlags: { increment: 1 } }),
      },
    });

    await createAuditLog(
      user.id,
      "VALIDATE_CERTIFICATE",
      "ShareCertificate",
      cert.id,
      {
        certificateNumber: cert.certificateNumber,
        hashValid,
        fraudFlags: cert.fraudFlags + (hashValid ? 0 : 1),
      },
    );

    return {
      valid: hashValid && cert.isValid,
      exists: true,
      hashIntegrity: hashValid,
      isRevoked: !cert.isValid,
      revokedReason: cert.revokedReason,
      certificateNumber: cert.certificateNumber,
      // Full internal details for managers
      certificate: {
        id: cert.id,
        certificateNumber: cert.certificateNumber,
        investorName: cert.investorName,
        investor: cert.investor,
        property: cert.property,
        contribution: cert.contribution,
        numberOfShares: cert.numberOfShares,
        sharePrice: cert.sharePrice,
        totalValue: cert.totalValue,
        ownershipPercentage: cert.ownershipPercentage,
        issueDate: cert.issueDate,
        shareClassName: cert.shareClassName,
        isValid: cert.isValid,
        revokedAt: cert.revokedAt,
        revokedReason: cert.revokedReason,
        // Internal-only tracking
        internalFingerprint: cert.internalFingerprint,
        fraudFlags: cert.fraudFlags,
        verificationCount: cert.verificationCount + 1,
        lastVerifiedAt: new Date(),
        issuedById: cert.issuedById,
        ipAddressAtIssuance: cert.ipAddressAtIssuance,
        internalNotes: cert.internalNotes,
        auditTrail: cert.auditTrail,
        createdAt: cert.createdAt,
      },
      message: hashValid && cert.isValid
        ? "Certificate is authentic and valid"
        : !hashValid
          ? "WARNING: Certificate hash mismatch — possible tampering detected"
          : "Certificate has been revoked",
    };
  });

// ─────────────────────────────────────────────────────────────
//  4. Revoke Certificate (Internal — managers only)
// ─────────────────────────────────────────────────────────────

export const revokeCertificate = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      certificateId: z.number(),
      reason: z.string().min(1),
      internalNotes: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can revoke certificates",
    );

    const cert = await db.shareCertificate.findUnique({
      where: { id: input.certificateId },
    });

    if (!cert) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not found" });
    }

    if (!cert.isValid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Certificate is already revoked",
      });
    }

    const updated = await db.shareCertificate.update({
      where: { id: input.certificateId },
      data: {
        isValid: false,
        revokedAt: new Date(),
        revokedReason: input.reason,
        revokedById: user.id,
        ...(input.internalNotes ? { internalNotes: input.internalNotes } : {}),
        auditTrail: [
          ...((cert.auditTrail as any[]) ?? []),
          {
            action: "REVOKED",
            userId: user.id,
            timestamp: new Date().toISOString(),
            details: `Revoked by ${user.name}. Reason: ${input.reason}`,
          },
        ],
      },
    });

    // Notify investor
    await createNotification(
      cert.investorId,
      "Share Certificate Revoked",
      `Your share certificate (${cert.certificateNumber}) for ${cert.propertyTitle} has been revoked. Reason: ${input.reason}. Please contact management for further information.`,
      "ERROR",
      "INVESTMENT",
      cert.propertyId,
    );

    await createAuditLog(
      user.id,
      "REVOKE_CERTIFICATE",
      "ShareCertificate",
      cert.id,
      { certificateNumber: cert.certificateNumber, reason: input.reason },
    );

    return updated;
  });

// ─────────────────────────────────────────────────────────────
//  5. Get All Certificates (Internal — managers only)
//     Includes all internal tracking fields
// ─────────────────────────────────────────────────────────────

export const getAllCertificates = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number().optional(),
      validOnly: z.boolean().optional(),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can view all certificates",
    );

    return db.shareCertificate.findMany({
      where: {
        ...(input.propertyId ? { propertyId: input.propertyId } : {}),
        ...(input.validOnly !== undefined ? { isValid: input.validOnly } : {}),
      },
      include: {
        investor: { select: { id: true, name: true, email: true } },
        property: { select: { id: true, title: true } },
        contribution: {
          select: {
            id: true,
            contributionAmount: true,
            paymentStatus: true,
            paymentMethod: true,
          },
        },
      },
      orderBy: { issueDate: "desc" },
    });
  });

// ─────────────────────────────────────────────────────────────
//  6. Update Internal Notes (managers only)
// ─────────────────────────────────────────────────────────────

export const updateCertificateNotes = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      certificateId: z.number(),
      internalNotes: z.string(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can update certificate notes",
    );

    const cert = await db.shareCertificate.findUnique({
      where: { id: input.certificateId },
    });

    if (!cert) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not found" });
    }

    return db.shareCertificate.update({
      where: { id: input.certificateId },
      data: {
        internalNotes: input.internalNotes,
        auditTrail: [
          ...((cert.auditTrail as any[]) ?? []),
          {
            action: "NOTES_UPDATED",
            userId: user.id,
            timestamp: new Date().toISOString(),
            details: `Internal notes updated by ${user.name}`,
          },
        ],
      },
    });
  });

// ─────────────────────────────────────────────────────────────
//  7. Calculate Share Preview (for investors before submitting)
// ─────────────────────────────────────────────────────────────

export const calculateSharePreview = baseProcedure
  .input(
    z.object({
      propertyId: z.number(),
      amount: z.number().positive(),
    }),
  )
  .query(async ({ input }) => {
    const result = await calculateShareInfo(input.propertyId, input.amount);
    if (!result) {
      return null;
    }
    return {
      numberOfShares: result.numberOfShares,
      sharePrice: result.sharePrice,
      ownershipPercentage: result.ownershipPercentage,
      shareClassName: result.shareClassName,
    };
  });
