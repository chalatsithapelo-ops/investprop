/**
 * AI Property Office — document intelligence.
 *
 * Lets a member (or the voice/chat agent on their behalf) paste or dictate the
 * text of ANY property document — an offer to purchase, a lease, a levy / bond
 * statement, a mandate, an SPV resolution — and get a plain-language analysis:
 * a short summary, key clauses, a jargon glossary and genuine risk flags, with
 * an explicit "not legal/tax advice" disclaimer.
 *
 * It differs from `ai-doc-summary` (which only works on stored LegalDocument
 * rows the member already has evidence access to): here the member supplies the
 * text themselves, so there is nothing to grant access to — the only data used
 * is what they provided. The analysis is persisted as a COMPLETED OfficeTask so
 * it surfaces in the task inbox and can be exported as a PDF/CSV pack.
 */

import { Prisma, type User } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { z } from "zod";
import { db } from "~/server/db";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";
import { assertOfficeUser, taskDigest, APPROVAL_TTL_MS } from "./policy";

export const DOCUMENT_TASK_KIND = "DOCUMENT_ANALYSIS";
const MAX_CONTENT = 16000; // hard cap to bound cost
const DISCLAIMER =
  "Research output only. This is an automated plain-language reading of the text you provided — not legal, tax or financial advice. Confirm with an attorney or registered adviser before you sign or act.";

export const documentAnalysisInput = z.object({
  title: z.string().trim().min(1).max(160),
  // Free-form document kind label, e.g. "offer to purchase", "lease", "levy statement".
  kind: z.string().trim().min(1).max(60).optional(),
  text: z.string().trim().min(40).max(40000),
});
export type DocumentAnalysisInput = z.infer<typeof documentAnalysisInput>;

type Severity = "INFO" | "ATTENTION" | "WARNING";
type RiskLevel = "LOW" | "MODERATE" | "HIGH";

export interface DocumentAnalysis {
  summary: string;
  keyClauses: { clause: string; plainEnglish: string; severity: Severity }[];
  glossary: { term: string; definition: string }[];
  riskFlags: { category: string; severity: Severity; detail: string; recommendation: string }[];
  riskLevel: RiskLevel;
  disclaimer: string;
}

const SEVERITIES = new Set<Severity>(["INFO", "ATTENTION", "WARNING"]);
const RISK_LEVELS = new Set<RiskLevel>(["LOW", "MODERATE", "HIGH"]);
const sev = (v: unknown): Severity => (SEVERITIES.has(v as Severity) ? (v as Severity) : "INFO");
const str = (v: unknown): v is string => typeof v === "string";

function normalise(parsed: unknown): Omit<DocumentAnalysis, "disclaimer"> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (!str(p.summary)) return null;
  const keyClauses = Array.isArray(p.keyClauses)
    ? (p.keyClauses as Record<string, unknown>[])
        .filter((c) => c && str(c.clause) && str(c.plainEnglish))
        .slice(0, 8)
        .map((c) => ({ clause: c.clause as string, plainEnglish: c.plainEnglish as string, severity: sev(c.severity) }))
    : [];
  const glossary = Array.isArray(p.glossary)
    ? (p.glossary as Record<string, unknown>[])
        .filter((g) => g && str(g.term) && str(g.definition))
        .slice(0, 12)
        .map((g) => ({ term: g.term as string, definition: g.definition as string }))
    : [];
  const riskFlags = Array.isArray(p.riskFlags)
    ? (p.riskFlags as Record<string, unknown>[])
        .filter((r) => r && str(r.category) && str(r.detail))
        .slice(0, 10)
        .map((r) => ({
          category: r.category as string,
          severity: sev(r.severity),
          detail: r.detail as string,
          recommendation: str(r.recommendation) ? r.recommendation : "",
        }))
    : [];
  const riskLevel = RISK_LEVELS.has(p.riskLevel as RiskLevel) ? (p.riskLevel as RiskLevel) : "MODERATE";
  return { summary: p.summary, keyClauses, glossary, riskFlags, riskLevel };
}

const SYSTEM_PROMPT = `You are a plain-language property-document explainer for retail investors on a South African fractional-property platform.

The member has pasted the text of a document they received. Read ONLY that text and return ONLY a JSON object in this exact shape (no prose, no code fences):
{
  "summary": "<3-5 short bullets joined by newlines, each starting with '- '. ~80-150 words. What the document does, who it binds, key dates/amounts, and what the reader should do next.>",
  "keyClauses": [ { "clause": "<short label>", "plainEnglish": "<1-2 sentences, second person>", "severity": "INFO" | "ATTENTION" | "WARNING" } ],
  "glossary": [ { "term": "<jargon term>", "definition": "<1-sentence plain definition>" } ],
  "riskFlags": [ { "category": "<TITLE_RESTRICTION | BOND_ENCUMBRANCE | ARREARS | LEASE_ENCUMBRANCE | MISSING_COMPLIANCE_CERT | PENALTY_CLAUSE | AUTO_RENEWAL | LIABILITY_WAIVER | DEADLINE | FICA_FSCA_GAP | OTHER>", "severity": "INFO" | "ATTENTION" | "WARNING", "detail": "<what the risk is, quoting the figure/date if present>", "recommendation": "<imperative, short>" } ],
  "riskLevel": "LOW" | "MODERATE" | "HIGH"
}

Rules:
- Plain English, grade-9 reading level. Use 'you' / 'your'.
- South African context (Companies Act, FSCA, FICA, CPA, OTP, transfer duty, electrical/gas/beetle/plumbing CoCs, body-corporate levies, bond/rates arrears).
- Severity: WARNING = could cost the reader money or rights; ATTENTION = important deadline/condition; INFO = standard boilerplate.
- riskFlags: list ONLY genuine issues found in THIS text (0-10). Do NOT invent flags. Absent/unsigned/expired compliance certificates, outstanding bond/rates arrears, restrictive title conditions, penalty/auto-renewal clauses and broad liability waivers are the highest-value flags.
- riskLevel: HIGH if any WARNING flag exists; MODERATE if only ATTENTION flags; LOW if none.
- 3-8 keyClauses and 4-12 glossary entries. Skip terms a layperson already knows.
- NEVER give legal advice — describe, don't prescribe. If the text is not a document (e.g. empty or nonsense), return a summary that says so and empty arrays.`;

/**
 * Analyse member-supplied document text and persist the result as a COMPLETED
 * OfficeTask. Reuses the shared AI guard (rate-limit + usage logging) under the
 * existing `doc-summary` feature. The member's own id scopes everything.
 */
export async function analyzeOfficeDocument(
  user: Pick<User, "id" | "role" | "status">,
  input: DocumentAnalysisInput,
): Promise<DocumentAnalysis & { taskId: string }> {
  assertOfficeUser(user);
  const content = input.text.slice(0, MAX_CONTENT);

  const userPrompt = `DOCUMENT TYPE: ${input.kind ?? "unspecified"}
TITLE: ${input.title}

CONTENT:
${content}

Return the JSON object now.`;

  const result = await runAIWithGuard({
    userId: user.id,
    feature: "doc-summary",
    model: getModelId("cheap"),
    metadata: { surface: "office-document-intelligence", title: input.title },
    run: () => generateText({ model: getModel("cheap"), system: SYSTEM_PROMPT, prompt: userPrompt }),
    extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
  });

  const parsed = normalise(safeParseJson(result.text));
  if (!parsed) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned an unreadable analysis; try again." });
  }
  const analysis: DocumentAnalysis = { ...parsed, disclaimer: DISCLAIMER };

  const now = new Date();
  const parameters = { kind: input.kind ?? "unspecified", title: input.title, characters: content.length } as const;
  const resultJson = JSON.parse(JSON.stringify(analysis)) as Prisma.InputJsonValue;
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS);
  const created = await db.officeTask.create({
    data: {
      userId: user.id,
      title: input.title.slice(0, 160),
      kind: DOCUMENT_TASK_KIND,
      status: "COMPLETED",
      parameters: parameters as unknown as Prisma.InputJsonValue,
      result: resultJson,
      completedAt: now,
      expiresAt,
      // Digest over frozen content so the row is tamper-evident like other tasks.
      approvalDigest: taskDigest({
        id: "pending", title: input.title, userId: user.id, kind: DOCUMENT_TASK_KIND,
        parameters: parameters as unknown as Prisma.InputJsonValue, result: resultJson, expiresAt,
      }),
    },
    select: { id: true },
  });

  return { ...analysis, taskId: created.id };
}
