import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";

// ─── List SPVs ─────────────────────────────────────────────────

export const getSPVs = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.sPV.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        director: { select: { id: true, name: true, email: true } },
        properties: { select: { id: true, title: true, investmentStatus: true } },
        _count: { select: { properties: true, acquisitions: true } },
      },
    });
  });

// ─── Get single SPV ───────────────────────────────────────────

export const getSPVById = baseProcedure
  .input(z.object({ authToken: z.string(), spvId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const spv = await db.sPV.findUnique({
      where: { id: input.spvId },
      include: {
        director: { select: { id: true, name: true, email: true } },
        properties: {
          select: {
            id: true, title: true, price: true, imageUrl: true,
            investmentStatus: true, city: true, state: true,
          },
        },
        acquisitions: {
          include: {
            property: { select: { id: true, title: true } },
          },
        },
      },
    });
    if (!spv) throw new TRPCError({ code: "NOT_FOUND", message: "SPV not found" });
    return spv;
  });

// ─── Create SPV ───────────────────────────────────────────────

export const createSPV = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      name: z.string().min(1),
      registrationNumber: z.string().optional(),
      taxNumber: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankName: z.string().optional(),
      bankBranchCode: z.string().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    return db.sPV.create({
      data: {
        name: input.name,
        registrationNumber: input.registrationNumber,
        taxNumber: input.taxNumber,
        bankAccountNumber: input.bankAccountNumber,
        bankName: input.bankName,
        bankBranchCode: input.bankBranchCode,
        notes: input.notes,
        directorId: user.id,
      },
    });
  });

// ─── Update SPV ───────────────────────────────────────────────

export const updateSPV = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      spvId: z.number(),
      name: z.string().optional(),
      registrationNumber: z.string().optional(),
      taxNumber: z.string().optional(),
      status: z.enum(["PENDING_REGISTRATION", "REGISTERED", "ACTIVE", "DORMANT", "DEREGISTERED"]).optional(),
      registeredDate: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankName: z.string().optional(),
      bankBranchCode: z.string().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const { authToken, spvId, registeredDate, ...data } = input;
    return db.sPV.update({
      where: { id: spvId },
      data: {
        ...data,
        registeredDate: registeredDate ? new Date(registeredDate) : undefined,
      },
    });
  });

// ─── Assign Property to SPV ──────────────────────────────────

export const assignPropertyToSPV = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      spvId: z.number(),
      propertyId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    // Verify SPV exists
    const spv = await db.sPV.findUnique({ where: { id: input.spvId } });
    if (!spv) throw new TRPCError({ code: "NOT_FOUND", message: "SPV not found" });

    // Verify property exists
    const property = await db.property.findUnique({ where: { id: input.propertyId } });
    if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

    // Check if property is already assigned to another SPV
    if (property.spvId && property.spvId !== input.spvId) {
      const existingSPV = await db.sPV.findUnique({ where: { id: property.spvId } });
      throw new TRPCError({
        code: "CONFLICT",
        message: `Property is already assigned to SPV "${existingSPV?.name ?? "Unknown"}"`,
      });
    }

    return db.property.update({
      where: { id: input.propertyId },
      data: { spvId: input.spvId },
    });
  });

// ─── Remove Property from SPV ────────────────────────────────

export const removePropertyFromSPV = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      spvId: z.number(),
      propertyId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const property = await db.property.findUnique({ where: { id: input.propertyId } });
    if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

    if (property.spvId !== input.spvId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Property is not assigned to this SPV" });
    }

    return db.property.update({
      where: { id: input.propertyId },
      data: { spvId: null },
    });
  });
