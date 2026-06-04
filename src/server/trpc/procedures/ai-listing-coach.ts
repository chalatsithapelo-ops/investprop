/**
 * AI Strategy 1.4 — Listing Quality Coach
 *
 * Scores a property listing 0-100 against best-practice (photos, description
 * completeness, financial-assumption sanity) and returns concrete suggestions.
 * Runs on demand from the property edit screen before publish.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";
import { buildPropertyContext } from "~/server/ai/property-context";

interface CoachResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: { area: string; suggestion: string; priority: "LOW" | "MEDIUM" | "HIGH" }[];
}

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export const coachListing = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: { id: true, userId: true, imageUrl: true, imageUrls: true, documentsPackUrls: true },
    });
    if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

    if (property.userId !== user.id && user.role !== "ADMIN" && user.role !== "DEVELOPMENT_MANAGER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the sponsor can run the listing coach" });
    }

    const ctx = await buildPropertyContext(input.propertyId, {
      includeFinancials: true,
      includeMilestones: true,
      includeLegalDocs: true,
    });
    if (!ctx) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

    const images = Array.isArray(property.imageUrls) ? property.imageUrls : [];
    const docs = Array.isArray(property.documentsPackUrls) ? property.documentsPackUrls : [];

    const systemPrompt = `You are the Investprop Listing Quality Coach. You review a draft property listing on behalf of South African retail investors and give the sponsor honest, actionable feedback BEFORE they publish.

Return ONLY JSON in this exact shape (no prose, no code fences):
{
  "score": <integer 0-100>,
  "strengths": ["<bullet>", "<bullet>", ...],
  "weaknesses": ["<bullet>", "<bullet>", ...],
  "suggestions": [
    { "area": "<photos | description | financials | docs | risk | timeline | compliance>", "suggestion": "<concrete action, imperative voice>", "priority": "LOW" | "MEDIUM" | "HIGH" }
  ]
}

Scoring rubric (start at 100, deduct):
- Fewer than 4 photos: -15. No photos: -30.
- Description < 200 chars: -15. No floor plan / no neighbourhood context: -5.
- Missing financials (no purchase price, no ROI, no ARV / cap rate): -20.
- Unrealistic returns (flip ROI > 60%, rental cap > 15%, dev IRR > 40%) without supporting milestones/budget: -15.
- No documents pack (MOI, valuation, OTP, SPV cert): -15.
- No milestones for a development / flip: -10.
- Missing risk disclosures or risk rating mismatched with the assumptions: -10.

Be specific. "Add 6 wide-angle photos including the kitchen, master bedroom and street view" beats "add more photos".`;

    const userPrompt = `LISTING DRAFT:
${ctx.text}

ASSETS:
- Hero image set: ${property.imageUrl ? "yes" : "no"}
- Gallery images: ${images.length}
- Documents pack entries: ${docs.length}
${docs.length > 0 ? "  - " + docs.map((d) => (d as { label?: string }).label ?? "untitled").join(", ") : ""}

Return the JSON object now.`;

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "listing-coach",
      model: getModelId("cheap"),
      metadata: { propertyId: input.propertyId },
      run: () => generateText({ model: getModel("cheap"), system: systemPrompt, prompt: userPrompt }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = safeParseJson<CoachResult>(result.text);
    if (!parsed) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned an unparseable response." });
    }
    const normalised: CoachResult = {
      score: clampScore(parsed.score),
      strengths: (parsed.strengths ?? []).slice(0, 8),
      weaknesses: (parsed.weaknesses ?? []).slice(0, 8),
      suggestions: (parsed.suggestions ?? [])
        .filter((s) => s && typeof s.suggestion === "string")
        .slice(0, 10)
        .map((s) => ({
          area: s.area ?? "general",
          suggestion: s.suggestion,
          priority: s.priority === "HIGH" || s.priority === "MEDIUM" || s.priority === "LOW" ? s.priority : "MEDIUM",
        })),
    };

    await db.property.update({
      where: { id: input.propertyId },
      data: {
        aiListingScore: normalised.score,
        aiListingFeedback: {
          strengths: normalised.strengths,
          weaknesses: normalised.weaknesses,
          suggestions: normalised.suggestions,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    return normalised;
  });

export const getListingCoachResult = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const p = await db.property.findUnique({
      where: { id: input.propertyId },
      select: { aiListingScore: true, aiListingFeedback: true },
    });
    if (!p || p.aiListingScore == null) return null;
    return {
      score: p.aiListingScore,
      feedback: p.aiListingFeedback as {
        strengths: string[];
        weaknesses: string[];
        suggestions: { area: string; suggestion: string; priority: "LOW" | "MEDIUM" | "HIGH" }[];
        generatedAt: string;
      } | null,
    };
  });
