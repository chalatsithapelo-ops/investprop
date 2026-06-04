import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { experimental_generateImage as generateImage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
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

    // Check if OpenRouter API key is available
    if (!env.OPENROUTER_API_KEY) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "AI image generation is not configured. Please upload an image manually.",
      });
    }

    try {
      // Create OpenRouter provider
      const openrouter = createOpenRouter({
        apiKey: env.OPENROUTER_API_KEY,
      });

      // Generate image using AI
      const prompt = `A professional, high-quality real estate photograph of: ${input.title}. ${input.description}. The image should be photorealistic, well-lit, and suitable for a property listing.`;

      // The OpenRouter provider's image API surface differs between SDK
      // versions — cast through `any` to keep the call resilient until the
      // provider's typings stabilise.
      const imageModel = (openrouter as unknown as { image: (id: string) => unknown }).image("openai/dall-e-3");

      const { image } = await generateImage({
        model: imageModel as Parameters<typeof generateImage>[0]["model"],
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
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate image. Please upload an image manually.",
      });
    }
  });
