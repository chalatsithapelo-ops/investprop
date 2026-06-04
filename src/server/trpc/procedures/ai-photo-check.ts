/**
 * AI Strategy 2.2 — Vision Construction Progress Verification
 *
 * Vision model checks site photos against the milestone's expected state.
 * Returns GREEN / AMBER / RED verdict + narrative.
 *
 * Persisted to ConstructionPhotoCheck. Linked optionally to a ProgressSubmission.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";

interface PhotoCheckShape {
  verdict: "GREEN" | "AMBER" | "RED";
  confidence: number;
  narrative: string;
  flags: { category: string; description: string }[];
}

const VERDICTS = new Set(["GREEN", "AMBER", "RED"]);

function normalise(parsed: unknown): PhotoCheckShape | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<PhotoCheckShape>;
  if (!VERDICTS.has(p.verdict ?? "") || typeof p.narrative !== "string") return null;
  return {
    verdict: p.verdict!,
    confidence: Math.max(0, Math.min(1, Number(p.confidence ?? 0.7))),
    narrative: p.narrative,
    flags: Array.isArray(p.flags) ? p.flags.slice(0, 8) : [],
  };
}

export const verifyConstructionPhotos = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      milestoneId: z.number().optional(),
      submissionId: z.number().optional(),
      photoUrls: z.array(z.string().url()).min(1).max(8),
      expectedState: z.string().min(10).max(2000),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);

    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: { id: true },
    });
    if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

    const systemPrompt = `You are Investprop's independent construction-progress verifier. You see site photos and you read the milestone description claimed by the development manager. Your job: judge whether the photos credibly support the claim.

Return ONLY JSON in this exact shape (no prose, no code fences):
{
  "verdict": "GREEN" | "AMBER" | "RED",
  "confidence": <0..1>,
  "narrative": "<80-150 words. Describe what you actually see in the photos in concrete terms (foundation poured, walls plastered, electrical first fix, roof tiles laid, etc.). Then say whether that matches the claimed milestone state and roughly how far ahead or behind it appears. Be specific about discrepancies.>",
  "flags": [
    { "category": "<safety | progress | quality | discrepancy | safety>", "description": "<1-sentence concrete issue>" }
  ]
}

Verdict rubric:
- GREEN: photos clearly show the claimed state; no concerns.
- AMBER: partial match — work has started but is meaningfully less advanced than claimed, OR quality/safety concerns.
- RED: photos contradict the claim, or photos are unverifiable (wrong site, stock images, dark, blurred), or major safety violations visible.

If the photos are too poor to judge, return RED with a flag explaining why.`;

    // Vision messages: array of { role: 'user', content: [{type:'text',...},{type:'image',image:url}] }
    const visionContent: ({ type: "text"; text: string } | { type: "image"; image: URL })[] = [
      {
        type: "text",
        text: `MILESTONE CLAIM:\n${input.expectedState}\n\nPlease analyse the ${input.photoUrls.length} site photo${input.photoUrls.length === 1 ? "" : "s"} that follow and return the JSON object now.`,
      },
      ...input.photoUrls.map((url) => ({ type: "image" as const, image: new URL(url) })),
    ];

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "photo-check",
      model: getModelId("vision"),
      metadata: { propertyId: input.propertyId, milestoneId: input.milestoneId, photoCount: input.photoUrls.length },
      run: () =>
        generateText({
          model: getModel("vision"),
          system: systemPrompt,
          messages: [{ role: "user", content: visionContent }],
        }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = normalise(safeParseJson(result.text));
    if (!parsed) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Vision model returned an unparseable verdict." });
    }

    const saved = await db.constructionPhotoCheck.create({
      data: {
        propertyId: input.propertyId,
        milestoneId: input.milestoneId,
        submissionId: input.submissionId,
        photoUrls: input.photoUrls,
        expectedState: input.expectedState,
        verdict: parsed.verdict,
        confidence: parsed.confidence,
        narrative: parsed.narrative,
        flags: parsed.flags,
      },
    });

    return {
      id: saved.id,
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      narrative: parsed.narrative,
      flags: parsed.flags,
      generatedAt: saved.generatedAt,
    };
  });

export const getPhotoChecks = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number(), milestoneId: z.number().optional() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.constructionPhotoCheck.findMany({
      where: { propertyId: input.propertyId, ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}) },
      orderBy: { generatedAt: "desc" },
      take: 20,
    });
  });
