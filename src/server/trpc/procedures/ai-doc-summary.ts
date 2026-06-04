/**
 * AI Strategy 1.3 — Plain-Language Document Summariser
 *
 * Auto-generates: 3-bullet summary, key clauses with severity, jargon glossary
 * for any LegalDocument. Cached on the row itself so repeat views are free.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";

interface AISummaryShape {
  summary: string;
  keyClauses: { clause: string; plainEnglish: string; severity: "INFO" | "ATTENTION" | "WARNING" }[];
  glossary: { term: string; definition: string }[];
}

const ALLOWED_SEVERITIES = new Set(["INFO", "ATTENTION", "WARNING"]);

function normalise(parsed: unknown): AISummaryShape | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<AISummaryShape>;
  if (typeof p.summary !== "string") return null;
  const keyClauses = Array.isArray(p.keyClauses)
    ? p.keyClauses
        .filter((c): c is AISummaryShape["keyClauses"][number] =>
          !!c && typeof (c as { clause: unknown }).clause === "string" && typeof (c as { plainEnglish: unknown }).plainEnglish === "string"
        )
        .slice(0, 8)
        .map((c) => ({
          clause: c.clause,
          plainEnglish: c.plainEnglish,
          severity: ALLOWED_SEVERITIES.has(c.severity) ? c.severity : "INFO",
        }))
    : [];
  const glossary = Array.isArray(p.glossary)
    ? p.glossary
        .filter((g): g is AISummaryShape["glossary"][number] =>
          !!g && typeof (g as { term: unknown }).term === "string" && typeof (g as { definition: unknown }).definition === "string"
        )
        .slice(0, 12)
    : [];
  return { summary: p.summary, keyClauses, glossary };
}

async function summariseInternal(
  userId: number,
  documentId: number,
  force = false
): Promise<{ summary: string; keyClauses: AISummaryShape["keyClauses"]; glossary: AISummaryShape["glossary"]; generatedAt: Date }> {
  const doc = await db.legalDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      documentType: true,
      content: true,
      aiSummary: true,
      aiKeyClauses: true,
      aiGlossary: true,
      aiSummarisedAt: true,
    },
  });
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });

  if (!force && doc.aiSummary && doc.aiSummarisedAt) {
    return {
      summary: doc.aiSummary,
      keyClauses: (doc.aiKeyClauses as AISummaryShape["keyClauses"]) ?? [],
      glossary: (doc.aiGlossary as AISummaryShape["glossary"]) ?? [],
      generatedAt: doc.aiSummarisedAt,
    };
  }

  const content = (doc.content ?? "").slice(0, 16000); // hard cap to control cost
  if (!content.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Document is empty" });
  }

  const systemPrompt = `You are a plain-language legal explainer for retail investors on a South African fractional-property platform.

For the document below, return ONLY a JSON object in this exact shape (no prose, no code fences):
{
  "summary": "<3-5 short bullet points joined by newlines, each starting with '- '. ~80-150 words total. Explain what this document does, who it binds, key dates/amounts, and what action the reader should take.>",
  "keyClauses": [
    { "clause": "<short label, e.g. 'Cooling-off period'>", "plainEnglish": "<1-2 sentences in plain English, second person>", "severity": "INFO" | "ATTENTION" | "WARNING" }
  ],
  "glossary": [
    { "term": "<jargon term>", "definition": "<1-sentence plain definition>" }
  ]
}

Rules:
- Plain English, grade-9 reading level. Use 'you' / 'your'.
- South African legal context (Companies Act, FSCA, FICA, CPA, Sec 96 prospectus, OTP, transfer duty).
- Severity rubric: WARNING = clause that could cost the investor money or rights; ATTENTION = important deadline or condition; INFO = standard boilerplate.
- Include 3-8 keyClauses and 4-12 glossary entries. Skip terms a layperson already knows.
- NEVER give legal advice — describe, don't prescribe. End anything advice-ish with "Confirm with an attorney before signing."`;

  const userPrompt = `DOCUMENT TYPE: ${doc.documentType}
TITLE: ${doc.title}

CONTENT:
${content}

Return the JSON object now.`;

  const result = await runAIWithGuard({
    userId,
    feature: "doc-summary",
    model: getModelId("cheap"),
    metadata: { documentId },
    run: () => generateText({ model: getModel("cheap"), system: systemPrompt, prompt: userPrompt }),
    extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
  });

  const parsed = normalise(safeParseJson(result.text));
  if (!parsed) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned an unparseable summary." });
  }

  const now = new Date();
  await db.legalDocument.update({
    where: { id: documentId },
    data: {
      aiSummary: parsed.summary,
      aiKeyClauses: parsed.keyClauses,
      aiGlossary: parsed.glossary,
      aiSummarisedAt: now,
    },
  });

  return { ...parsed, generatedAt: now };
}

export const summariseLegalDocument = baseProcedure
  .input(z.object({ authToken: z.string(), documentId: z.number(), force: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    return summariseInternal(user.id, input.documentId, input.force ?? false);
  });

export const getLegalDocumentSummary = baseProcedure
  .input(z.object({ authToken: z.string(), documentId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const doc = await db.legalDocument.findUnique({
      where: { id: input.documentId },
      select: { aiSummary: true, aiKeyClauses: true, aiGlossary: true, aiSummarisedAt: true },
    });
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
    if (!doc.aiSummary) return null;
    return {
      summary: doc.aiSummary,
      keyClauses: (doc.aiKeyClauses as AISummaryShape["keyClauses"]) ?? [],
      glossary: (doc.aiGlossary as AISummaryShape["glossary"]) ?? [],
      generatedAt: doc.aiSummarisedAt,
    };
  });
