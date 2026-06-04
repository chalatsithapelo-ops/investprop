import { Client } from "minio";
import { env } from "./env";

const minioProtocol = env.MINIO_USE_SSL ? "https" : "http";
export const minioBaseUrl = `${minioProtocol}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY ?? env.ADMIN_PASSWORD,
});

// Public-facing client for presigned URLs / publicUrl construction.
// Falls back to internal client/url when MINIO_PUBLIC_HOST is not set.
const hasPublicHost = !!env.MINIO_PUBLIC_HOST;
const publicProtocol =
  (env.MINIO_PUBLIC_USE_SSL ?? env.MINIO_USE_SSL) ? "https" : "http";
const publicHost = env.MINIO_PUBLIC_HOST ?? env.MINIO_ENDPOINT;
const publicPort =
  env.MINIO_PUBLIC_PORT ??
  ((env.MINIO_PUBLIC_USE_SSL ?? env.MINIO_USE_SSL) ? 443 : 80);

export const minioPublicBaseUrl = hasPublicHost
  ? `${publicProtocol}://${publicHost}${
      (publicProtocol === "https" && publicPort === 443) ||
      (publicProtocol === "http" && publicPort === 80)
        ? ""
        : `:${publicPort}`
    }`
  : minioBaseUrl;

export const minioPresignClient = hasPublicHost
  ? new Client({
      endPoint: publicHost,
      port: publicPort,
      useSSL: publicProtocol === "https",
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY ?? env.ADMIN_PASSWORD,
    })
  : minioClient;
