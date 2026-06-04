/**
 * AI Strategy 2.4 — Auto-Generated Investor Update Emails
 *
 * For a given property + period (YYYY-MM), AI drafts a per-deal monthly
 * investor letter from milestones + budget burn + risks + recent
 * distributions. Dev manager reviews + 1-click sends to all investors
 * via existing Resend pipeline.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";
import { buildPropertyContext } from "~/server/ai/property-context";
import { sendEmail } from "~/server/utils/email";

interface DraftShape {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const generateInvestorUpdate = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      period: z.string().optional(),
      force: z.boolean().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"]);

    const period = input.period ?? currentPeriod();

    if (!input.force) {
      const existing = await db.investorUpdateDraft.findUnique({
        where: { propertyId_period: { propertyId: input.propertyId, period } },
      });
      if (existing) return existing;
    }

    const ctx = await buildPropertyContext(input.propertyId, {
      includeFinancials: true,
      includeMilestones: true,
      includeBudget: true,
      includeRisks: true,
      includeContributions: true,
    });
    if (!ctx) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

    const systemPrompt = `You are Investprop's monthly investor-update drafter. You write the warm, honest, plain-English monthly letter a development manager would send to fractional investors in a South African SPV.

Return ONLY JSON in this exact shape (no prose, no code fences):
{
  "subject": "<concise subject line, includes property short name and period e.g. 'Acacia Heights — May 2026 update'>",
  "bodyHtml": "<HTML body suitable for email. Use <h2>, <p>, <ul>, <strong>. No <html>/<head>. Inline styles only if essential. Max 800 words.>",
  "bodyText": "<Plain-text equivalent of the body. Same content, no HTML.>"
}

Voice & content:
- Second person plural ('your investment', 'we'). Sponsor speaks in first person plural.
- South African investor context: Rand, transfer duty, FSCA, SARS provisional tax.
- ALWAYS include in order: (1) headline progress in 1 sentence; (2) what was done this period; (3) budget vs. plan; (4) what's next; (5) risks/issues honestly; (6) distributions if any; (7) closing thanks.
- Be honest about delays or overruns. NEVER hide bad news.
- Do NOT make commitments not supported by the data. Use "we expect", "we are aiming for".
- End with: "This update is sponsor reporting and not financial advice. Please direct questions to the deal Co-Pilot or your advisor."`;

    const userPrompt = `${ctx.text}

PERIOD: ${period}
DRAFT THE INVESTOR UPDATE EMAIL NOW. Return the JSON object.`;

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "update-draft",
      model: getModelId("premium"),
      metadata: { propertyId: input.propertyId, period },
      run: () => generateText({ model: getModel("premium"), system: systemPrompt, prompt: userPrompt }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = safeParseJson<DraftShape>(result.text);
    if (!parsed?.subject || !parsed.bodyHtml || !parsed.bodyText) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned an unparseable draft." });
    }

    return db.investorUpdateDraft.upsert({
      where: { propertyId_period: { propertyId: input.propertyId, period } },
      update: {
        subject: parsed.subject.slice(0, 200),
        bodyHtml: parsed.bodyHtml,
        bodyText: parsed.bodyText,
        status: "DRAFT",
        sentAt: null,
        sentById: null,
        generatedAt: new Date(),
      },
      create: {
        propertyId: input.propertyId,
        period,
        subject: parsed.subject.slice(0, 200),
        bodyHtml: parsed.bodyHtml,
        bodyText: parsed.bodyText,
        status: "DRAFT",
      },
    });
  });

export const updateInvestorDraft = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      draftId: z.number(),
      subject: z.string().min(3).max(200).optional(),
      bodyHtml: z.string().optional(),
      bodyText: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"]);
    const existing = await db.investorUpdateDraft.findUnique({ where: { id: input.draftId } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
    if (existing.status === "SENT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a draft after it has been sent" });
    }
    return db.investorUpdateDraft.update({
      where: { id: input.draftId },
      data: {
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.bodyHtml ? { bodyHtml: input.bodyHtml } : {}),
        ...(input.bodyText ? { bodyText: input.bodyText } : {}),
      },
    });
  });

export const sendInvestorUpdate = baseProcedure
  .input(z.object({ authToken: z.string(), draftId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"]);

    const draft = await db.investorUpdateDraft.findUnique({
      where: { id: input.draftId },
      include: { property: { select: { investorContributions: { include: { investor: { select: { id: true, name: true, email: true } } } } } } },
    });
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
    if (draft.status === "SENT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Draft already sent" });
    }

    const recipients = new Map<number, { id: number; name: string; email: string }>();
    for (const c of draft.property.investorContributions) {
      if (c.investor.email && !recipients.has(c.investor.id)) {
        recipients.set(c.investor.id, c.investor);
      }
    }

    let sent = 0;
    let failed = 0;
    for (const r of recipients.values()) {
      try {
        await sendEmail({ name: r.name, email: r.email }, draft.subject, draft.bodyHtml, draft.bodyText);
        sent++;
      } catch (err) {
        failed++;
        console.error("[sendInvestorUpdate] send failed for", r.email, err);
      }
    }

    await db.investorUpdateDraft.update({
      where: { id: draft.id },
      data: { status: "SENT", sentAt: new Date(), sentById: user.id },
    });

    return { sent, failed, totalRecipients: recipients.size };
  });

export const listInvestorUpdates = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.investorUpdateDraft.findMany({
      where: { propertyId: input.propertyId },
      orderBy: { generatedAt: "desc" },
      take: 24,
    });
  });
