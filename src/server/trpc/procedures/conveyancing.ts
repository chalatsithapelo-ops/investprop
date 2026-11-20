import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";

// Conveyancers handle transfer / registration; managers + admin also oversee.
const CONVEYANCER_ROLES = ["CONVEYANCER", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const;

const TRANSFER_STEPS = [
  "AUCTION_WON",
  "DEPOSIT_PAID",
  "SPV_ASSIGNED",
  "CESSION_EXECUTED",
  "CONVEYANCING_IN_PROGRESS",
  "REGISTERED_AT_DEEDS",
  "TRANSFER_COMPLETE",
] as const;

/**
 * Conveyancer transfer queue — every acquisition and its transfer/registration
 * progress. Conveyancers advance each matter through the Deeds Office pipeline.
 */
export const getConveyancingQueue = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...CONVEYANCER_ROLES], "Conveyancer access required");

    const acquisitions = await db.acquisition.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        property: { select: { id: true, title: true, city: true, state: true } },
        spv: { select: { id: true, name: true, registrationNumber: true } },
      },
    });

    const rows = acquisitions.map((a) => ({
      id: a.id,
      propertyId: a.propertyId,
      propertyTitle: a.property.title,
      location: [a.property.city, a.property.state].filter(Boolean).join(", "),
      spvName: a.spv?.name ?? null,
      spvRegistration: a.spv?.registrationNumber ?? null,
      purchasePrice: a.purchasePrice,
      transferDuty: a.transferDuty,
      conveyancingFees: a.conveyancingFees,
      cessionExecuted: a.cessionExecuted,
      cessionDate: a.cessionDate,
      deedsOfficeRef: a.deedsOfficeRef,
      transferStatus: a.transferStatus,
      stepIndex: TRANSFER_STEPS.indexOf(a.transferStatus as any),
      expectedTransferDate: a.expectedTransferDate,
      actualTransferDate: a.actualTransferDate,
      notes: a.notes,
      updatedAt: a.updatedAt,
    }));

    const summary = {
      total: rows.length,
      inProgress: rows.filter((r) => r.transferStatus !== "TRANSFER_COMPLETE").length,
      completed: rows.filter((r) => r.transferStatus === "TRANSFER_COMPLETE").length,
      awaitingCession: rows.filter((r) => !r.cessionExecuted).length,
    };

    return { rows, summary, steps: TRANSFER_STEPS };
  });

/** Conveyancer advances a matter: update status, deeds ref, fees, dates. */
export const updateConveyancingMatter = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      acquisitionId: z.number(),
      transferStatus: z.enum(TRANSFER_STEPS).optional(),
      deedsOfficeRef: z.string().max(100).optional(),
      conveyancingFees: z.number().min(0).optional(),
      transferDuty: z.number().min(0).optional(),
      cessionExecuted: z.boolean().optional(),
      expectedTransferDate: z.string().optional(),
      actualTransferDate: z.string().optional(),
      notes: z.string().max(2000).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...CONVEYANCER_ROLES], "Conveyancer access required");

    const existing = await db.acquisition.findUnique({ where: { id: input.acquisitionId } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Acquisition not found" });

    const data: any = {};
    if (input.transferStatus) data.transferStatus = input.transferStatus;
    if (input.deedsOfficeRef !== undefined) data.deedsOfficeRef = input.deedsOfficeRef.trim() || null;
    if (input.conveyancingFees !== undefined) data.conveyancingFees = input.conveyancingFees;
    if (input.transferDuty !== undefined) data.transferDuty = input.transferDuty;
    if (input.cessionExecuted !== undefined) {
      data.cessionExecuted = input.cessionExecuted;
      if (input.cessionExecuted && !existing.cessionDate) data.cessionDate = new Date();
    }
    if (input.expectedTransferDate) data.expectedTransferDate = new Date(input.expectedTransferDate);
    if (input.actualTransferDate) data.actualTransferDate = new Date(input.actualTransferDate);
    if (input.transferStatus === "TRANSFER_COMPLETE" && !existing.actualTransferDate && !input.actualTransferDate) {
      data.actualTransferDate = new Date();
    }
    if (input.notes !== undefined) data.notes = input.notes.trim() || null;

    const updated = await db.acquisition.update({ where: { id: input.acquisitionId }, data });

    await createAuditLog(user.id, "UPDATE_CONVEYANCING_MATTER", "Acquisition", updated.id, {
      transferStatus: updated.transferStatus,
      deedsOfficeRef: updated.deedsOfficeRef,
    });

    return { id: updated.id, transferStatus: updated.transferStatus };
  });
