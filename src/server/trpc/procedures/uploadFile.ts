import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { minioClient, minioBaseUrl } from "~/server/minio";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { env } from "~/server/env";
import * as fs from "fs";
import * as path from "path";

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
    await getAuthenticatedUser(input.authToken);

    // Build a unique object name
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const ext = input.fileName.includes(".")
      ? input.fileName.split(".").pop()!
      : "jpg";
    const objectName = `${timestamp}-${randomString}.${ext}`;

    // Decode the base64 content
    const buffer = Buffer.from(input.fileBase64, "base64");

    const bucketName = env.MINIO_BUCKET_NAME;

    // Try MinIO first, fall back to local filesystem
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
