import jwt from "jsonwebtoken";
import { env } from "~/server/env";

/**
 * JWT payload for access tokens
 */
export type AccessTokenPayload = {
  userId: number;
  type: "access";
};

/**
 * JWT payload for refresh tokens
 */
export type RefreshTokenPayload = {
  userId: number;
  type: "refresh";
  tokenVersion: number; // For token invalidation
};

type UserLike = { id: number };

function getUserId(userOrId: number | UserLike): number {
  return typeof userOrId === "number" ? userOrId : userOrId.id;
}

/**
 * Generate an access token (short-lived: 15 minutes)
 */
export function generateAccessToken(userId: number): string {
  const payload: AccessTokenPayload = {
    userId: getUserId(userId),
    type: "access",
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "24h", // 24 hours
  });
}

/**
 * Generate a refresh token (long-lived: 7 days)
 */
export function generateRefreshToken(
  userId: number | UserLike,
  tokenVersion: number = 0
): { token: string; expiresAt: Date } {
  const payload: RefreshTokenPayload = {
    userId: getUserId(userId),
    type: "refresh",
    tokenVersion,
  };

  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: "7d", // 7 days
  });

  // Keep DB expiry in sync with JWT expiry.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return { token, expiresAt };
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    if (decoded?.type !== "access") return null;
    if (typeof decoded.userId !== "number") return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    if (decoded?.type !== "refresh") return null;
    if (typeof decoded.userId !== "number") return null;
    if (typeof decoded.tokenVersion !== "number") return null;
    return decoded;
  } catch {
    return null;
  }
}
