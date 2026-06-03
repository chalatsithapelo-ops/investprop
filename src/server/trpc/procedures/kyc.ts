import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";
import { createNotification } from "./notifications";

// ─── Submit KYC Profile + Documents ───────────────────────────
// Investors fill out a form with their personal details and attach
// supporting documents (ID, proof of address, etc.) all at once.

export const submitKYCProfile = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      // Personal details
      fullName: z.string().min(2, "Full legal name is required"),
      idNumber: z.string().min(6, "ID / passport number is required"),
      dateOfBirth: z.string().min(1, "Date of birth is required"),
      phoneNumber: z.string().min(9, "Contact number is required"),
      residentialAddress: z.string().min(5, "Residential address is required"),
      city: z.string().min(2, "City / town is required"),
      province: z.string().min(2, "Province is required"),
      postalCode: z.string().min(4, "Postal code is required"),
      taxNumber: z.string().optional(),
      companyName: z.string().optional(),
      companyRegNumber: z.string().optional(),
      // Supporting documents (URLs from uploadFile)
      documents: z.array(
        z.object({
          documentType: z.enum([
            "ID_DOCUMENT",
            "PROOF_OF_ADDRESS",
            "BANK_STATEMENT",
            "TAX_NUMBER",
            "COMPANY_REGISTRATION",
          ]),
          documentUrl: z.string().url("Invalid document URL"),
          fileName: z.string().optional(),
        }),
      ).min(1, "At least one supporting document is required"),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // Save the personal details to user profile
    await db.user.update({
      where: { id: user.id },
      data: {
        name: input.fullName,
        idNumber: input.idNumber,
        dateOfBirth: new Date(input.dateOfBirth),
        phoneNumber: input.phoneNumber,
        residentialAddress: input.residentialAddress,
        city: input.city,
        province: input.province,
        postalCode: input.postalCode,
        taxNumber: input.taxNumber || null,
        companyName: input.companyName || null,
        companyRegNumber: input.companyRegNumber || null,
        kycSubmittedAt: new Date(),
        // Reset any previous FICA rejection so they can re-apply
        ficaRejectedAt: null,
        ficaRejectedReason: null,
      },
    });

    // Delete any existing documents and re-create with the new uploads
    await db.kYCDocument.deleteMany({
      where: { investorId: user.id },
    });

    // Create all documents in a batch
    await db.kYCDocument.createMany({
      data: input.documents.map((doc) => ({
        investorId: user.id,
        documentType: doc.documentType,
        documentUrl: doc.documentUrl,
        status: "PENDING" as const,
      })),
    });

    // Notify managers about the new KYC submission
    const managers = await db.user.findMany({
      where: { role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] } },
      select: { id: true },
    });

    for (const mgr of managers) {
      await createNotification(
        mgr.id,
        "New KYC Submission",
        `${input.fullName} has submitted their KYC/FICA documents for review.`,
        "INFO",
        "SYSTEM",
        null,
      );
    }

    return { success: true, documentsSubmitted: input.documents.length };
  });

// ─── Get KYC Profile ──────────────────────────────────────────

export const getKYCProfile = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const profile = await db.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
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
        ficaVerified: true,
        ficaVerifiedAt: true,
        ficaRejectedAt: true,
        ficaRejectedReason: true,
      },
    });

    const documents = await db.kYCDocument.findMany({
      where: { investorId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return { profile, documents };
  });

// ─── Upload KYC Document ──────────────────────────────────────

export const uploadKYCDocument = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      documentType: z.enum([
        "ID_DOCUMENT", "PROOF_OF_ADDRESS",
        "BANK_STATEMENT", "TAX_NUMBER", "COMPANY_REGISTRATION",
      ]),
      documentUrl: z.string(),
      propertyId: z.number().optional(),
      expiresAt: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    return db.kYCDocument.create({
      data: {
        investorId: user.id,
        propertyId: input.propertyId,
        documentType: input.documentType,
        documentUrl: input.documentUrl,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
    });
  });

// ─── Get KYC Documents ────────────────────────────────────────

export const getKYCDocuments = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      investorId: z.number().optional(), // Admin can view any investor
      allPending: z.boolean().optional(), // Manager: fetch ALL pending docs
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // Manager mode: return all pending documents across all investors
    if (input.allPending) {
      const managerRoles = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"];
      if (!managerRoles.includes(user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers can view all documents" });
      }
      return db.kYCDocument.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          property: { select: { id: true, title: true } },
          investor: { select: { id: true, name: true, email: true } },
        },
      });
    }

    const targetId = input.investorId ?? user.id;

    return db.kYCDocument.findMany({
      where: { investorId: targetId },
      orderBy: { createdAt: "desc" },
      include: {
        property: { select: { id: true, title: true } },
        investor: { select: { id: true, name: true, email: true } },
      },
    });
  });

// ─── Review KYC Document (Admin) ──────────────────────────────

export const reviewKYCDocument = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      documentId: z.number(),
      status: z.enum(["APPROVED", "REJECTED"]),
      reviewNotes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const doc = await db.kYCDocument.update({
      where: { id: input.documentId },
      data: {
        status: input.status,
        reviewedById: user.id,
        reviewNotes: input.reviewNotes,
      },
    });

    // Notify the investor about KYC review result
    createNotification(
      doc.investorId,
      `KYC Document ${input.status === "APPROVED" ? "Approved" : "Rejected"}`,
      `Your ${doc.documentType.replace(/_/g, " ").toLowerCase()} has been ${input.status.toLowerCase()}${input.reviewNotes ? ` — ${input.reviewNotes}` : ""}`,
      input.status === "APPROVED" ? "SUCCESS" : "ERROR",
      "SYSTEM",
      null
    );

    return doc;
  });

// ─── Check KYC Compliance ─────────────────────────────────────

export const checkKYCCompliance = baseProcedure
  .input(z.object({ authToken: z.string(), investorId: z.number().optional() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const targetId = input.investorId ?? user.id;

    const docs = await db.kYCDocument.findMany({
      where: { investorId: targetId },
    });

    const requiredTypes = ["ID_DOCUMENT", "PROOF_OF_ADDRESS"];
    const approvedTypes = docs
      .filter((d) => d.status === "APPROVED")
      .map((d) => d.documentType);

    const missingDocs = requiredTypes.filter((t) => !approvedTypes.includes(t as any));
    const expiredDocs = docs.filter((d) => d.expiresAt && new Date(d.expiresAt) < new Date());

    return {
      isCompliant: missingDocs.length === 0 && expiredDocs.length === 0,
      missingDocuments: missingDocs,
      expiredDocuments: expiredDocs.map((d) => d.documentType),
      totalDocuments: docs.length,
      approvedDocuments: docs.filter((d) => d.status === "APPROVED").length,
      pendingDocuments: docs.filter((d) => d.status === "PENDING").length,
    };
  });
