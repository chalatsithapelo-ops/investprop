import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { sendMilestoneNotification } from "~/server/utils/email";
import { createNotification } from "./notifications";

export const createBudgetEntry = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      amount: z.number().positive(),
      category: z.string().min(1),
      description: z.string().min(1),
      quotationUrl: z.string().optional(),
      milestoneId: z.number().optional(),
      dateRecorded: z.string().optional(), // ISO date string, defaults to now
    })
  )
  .mutation(async ({ input }) => {
    // Authenticate and verify role using helper
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers and project managers can log budget entries"
    );

    // Verify property exists
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
      },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Create budget entry and update spent budget in a transaction
    const result = await db.$transaction(async (tx) => {
      // Create the budget entry
      const budgetEntry = await tx.budgetEntry.create({
        data: {
          propertyId: input.propertyId,
          amount: input.amount,
          category: input.category,
          description: input.description,
          quotationUrl: input.quotationUrl,
          milestoneId: input.milestoneId,
          dateRecorded: input.dateRecorded
            ? new Date(input.dateRecorded)
            : new Date(),
          recordedById: user.id,
        },
      });

      // Update the spent budget based on property type
      let newSpentBudget = 0;

      if (property.propertyFlip) {
        newSpentBudget = property.propertyFlip.spentInvestmentBudget + input.amount;
        await tx.propertyFlip.update({
          where: { propertyId: input.propertyId },
          data: { spentInvestmentBudget: newSpentBudget },
        });
      } else if (property.rentalBond) {
        newSpentBudget = property.rentalBond.spentInvestmentBudget + input.amount;
        await tx.rentalBond.update({
          where: { propertyId: input.propertyId },
          data: { spentInvestmentBudget: newSpentBudget },
        });
      } else if (property.propertyDevelopment) {
        newSpentBudget = property.propertyDevelopment.spentBudget + input.amount;
        await tx.propertyDevelopment.update({
          where: { propertyId: input.propertyId },
          data: { spentBudget: newSpentBudget },
        });
      }

      // Update milestone budget spent if milestoneId is provided
      let milestone = null;
      if (input.milestoneId) {
        // Increment budget spent
        milestone = await tx.milestone.update({
          where: { id: input.milestoneId },
          data: {
            budgetSpent: {
              increment: input.amount,
            },
          },
        });

        // Auto-complete milestone if budget spent >= allocated budget
        if (milestone.budgetSpent >= milestone.budgetAllocated && milestone.status !== "COMPLETED") {
          milestone = await tx.milestone.update({
            where: { id: input.milestoneId },
            data: {
              status: "COMPLETED",
              actualCompletionDate: new Date(),
            },
          });
        }
      }

      return { budgetEntry, newSpentBudget, milestone };
    });

    // Send milestone notifications to investors if this entry has a milestone
    if (input.milestoneId && result.milestone) {
      // Fetch all investors who have contributions to this property
      const investorContributions = await db.investorContribution.findMany({
        where: { propertyId: input.propertyId },
        include: {
          investor: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Send email to each investor (non-blocking)
      const emailPromises = investorContributions.map((contribution) =>
        sendMilestoneNotification(
          {
            email: contribution.investor.email,
            name: contribution.investor.name,
          },
          {
            propertyTitle: property.title,
            milestone: result.milestone!.name,
            propertyId: input.propertyId,
            amount: input.amount,
            category: input.category,
          }
        ).catch((error) => {
          console.error(`Failed to send milestone notification to ${contribution.investor.email}:`, error);
        })
      );

      // Send emails in background (don't wait for them)
      Promise.all(emailPromises).catch((error) => {
        console.error("Error sending milestone notifications:", error);
      });
    }
    // For development projects, also send notifications for significant cost categories
    else if (property.propertyDevelopment) {
      const significantCategories = ["Land Acquisition", "Hard Costs", "Soft Costs"];
      if (significantCategories.includes(input.category)) {
        // Fetch all investors who have contributions to this property
        const investorContributions = await db.investorContribution.findMany({
          where: { propertyId: input.propertyId },
          include: {
            investor: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        // Send email to each investor (non-blocking)
        const emailPromises = investorContributions.map((contribution) =>
          sendMilestoneNotification(
            {
              email: contribution.investor.email,
              name: contribution.investor.name,
            },
            {
              propertyTitle: property.title,
              milestone: `${input.category} Phase Started`,
              propertyId: input.propertyId,
              amount: input.amount,
              category: input.category,
            }
          ).catch((error) => {
            console.error(`Failed to send milestone notification to ${contribution.investor.email}:`, error);
          })
        );

        // Send emails in background (don't wait for them)
        Promise.all(emailPromises).catch((error) => {
          console.error("Error sending milestone notifications:", error);
        });
      }
    }

    // Send in-app notifications to all property investors
    const allInvestors = await db.investorContribution.findMany({
      where: { propertyId: input.propertyId },
      select: { investorId: true },
      distinct: ["investorId"],
    });

    const budgetMsg = input.milestoneId && result.milestone
      ? `R${input.amount.toLocaleString("en-ZA")} spent on "${result.milestone.name}" for "${property.title}" (${input.category})`
      : `R${input.amount.toLocaleString("en-ZA")} budget entry recorded for "${property.title}" (${input.category})`;

    for (const inv of allInvestors) {
      createNotification(
        inv.investorId,
        "Budget Expenditure",
        budgetMsg,
        "INFO",
        "PROPERTY",
        input.propertyId
      );
    }

    // Notify investors if milestone was auto-completed
    if (result.milestone?.status === "COMPLETED") {
      for (const inv of allInvestors) {
        createNotification(
          inv.investorId,
          "Milestone Completed",
          `Milestone "${result.milestone.name}" for "${property.title}" has been auto-completed (budget fully spent)`,
          "SUCCESS",
          "MILESTONE",
          input.propertyId
        );
      }
    }

    return {
      success: true,
      budgetEntry: result.budgetEntry,
      newSpentBudget: result.newSpentBudget,
      milestoneAutoCompleted: result.milestone?.status === "COMPLETED",
    };
  });

