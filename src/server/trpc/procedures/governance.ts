import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";
import { createNotification } from "./notifications";

// ─── Governance Controls ──────────────────────────────────────
// These thresholds protect the platform from proposal spam and
// ensure only material shareholders can raise governance actions.

const GOVERNANCE_RULES = {
  /** Minimum % of total shares an investor must hold to create a proposal */
  MIN_OWNERSHIP_PERCENTAGE_TO_PROPOSE: 5,
  /** Cooldown period in days between proposals by the same investor for the same property */
  PROPOSAL_COOLDOWN_DAYS: 30,
  /** Maximum number of OPEN proposals per property at any time */
  MAX_ACTIVE_PROPOSALS_PER_PROPERTY: 3,
  /** Cooling-off period in days after share purchase — investor can request refund within this window */
  COOLING_OFF_PERIOD_DAYS: 7,
};

// ─── Get Governance Rules (so frontend can display them) ──────

export const getGovernanceRules = baseProcedure
  .input(z.object({}))
  .query(() => GOVERNANCE_RULES);

// ─── Create Proposal ──────────────────────────────────────────

export const createProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      title: z.string().min(1),
      description: z.string().min(1),
      proposalType: z.enum([
        "SELL_PROPERTY", "RENOVATE", "CHANGE_TENANT",
        "CHANGE_MANAGER", "DISTRIBUTE", "OTHER",
      ]),
      requiredQuorum: z.number().min(1).max(100).default(51),
      requiredMajority: z.number().min(1).max(100).default(51),
      deadline: z.string(), // ISO date
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // Verify user is a shareholder
    const holding = await db.shareHolding.findFirst({
      where: { propertyId: input.propertyId, investorId: user.id },
    });
    if (!holding) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only shareholders can create proposals",
      });
    }

    // ── Guard 1: Minimum ownership threshold ──────────────────
    const allHoldings = await db.shareHolding.findMany({
      where: { propertyId: input.propertyId },
    });
    const totalShares = allHoldings.reduce((s: number, h: any) => s + h.sharesOwned, 0);
    const investorShares = allHoldings
      .filter((h: any) => h.investorId === user.id)
      .reduce((s: number, h: any) => s + h.sharesOwned, 0);
    const ownershipPct = totalShares > 0 ? (investorShares / totalShares) * 100 : 0;

    if (ownershipPct < GOVERNANCE_RULES.MIN_OWNERSHIP_PERCENTAGE_TO_PROPOSE) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You must hold at least ${GOVERNANCE_RULES.MIN_OWNERSHIP_PERCENTAGE_TO_PROPOSE}% of shares to raise a proposal. You currently hold ${ownershipPct.toFixed(1)}%.`,
      });
    }

    // ── Guard 2: Cooldown period per investor per property ────
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - GOVERNANCE_RULES.PROPOSAL_COOLDOWN_DAYS);
    const recentProposal = await db.proposal.findFirst({
      where: {
        propertyId: input.propertyId,
        createdById: user.id,
        createdAt: { gte: cooldownDate },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recentProposal) {
      const nextAllowed = new Date(recentProposal.createdAt);
      nextAllowed.setDate(nextAllowed.getDate() + GOVERNANCE_RULES.PROPOSAL_COOLDOWN_DAYS);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `You can only raise one proposal per ${GOVERNANCE_RULES.PROPOSAL_COOLDOWN_DAYS} days per property. Your next proposal can be submitted after ${nextAllowed.toLocaleDateString("en-ZA")}.`,
      });
    }

    // ── Guard 3: Max active proposals per property ────────────
    const activeProposals = await db.proposal.count({
      where: { propertyId: input.propertyId, status: "OPEN" },
    });
    if (activeProposals >= GOVERNANCE_RULES.MAX_ACTIVE_PROPOSALS_PER_PROPERTY) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `This property already has ${activeProposals} active proposals. A maximum of ${GOVERNANCE_RULES.MAX_ACTIVE_PROPOSALS_PER_PROPERTY} open proposals are allowed at a time. Please wait for existing proposals to be resolved.`,
      });
    }

    const proposal = await db.proposal.create({
      data: {
        propertyId: input.propertyId,
        title: input.title,
        description: input.description,
        proposalType: input.proposalType,
        requiredQuorum: input.requiredQuorum,
        requiredMajority: input.requiredMajority,
        deadline: new Date(input.deadline),
        createdById: user.id,
      },
    });

    // Notify all shareholders about the new proposal
    const allHolders = await db.shareHolding.findMany({
      where: { propertyId: input.propertyId },
      select: { investorId: true },
    });
    for (const holder of allHolders) {
      if (holder.investorId !== user.id) {
        await createNotification(
          holder.investorId,
          "New Shareholder Proposal",
          `"${input.title}" — A new ${input.proposalType.replace("_", " ").toLowerCase()} proposal requires your vote. Deadline: ${new Date(input.deadline).toLocaleDateString()}.`,
          "INFO",
          "INVESTMENT",
          input.propertyId
        );
      }
    }

    return proposal;
  });

// ─── Get Proposals ────────────────────────────────────────────

export const getProposals = baseProcedure
  .input(
    z.object({
      propertyId: z.number().optional(),
      status: z.enum(["OPEN", "CLOSED", "EXECUTED", "CANCELLED"]).optional(),
    })
  )
  .query(async ({ input }) => {
    const where: any = {};
    if (input.propertyId) where.propertyId = input.propertyId;
    if (input.status) where.status = input.status;

    const proposals = await db.proposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        property: { select: { id: true, title: true } },
        votes: {
          include: {
            investor: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Calculate vote tallies
    return proposals.map((p) => {
      const yesVotes = p.votes.filter((v) => v.voteChoice === "YES");
      const noVotes = p.votes.filter((v) => v.voteChoice === "NO");
      const abstainVotes = p.votes.filter((v) => v.voteChoice === "ABSTAIN");

      const yesShares = yesVotes.reduce((s, v) => s + v.sharesAtTime, 0);
      const noShares = noVotes.reduce((s, v) => s + v.sharesAtTime, 0);
      const abstainShares = abstainVotes.reduce((s, v) => s + v.sharesAtTime, 0);
      const totalVotedShares = yesShares + noShares + abstainShares;

      return {
        ...p,
        tally: {
          yesCount: yesVotes.length,
          noCount: noVotes.length,
          abstainCount: abstainVotes.length,
          yesShares,
          noShares,
          abstainShares,
          totalVotedShares,
          yesPercentage: totalVotedShares > 0 ? (yesShares / totalVotedShares) * 100 : 0,
        },
      };
    });
  });

// ─── Cast Vote ────────────────────────────────────────────────

export const castVote = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      voteChoice: z.enum(["YES", "NO", "ABSTAIN"]),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const proposal = await db.proposal.findUnique({
      where: { id: input.proposalId },
    });
    if (!proposal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    }
    if (proposal.status !== "OPEN") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Voting is closed for this proposal" });
    }
    if (new Date() > proposal.deadline) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Voting deadline has passed" });
    }

    // Get investor's shares in this property
    const holdings = await db.shareHolding.findMany({
      where: { propertyId: proposal.propertyId, investorId: user.id },
    });
    const totalShares = holdings.reduce((s, h) => s + h.sharesOwned, 0);

    if (totalShares === 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only shareholders can vote",
      });
    }

    // Upsert vote (allow changing vote before deadline)
    return db.vote.upsert({
      where: {
        proposalId_investorId: {
          proposalId: input.proposalId,
          investorId: user.id,
        },
      },
      create: {
        proposalId: input.proposalId,
        investorId: user.id,
        voteChoice: input.voteChoice,
        sharesAtTime: totalShares,
      },
      update: {
        voteChoice: input.voteChoice,
        sharesAtTime: totalShares,
      },
    });
  });

// ─── Close Proposal & Tally Results ──────────────────────────

export const closeProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const proposal = await db.proposal.findUnique({
      where: { id: input.proposalId },
      include: { votes: true },
    });
    if (!proposal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    }

    // Get total outstanding shares for the property
    const allHoldings = await db.shareHolding.findMany({
      where: { propertyId: proposal.propertyId },
    });
    const totalOutstandingShares = allHoldings.reduce((s, h) => s + h.sharesOwned, 0);

    // Calculate results
    const totalVotedShares = proposal.votes.reduce((s, v) => s + v.sharesAtTime, 0);
    const quorumReached = (totalVotedShares / totalOutstandingShares) * 100 >= proposal.requiredQuorum;

    const yesShares = proposal.votes
      .filter((v) => v.voteChoice === "YES")
      .reduce((s, v) => s + v.sharesAtTime, 0);
    const yesPercentage = totalVotedShares > 0 ? (yesShares / totalVotedShares) * 100 : 0;
    const passed = quorumReached && yesPercentage >= proposal.requiredMajority;

    let result: string;
    if (!quorumReached) {
      result = "QUORUM_NOT_MET";
    } else if (passed) {
      result = "PASSED";
    } else {
      result = "FAILED";
    }

    const updated = await db.proposal.update({
      where: { id: input.proposalId },
      data: {
        status: "CLOSED",
        result,
      },
    });

    // Notify all shareholders about the voting result
    const allHolders = await db.shareHolding.findMany({
      where: { propertyId: proposal.propertyId },
      select: { investorId: true },
    });
    for (const holder of allHolders) {
      await createNotification(
        holder.investorId,
        `Proposal ${result === "PASSED" ? "Passed" : result === "FAILED" ? "Failed" : "Quorum Not Met"}`,
        `"${proposal.title}" has been closed. Result: ${result.replace("_", " ")}. Yes: ${yesPercentage.toFixed(1)}%, Quorum: ${((totalVotedShares / totalOutstandingShares) * 100).toFixed(1)}%/${proposal.requiredQuorum}% required.`,
        result === "PASSED" ? "SUCCESS" : "WARNING",
        "INVESTMENT",
        proposal.propertyId
      );
    }

    return updated;
  });
