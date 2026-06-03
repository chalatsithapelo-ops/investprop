import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "~/server/db";
import { env } from "~/server/env";
import type { UserRole } from "@prisma/client";

/**
 * Type for the decoded JWT payload
 */
type JWTPayload = {
  userId: number;
};

/**
 * Verifies an authentication token and returns the user ID.
 * Throws UNAUTHORIZED error if token is invalid or expired.
 *
 * @param authToken - The JWT token to verify
 * @returns The user ID from the token
 * @throws TRPCError with code UNAUTHORIZED if token is invalid
 */
export function verifyAuthToken(authToken: string): number {
  try {
    const verified = jwt.verify(authToken, env.JWT_SECRET);
    const parsed = z.object({ userId: z.number() }).parse(verified);
    return parsed.userId;
  } catch (error) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired token",
    });
  }
}

/**
 * Verifies authentication token and fetches the user from the database.
 * Throws UNAUTHORIZED error if token is invalid or user not found.
 *
 * @param authToken - The JWT token to verify
 * @returns The authenticated user
 * @throws TRPCError with code UNAUTHORIZED if token is invalid or user not found
 */
export async function getAuthenticatedUser(authToken: string) {
  const userId = verifyAuthToken(authToken);

  const user = await db.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not found",
    });
  }

  return user;
}

/**
 * Verifies that a user has one of the required roles.
 * Throws FORBIDDEN error if user doesn't have required role.
 *
 * @param user - The user to check
 * @param allowedRoles - Array of roles that are allowed
 * @param errorMessage - Optional custom error message
 * @throws TRPCError with code FORBIDDEN if user doesn't have required role
 */
export function requireRole(
  user: { role: UserRole },
  allowedRoles: UserRole[],
  errorMessage?: string
): void {
  // ADMIN is a super-role that bypasses every role check.
  if (user.role === "ADMIN") return;
  if (!allowedRoles.includes(user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: errorMessage || `This action requires one of the following roles: ${allowedRoles.join(", ")}`,
    });
  }
}

/**
 * Convenience function that combines authentication and role checking.
 * Returns the authenticated user if they have one of the required roles.
 *
 * @param authToken - The JWT token to verify
 * @param allowedRoles - Array of roles that are allowed
 * @param errorMessage - Optional custom error message for role check
 * @returns The authenticated user
 * @throws TRPCError with code UNAUTHORIZED or FORBIDDEN
 */
export async function requireAuthenticatedUser(
  authToken: string,
  allowedRoles?: UserRole[],
  errorMessage?: string
) {
  const user = await getAuthenticatedUser(authToken);

  if (allowedRoles) {
    requireRole(user, allowedRoles, errorMessage);
  }

  return user;
}
