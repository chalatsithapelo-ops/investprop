/**
 * AI prediction register.
 *
 * Best-effort logging of each material AI prediction (underwriting grade,
 * distress score, seller valuation, match score) so outcomes can be compared
 * against predictions later for calibration. Recording never throws — a logging
 * failure must never break the prediction it is tracking.
 */
import { db } from "~/server/db";

export type AiPredictionKind =
  | "UNDERWRITING_GRADE"
  | "DISTRESS_SCORE"
  | "SELLER_VALUATION"
  | "MATCH_SCORE";

export type AiPredictionSubject = "Property" | "OwnerSaleProposal" | "DistressedListing";

export async function recordAiPrediction(input: {
  kind: AiPredictionKind;
  subjectType: AiPredictionSubject;
  subjectId: number;
  userId?: number | null;
  modelId?: string | null;
  confidence?: string | null;
  predicted: unknown;
}): Promise<void> {
  try {
    await db.aiPrediction.create({
      data: {
        kind: input.kind,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        userId: input.userId ?? null,
        modelId: input.modelId ?? null,
        confidence: input.confidence ?? null,
        predicted: (input.predicted ?? {}) as object,
      },
    });
  } catch (e) {
    console.error("[ai-prediction] failed to record prediction", e);
  }
}

/**
 * Resolve the most recent open prediction(s) for a subject with a real-world
 * outcome. Safe to call from outcome events (sale completed, listing sold, etc.).
 */
export async function resolveAiPrediction(
  kind: AiPredictionKind,
  subjectId: number,
  outcome: unknown,
): Promise<void> {
  try {
    await db.aiPrediction.updateMany({
      where: { kind, subjectId, resolved: false },
      data: { outcome: (outcome ?? {}) as object, outcomeAt: new Date(), resolved: true },
    });
  } catch (e) {
    console.error("[ai-prediction] failed to resolve prediction", e);
  }
}
