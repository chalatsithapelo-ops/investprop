import { TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db } from "~/server/db";
import { verifyAccessToken } from "~/server/utils/tokens";
import type { User } from "@prisma/client";

/**
 * Context available to all tRPC procedures
 */
export type Context = {
  db: typeof db;
  user: User | null;
  req: Request;
};

/**
 * Creates context for tRPC requests
 * Automatically extracts and verifies auth token from Authorization header
 */
export async function createContext(opts: FetchCreateContextFnOptions): Promise<Context> {
  const { req } = opts;

  let user: User | null = null;

  // Extract token from Authorization header
  const authHeader = req.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);

    try {
      const payload = verifyAccessToken(token);

      if (!payload) {
        throw new Error("Invalid or expired access token");
      }

      // Fetch user from database
      user = await db.user.findUnique({
        where: { id: payload.userId },
      });
    } catch (error) {
      // Token invalid or expired - user remains null
      // Procedures can check if authentication is required
    }
  }

  return {
    db,
    user,
    req,
  };
}
