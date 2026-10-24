import crypto from "crypto";

/**
 * Constant-time string comparison for secrets/tokens.
 * Returns false on length mismatch without leaking timing. Safe against
 * the timing side-channel that plain `a === b` on secrets is vulnerable to.
 */
export function timingSafeEqualStr(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
