import { createHash } from "node:crypto";
import { Prisma, type OfficeTaxSource } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "~/server/db";
import { assertOfficeUser, canonicalJson, canonicalSourceUrl, assertDigest, type OfficeUser } from "./policy";

export const taxSourceDraftSchema = z.object({
  title: z.string().trim().min(1).max(200), url: z.string().url().max(2000),
  authority: z.enum(["SARS", "GOV_ZA", "SAFLII"]),
  effectiveFrom: z.string().datetime({ offset: true }), effectiveTo: z.string().datetime({ offset: true }).optional(),
  applicability: z.string().trim().min(1).max(2000), content: z.string().trim().min(1).max(20000),
  previousSourceId: z.string().min(1).max(128).optional(),
}).strict();

function admin(user: OfficeUser) {
  assertOfficeUser(user);
  if (user.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN", message: "Only ADMIN can curate reviewed tax sources" });
}
export function sourceReviewDigest(source: OfficeTaxSource) {
  return createHash("sha256").update(canonicalJson({ id: source.id, version: source.version, title: source.title,
    url: source.url, authority: source.authority, effectiveFrom: source.effectiveFrom.toISOString(),
    effectiveTo: source.effectiveTo?.toISOString() ?? null, applicability: source.applicability,
    content: source.content, contentHash: source.contentHash })).digest("hex");
}

export async function createOfficeTaxSource(user: OfficeUser, value: z.infer<typeof taxSourceDraftSchema>) {
  admin(user);
  const input = taxSourceDraftSchema.parse(value);
  const url = canonicalSourceUrl(input.url);
  const host = new URL(url).hostname.replace(/^www\./, "");
  const authority = host === "sars.gov.za" ? "SARS" : host === "gov.za" ? "GOV_ZA" : "SAFLII";
  if (input.authority !== authority) throw new TRPCError({ code: "BAD_REQUEST", message: "Authority must match the canonical source host" });
  const effectiveFrom = new Date(input.effectiveFrom), effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  if (effectiveTo && effectiveTo <= effectiveFrom) throw new TRPCError({ code: "BAD_REQUEST", message: "effectiveTo must be after effectiveFrom (exclusive)" });
  return db.$transaction(async (tx) => {
    const previous = await tx.officeTaxSource.findFirst({ where: { url }, orderBy: [{ version: "desc" }, { id: "desc" }] });
    if (previous ? input.previousSourceId !== previous.id : input.previousSourceId !== undefined) {
      throw new TRPCError({ code: "CONFLICT", message: "Supply the latest source ID to create a new immutable draft version" });
    }
    const source = await tx.officeTaxSource.create({ data: { title: input.title, url, authority, effectiveFrom, effectiveTo,
      applicability: input.applicability, content: input.content, contentHash: createHash("sha256").update(input.content).digest("hex"),
      version: (previous?.version ?? 0) + 1, status: "DRAFT", reviewedAt: null } });
    return { ...source, reviewDigest: sourceReviewDigest(source) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Explicit human review of the exact immutable draft; models cannot publish. */
export async function publishOfficeTaxSource(user: OfficeUser, input: { sourceId: string; version: number; reviewDigest: string; reviewedPublishAttestation: true }, now = new Date()) {
  admin(user);
  if (input.reviewedPublishAttestation !== true) throw new TRPCError({ code: "BAD_REQUEST", message: "Explicit human-reviewed publish attestation is required" });
  return db.$transaction(async (tx) => {
    const source = await tx.officeTaxSource.findFirst({ where: { id: input.sourceId, status: "DRAFT", version: input.version } });
    if (!source) throw new TRPCError({ code: "CONFLICT", message: "Draft version is missing or already published" });
    assertDigest(sourceReviewDigest(source), input.reviewDigest);
    assertDigest(createHash("sha256").update(source.content).digest("hex"), source.contentHash);
    canonicalSourceUrl(source.url);
    // Same canonical source must not have ambiguous overlapping approved versions.
    const overlap = await tx.officeTaxSource.findFirst({ where: { url: source.url, status: "APPROVED",
      ...(source.effectiveTo ? { effectiveFrom: { lt: source.effectiveTo } } : {}),
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: source.effectiveFrom } }] }, select: { id: true } });
    if (overlap) throw new TRPCError({ code: "CONFLICT", message: "Approved source versions must have non-overlapping effective intervals" });
    const changed = await tx.officeTaxSource.updateMany({ where: { id: source.id, status: "DRAFT", version: source.version, contentHash: source.contentHash, updatedAt: source.updatedAt },
      data: { status: "APPROVED", reviewedAt: now } });
    if (changed.count !== 1) throw new TRPCError({ code: "CONFLICT", message: "Draft changed concurrently; review again" });
    return tx.officeTaxSource.findFirstOrThrow({ where: { id: source.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}