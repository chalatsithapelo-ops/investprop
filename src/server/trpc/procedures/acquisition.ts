import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";
import { createNotification } from "./notifications";

// ─── Create Acquisition ───────────────────────────────────────

export const createAcquisition = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      spvId: z.number().optional(),
      acquiredByName: z.string().min(1),
      acquiredByType: z.enum(["PERSONAL", "EXISTING_COMPANY", "SPV"]),
      auctionDate: z.string(),
      auctionVenue: z.string().optional(),
      auctionType: z.string().optional(),
      depositAmount: z.number(),
      depositPaid: z.boolean().optional(),
      purchasePrice: z.number(),
      transferDuty: z.number().optional(),
      conveyancingFees: z.number().optional(),
      expectedTransferDate: z.string().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    // If acquired by SPV, verify the SPV exists
    if (input.acquiredByType === "SPV" && input.spvId) {
      const spv = await db.sPV.findUnique({ where: { id: input.spvId } });
      if (!spv) throw new TRPCError({ code: "NOT_FOUND", message: "SPV not found" });
    }

    return db.acquisition.create({
      data: {
        propertyId: input.propertyId,
        spvId: input.spvId,
        acquiredByName: input.acquiredByName,
        acquiredByType: input.acquiredByType,
        auctionDate: new Date(input.auctionDate),
        auctionVenue: input.auctionVenue,
        auctionType: input.auctionType,
        depositAmount: input.depositAmount,
        depositPaid: input.depositPaid ?? false,
        purchasePrice: input.purchasePrice,
        transferDuty: input.transferDuty ?? 0,
        conveyancingFees: input.conveyancingFees ?? 0,
        expectedTransferDate: input.expectedTransferDate
          ? new Date(input.expectedTransferDate)
          : undefined,
        notes: input.notes,
      },
    });
  });

// ─── Get Acquisitions ─────────────────────────────────────────

export const getAcquisitions = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.acquisition.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        property: {
          select: { id: true, title: true, address: true, city: true, imageUrl: true, price: true },
        },
        spv: { select: { id: true, name: true, status: true } },
      },
    });
  });

// ─── Update Acquisition Transfer Status ────────────────────────

export const updateAcquisitionStatus = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      acquisitionId: z.number(),
      transferStatus: z.enum([
        "AUCTION_WON", "DEPOSIT_PAID", "SPV_ASSIGNED",
        "CESSION_EXECUTED", "CONVEYANCING_IN_PROGRESS",
        "REGISTERED_AT_DEEDS", "TRANSFER_COMPLETE",
      ]),
      spvId: z.number().optional(),
      cessionDate: z.string().optional(),
      deedsOfficeRef: z.string().optional(),
      actualTransferDate: z.string().optional(),
      depositPaid: z.boolean().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const acquisition = await db.acquisition.findUnique({
      where: { id: input.acquisitionId },
    });
    if (!acquisition) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Acquisition not found" });
    }

    const updateData: any = {
      transferStatus: input.transferStatus,
    };

    // Set SPV if assigning
    if (input.spvId) {
      updateData.spvId = input.spvId;
      // Also link the property to the SPV
      await db.property.update({
        where: { id: acquisition.propertyId },
        data: { spvId: input.spvId },
      });
    }

    if (input.cessionDate) {
      updateData.cessionExecuted = true;
      updateData.cessionDate = new Date(input.cessionDate);
    }
    if (input.deedsOfficeRef) updateData.deedsOfficeRef = input.deedsOfficeRef;
    if (input.actualTransferDate) updateData.actualTransferDate = new Date(input.actualTransferDate);
    if (input.depositPaid !== undefined) updateData.depositPaid = input.depositPaid;
    if (input.notes) updateData.notes = input.notes;

    const updated = await db.acquisition.update({
      where: { id: input.acquisitionId },
      data: updateData,
      include: { property: { select: { id: true, title: true } } },
    });

    // Notify all shareholders of this property about the status change
    const holders = await db.shareHolding.findMany({
      where: { propertyId: acquisition.propertyId },
      select: { investorId: true },
    });
    for (const holder of holders) {
      await createNotification(
        holder.investorId,
        "Property Transfer Update",
        `${updated.property.title}: Transfer status updated to ${input.transferStatus.replace(/_/g, " ")}. The acquisition pipeline is progressing.`,
        "INFO",
        "PROPERTY",
        acquisition.propertyId
      );
    }

    return updated;
  });
