import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { experimental_generateImage as generateImage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { minioClient, minioPublicBaseUrl } from "~/server/minio";
import { baseProcedure } from "~/server/trpc/main";
import { env } from "~/server/env";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const generatePropertyImage = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      title: z.string(),
      description: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication
    await getAuthenticatedUser(input.authToken);

    // Image generation goes through OpenAI's image API (DALL·E 3). The
    // OpenRouter provider does not expose the AI SDK image interface, so a
    // dedicated OPENAI_API_KEY is required.
    if (!env.OPENAI_API_KEY) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "AI image generation is not configured (OPENAI_API_KEY missing). Please upload an image manually.",
      });
    }

    try {
      const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

      // Generate image using AI
      const prompt = `A professional, high-quality real estate photograph of: ${input.title}. ${input.description}. The image should be photorealistic, well-lit, and suitable for a property listing.`;

      const { image } = await generateImage({
        model: openai.image("dall-e-3"),
        prompt,
        size: "1024x1024",
      });

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(image.base64, "base64");

      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const objectName = `ai-generated-${timestamp}-${randomString}.png`;

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
            "AI image generation succeeded, but uploads are not configured correctly (MinIO). Verify MINIO_ACCESS_KEY/MINIO_SECRET_KEY.",
        });
      }

      // Upload to MinIO
      await minioClient.putObject(
        bucketName,
        objectName,
        imageBuffer,
        imageBuffer.length,
        {
          "Content-Type": "image/png",
        }
      );

      // Construct public URL
      const publicUrl = `${minioPublicBaseUrl}/${bucketName}/${objectName}`;

      return {
        imageUrl: publicUrl,
        objectName,
      };
    } catch (error) {
      console.error("Error generating property image:", error);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate image. Please upload an image manually.",
      });
    }
  });
