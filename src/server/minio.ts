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
