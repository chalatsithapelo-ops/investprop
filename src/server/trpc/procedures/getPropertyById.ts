import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getPropertyById = baseProcedure
  .input(z.object({ propertyId: z.number() }))
  .query(async ({ input }) => {
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        spv: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
            taxNumber: true,
            status: true,
            bankName: true,
            bankAccountNumber: true,
            bankBranchCode: true,
            director: { select: { id: true, name: true } },
          },
        },
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
        budgetEntries: {
          include: {
            recordedBy: {
              select: { id: true, name: true },
            },
            milestone: {
              select: { id: true, name: true },
            },
          },
          orderBy: { dateRecorded: "desc" },
        },
        milestones: {
          orderBy: { order: "asc" },
        },
        investorContributions: {
          include: {
            investor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        aiAnalyses: {
          orderBy: {
            generatedAt: 'desc',
          },
        },
      },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Calculate actual funding raised from PAID contributions only
    // The stored property.fundingRaised may be stale
    const paidRaised = property.investorContributions
      .filter((c) => c.paymentStatus === "PAID")
      .reduce((sum, c) => sum + c.contributionAmount, 0);

    // Get the correct funding goal from the property sub-type
    const subTypeGoal =
      property.propertyFlip?.fundingGoal ??
      property.rentalBond?.fundingGoal ??
      property.propertyDevelopment?.fundingGoal ??
      0;

    // Get expected returns from the property sub-type
    const expectedROI =
      property.propertyFlip?.expectedROI ??
      property.rentalBond?.capRate ??
      property.propertyDevelopment?.expectedROI ??
      0;

    return {
      ...property,
      fundingRaised: paidRaised,
      fundingGoal: subTypeGoal > 0 ? subTypeGoal : property.fundingGoal,
      expectedReturns: expectedROI || property.expectedReturns || 0,
    };
  });
