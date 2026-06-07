import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getDevelopmentMetrics = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      includeAllProjects: z.boolean().default(false), // If true, show all projects (for investors)
    })
  )
  .query(async ({ input }) => {
    // Verify authentication token
    const user = await getAuthenticatedUser(input.authToken);

    // Determine which properties to include based on role and input
    const whereClause =
      input.includeAllProjects || user.role === "INVESTOR"
        ? {} // Investors see all projects
        : { userId: user.id }; // Managers see only their projects

    // Get all development properties with their budget entries
    const properties = await db.property.findMany({
      where: {
        ...whereClause,
        propertyDevelopment: { isNot: null },
      },
      include: {
        propertyDevelopment: true,
        budgetEntries: {
          orderBy: { dateRecorded: "desc" },
          take: 1, // Just get the most recent for last update info
        },
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Calculate aggregate metrics
    const totalProjects = properties.length;
    const activeProjects = properties.filter(
      (p) => p.status === "IN_PROGRESS"
    ).length;
    const completedProjects = properties.filter(
      (p) => p.status === "COMPLETED"
    ).length;

    const totalBudget = properties.reduce(
      (sum, p) => sum + (p.propertyDevelopment?.totalBudget || 0),
      0
    );
    const totalSpent = properties.reduce(
      (sum, p) => sum + (p.propertyDevelopment?.spentBudget || 0),
      0
    );
    const totalRemaining = totalBudget - totalSpent;
    const averageBudgetUsed =
      totalProjects > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Calculate expected vs actual timeline metrics
    const now = new Date();
    const projectsWithTimeline = properties
      .filter((p) => p.propertyDevelopment)
      .map((p) => {
        const dev = p.propertyDevelopment!;
        const startDate = new Date(dev.startDate);
        const estimatedEndDate = new Date(dev.estimatedEndDate);
        const actualEndDate = dev.actualEndDate
          ? new Date(dev.actualEndDate)
          : null;

        const totalDuration = estimatedEndDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        const percentComplete = Math.min(
          100,
          Math.max(0, (elapsed / totalDuration) * 100)
        );

        const budgetProgress =
          dev.totalBudget > 0 ? (dev.spentBudget / dev.totalBudget) * 100 : 0;

        // Timeline adherence: comparing budget progress to time progress
        const isOnTrack = Math.abs(budgetProgress - percentComplete) < 15; // Within 15%
        const isBehindSchedule = budgetProgress < percentComplete - 15;
        const isAheadOfSchedule = budgetProgress > percentComplete + 15;

        return {
          propertyId: p.id,
          projectName: dev.projectName,
          percentComplete,
          budgetProgress,
          isOnTrack,
          isBehindSchedule,
          isAheadOfSchedule,
          status: p.status,
        };
      });

    const onTrackProjects = projectsWithTimeline.filter((p) => p.isOnTrack).length;
    const behindScheduleProjects = projectsWithTimeline.filter(
      (p) => p.isBehindSchedule
    ).length;
    const aheadOfScheduleProjects = projectsWithTimeline.filter(
      (p) => p.isAheadOfSchedule
    ).length;

    // Calculate financial metrics
    const totalExpectedRevenue = properties.reduce(
      (sum, p) =>
        sum + (p.propertyDevelopment?.totalExpectedRevenue || 0),
      0
    );
    const totalExpectedProfit = properties.reduce(
      (sum, p) => sum + (p.propertyDevelopment?.expectedProfit || 0),
      0
    );
    const averageROI =
      properties.length > 0
        ? properties.reduce(
            (sum, p) => sum + (p.propertyDevelopment?.expectedROI || 0),
            0
          ) / properties.length
        : 0;

    // Recent activity
    const recentActivity = properties
      .filter((p) => p.budgetEntries.length > 0)
      .map((p) => {
        const firstEntry = p.budgetEntries[0]!;
        return {
          propertyId: p.id,
          projectName: p.propertyDevelopment!.projectName,
          lastUpdate: firstEntry.dateRecorded,
          lastUpdateAmount: firstEntry.amount,
          lastUpdateCategory: firstEntry.category,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime()
      )
      .slice(0, 5);

    // Top projects by various metrics
    const topProjectsByBudget = [...properties]
      .sort(
        (a, b) =>
          (b.propertyDevelopment?.totalBudget || 0) -
          (a.propertyDevelopment?.totalBudget || 0)
      )
      .slice(0, 5)
      .map((p) => ({
        propertyId: p.id,
        projectName: p.propertyDevelopment!.projectName,
        totalBudget: p.propertyDevelopment!.totalBudget,
        spentBudget: p.propertyDevelopment!.spentBudget,
        status: p.status,
      }));

    const topProjectsByROI = [...properties]
      .filter((p) => p.propertyDevelopment?.expectedROI)
      .sort(
        (a, b) =>
          (b.propertyDevelopment?.expectedROI || 0) -
          (a.propertyDevelopment?.expectedROI || 0)
      )
      .slice(0, 5)
      .map((p) => ({
        propertyId: p.id,
        projectName: p.propertyDevelopment!.projectName,
        expectedROI: p.propertyDevelopment!.expectedROI,
        expectedProfit: p.propertyDevelopment!.expectedProfit,
        status: p.status,
      }));

    return {
      overview: {
        totalProjects,
        activeProjects,
        completedProjects,
        totalBudget,
        totalSpent,
        totalRemaining,
        averageBudgetUsed,
        totalExpectedRevenue,
        totalExpectedProfit,
        averageROI,
      },
      timeline: {
        onTrackProjects,
        behindScheduleProjects,
        aheadOfScheduleProjects,
        projectsWithTimeline,
      },
      recentActivity,
      topProjects: {
        byBudget: topProjectsByBudget,
        byROI: topProjectsByROI,
      },
    };
  });
