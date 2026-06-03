import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { minioClient, minioBaseUrl } from "~/server/minio";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { checkRateLimit, RATE_LIMITS } from "~/server/utils/rate-limiter";
import { env } from "~/server/env";
import * as fs from "fs";
import * as path from "path";

/** Whitelisted MIME types. KYC docs, property pics, contracts. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

/** Map allowed MIME → permitted extensions (lower-case, no dot). */
const MIME_TO_EXT: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Server-side file upload mutation.
 *
 * The client sends the file as a base64-encoded string and the server
 * uploads it to MinIO directly.  This avoids all browser CORS issues
 * that occur when the client tries to PUT to the MinIO presigned URL.
 *
 * Falls back to local filesystem storage if MinIO is unavailable.
 */
export const uploadFile = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      fileName: z.string(),
      fileType: z.string(),
      /** base64-encoded file content (no data-URI prefix) */
      fileBase64: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // Rate limit per user
    const rl = checkRateLimit(`upload:${user.id}`, RATE_LIMITS.FILE_UPLOAD);
    if (!rl.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Upload rate limit exceeded. Try again in ${rl.retryAfter ?? 60}s.`,
      });
    }

    // Validate MIME type
    const mime = (input.fileType || "").toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `File type "${mime || "unknown"}" is not allowed. Permitted: images, PDF, Word, Excel.`,
      });
    }

    // Decode the base64 content
    const buffer = Buffer.from(input.fileBase64, "base64");

    // Validate size
    if (buffer.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Empty file" });
    }
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `File too large (${(buffer.length / 1024 / 1024).toFixed(2)} MB). Max 5 MB.`,
      });
    }

    // Build a unique object name
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const rawExt = input.fileName.includes(".")
      ? input.fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
      : "";
    const allowedExts = MIME_TO_EXT[mime] ?? [];
    if (!rawExt || !allowedExts.includes(rawExt)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `File extension ".${rawExt || "?"}" does not match content type ${mime}. Expected one of: ${allowedExts.join(", ")}.`,
      });
    }
    const ext = rawExt;
    const objectName = `${timestamp}-${randomString}.${ext}`;

    const bucketName = env.MINIO_BUCKET_NAME;
    try {
      // Ensure the bucket exists
      const bucketExists = await minioClient.bucketExists(bucketName);
      if (!bucketExists) {
        await minioClient.makeBucket(bucketName, "us-east-1");
      }

      // Always ensure the bucket has a public-read policy so images are
      // viewable in the browser (idempotent – safe to call every time).
      const publicPolicy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      });
      await minioClient.setBucketPolicy(bucketName, publicPolicy);

      // Upload to MinIO
      await minioClient.putObject(bucketName, objectName, buffer, buffer.length, {
        "Content-Type": input.fileType || "application/octet-stream",
      });

      const publicUrl = `${minioBaseUrl}/${bucketName}/${objectName}`;
      return { publicUrl, objectName };
    } catch (minioError) {
      console.warn("MinIO upload failed, falling back to local filesystem:", minioError);
    }

    // ─── Local filesystem fallback ───
    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads", bucketName);
      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, objectName), buffer);

      const publicUrl = `/uploads/${bucketName}/${objectName}`;
      return { publicUrl, objectName };
    } catch (fsError) {
      console.error("Local filesystem upload also failed:", fsError);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "File upload failed. MinIO is not available and local filesystem fallback also failed.",
      });
    }
  });
