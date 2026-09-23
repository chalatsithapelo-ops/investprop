import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  BASE_URL: z.string().optional(),
  BASE_URL_OTHER_PORT: z.string().optional(),
  DATABASE_URL: z.string().url("Invalid DATABASE_URL"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required").default("admin"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters for security"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters for security"),
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().default("admin"),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_USE_SSL: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
  MINIO_BUCKET_NAME: z.string().default("property-images"),
  // Publicly-reachable host for presigned URLs and publicUrl (browser-facing).
  // When set, the server-side minio client still talks to MINIO_ENDPOINT internally,
  // but presigned URLs and stored publicUrls use this host. Must NOT include a path.
  // Example: "investprop.io" with MINIO_PUBLIC_USE_SSL=true.
  MINIO_PUBLIC_HOST: z.string().optional(),
  MINIO_PUBLIC_PORT: z.coerce.number().int().positive().optional(),
  MINIO_PUBLIC_USE_SSL: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  EMAIL_SERVICE_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  // Web Push (VAPID). Defaults are a generated dev key pair so browser push works
  // out of the box; override in production via env for key rotation.
  VAPID_PUBLIC_KEY: z
    .string()
    .default("BG7yJVB7iWD0iM4RwU1h9L0ZcAa9yysmfdwi2yT08TmU4sODmFXwvpIMF_QpMwVyfwmSIIi6vrAKmQTJR_amTvw"),
  VAPID_PRIVATE_KEY: z.string().default("F5UiceTxtCwqHj2k93cL2mJNDflLQTupWj7g6940I38"),
  VAPID_SUBJECT: z.string().default("mailto:support@investprop.io"),
  // Firebase Cloud Messaging (mobile push) — service account for HTTP v1 API.
  // Leave unset until a Firebase project is created; push simply no-ops until then.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  // Payment gateway (Paystack)
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  // Distressed scraper credentials (login-required sources)
  SHERIFFHQ_EMAIL: z.string().optional(),
  SHERIFFHQ_PASSWORD: z.string().optional(),
  SHERIFFHQ_COOKIES: z.string().optional(),
  SASHERIFF_EMAIL: z.string().optional(),
  SASHERIFF_PASSWORD: z.string().optional(),
  SASHERIFF_COOKIES: z.string().optional(),
});

export const env = envSchema.parse(process.env);
