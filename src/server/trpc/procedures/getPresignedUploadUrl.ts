import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { minioClient, minioBaseUrl } from "~/server/minio";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { env } from "~/server/env";

export const getPresignedUploadUrl = baseProcedure
  .input(
    z.union([
      z.object({
        authToken: z.string(),
        fileName: z.string(),
        fileType: z.string(),
      }),
      z.object({
        authToken: z.string(),
        filename: z.string(),
        contentType: z.string(),
      }),
    ])
  )
  .query(async ({ input }) => {
    // Verify authentication
    await getAuthenticatedUser(input.authToken);

    const fileName = "fileName" in input ? input.fileName : input.filename;
    const fileType = "fileType" in input ? input.fileType : input.contentType;

    const bucketName = env.MINIO_BUCKET_NAME;

    try {
      const bucketExists = await minioClient.bucketExists(bucketName);
      if (!bucketExists) {
        await minioClient.makeBucket(bucketName, "us-east-1");
      }
    } catch (error) {
      console.error("MinIO bucket check/create failed:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "File uploads are not configured correctly (MinIO). Verify MINIO_ACCESS_KEY/MINIO_SECRET_KEY match your MinIO instance.",
      });
    }

    // Generate a unique filename to avoid collisions
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = fileName.split(".").pop() || "jpg";
    const objectName = `${timestamp}-${randomString}.${fileExtension}`;

    // Generate presigned URL for PUT operation (expires in 5 minutes)
    let presignedUrl: string;
    try {
      presignedUrl = await minioClient.presignedPutObject(
        bucketName,
        objectName,
        5 * 60 // 5 minutes
      );
    } catch (error) {
      console.error("MinIO presignedPutObject failed:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Failed to generate an upload URL (MinIO). This is usually caused by incorrect MINIO credentials.",
      });
    }

    // Construct the final public URL
    const publicUrl = `${minioBaseUrl}/${bucketName}/${objectName}`;

    return {
      presignedUrl,
      publicUrl,
      objectName,

      // Backwards-compatible aliases used by older components
      url: presignedUrl,
      key: objectName,
    };
  });
