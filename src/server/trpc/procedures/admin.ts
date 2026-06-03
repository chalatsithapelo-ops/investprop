import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "~/server/db";
import { protectedProcedure } from "../main";
import { userEmailSchema, userNameSchema, userRoleSchema } from "~/server/utils/validation-schemas";
import bcryptjs from "bcryptjs";
import { createAuditLog } from "./audit-log";

// Admin procedures require DEVELOPMENT_MANAGER role
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "DEVELOPMENT_MANAGER") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const getAllUsers = adminProcedure
  .input(
    z.object({
      role: z.enum(["INVESTOR", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "CONTRACTOR", "ALL"]).default("ALL"),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
      search: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    const where: any = {};

    if (input.role !== "ALL") {
      where.role = input.role;
    }

    if (input.search) {
      where.OR = [
        { name: { contains: input.search, mode: "insensitive" } },
        { email: { contains: input.search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              properties: true,
              investorContributions: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      db.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  });

export const getUserById = adminProcedure
  .input(z.object({ userId: z.number() }))
  .query(async ({ input }) => {
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        investorPreferences: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            properties: true,
            investorContributions: true,
            refreshTokens: true,
          },
        },
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return user;
  });

export const updateUser = adminProcedure
  .input(
    z.object({
      userId: z.number(),
      name: userNameSchema.optional(),
      email: userEmailSchema.optional(),
      role: userRoleSchema.optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const existingUser = await db.user.findUnique({
      where: { id: input.userId },
    });

    if (!existingUser) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Check if email is already taken by another user
    if (input.email && input.email !== existingUser.email) {
      const emailExists = await db.user.findUnique({
        where: { email: input.email },
      });

      if (emailExists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email is already in use",
        });
      }
    }

    const updatedUser = await db.user.update({
      where: { id: input.userId },
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    // Create audit log
    await createAuditLog(
      ctx.user.id,
      "UPDATE",
      "User",
      input.userId,
      {
        before: {
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
        },
        after: {
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
        },
      }
    );

    return updatedUser;
  });

export const deleteUser = adminProcedure
  .input(z.object({ userId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const user = await db.user.findUnique({
      where: { id: input.userId },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Prevent self-deletion
    if (user.id === ctx.user.id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You cannot delete your own account",
      });
    }

    await db.user.delete({
      where: { id: input.userId },
    });

    // Create audit log
    await createAuditLog(
      ctx.user.id,
      "DELETE",
      "User",
      input.userId,
      { deletedUser: { email: user.email, name: user.name, role: user.role } }
    );

    return { success: true, message: "User deleted successfully" };
  });

export const resetUserPassword = adminProcedure
  .input(
    z.object({
      userId: z.number(),
      newPassword: z.string().min(8),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const user = await db.user.findUnique({
      where: { id: input.userId },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const hashedPassword = await bcryptjs.hash(input.newPassword, 10);

    await db.$transaction([
      db.user.update({
        where: { id: input.userId },
        data: { password: hashedPassword },
      }),
      // Revoke all refresh tokens
      db.refreshToken.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Create audit log
    await createAuditLog(
      ctx.user.id,
      "PASSWORD_RESET",
      "User",
      input.userId,
      { adminReset: true }
    );

    return { success: true, message: "Password reset successfully" };
  });

export const getSystemStats = adminProcedure
  .query(async () => {
    const [
      totalUsers,
      totalProperties,
      totalInvestments,
      totalInvested,
      recentUsers,
      recentProperties,
    ] = await Promise.all([
      db.user.count(),
      db.property.count(),
      db.investorContribution.count(),
      db.investorContribution.aggregate({
        _sum: { contributionAmount: true },
      }),
      db.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      db.property.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
    ]);

    return {
      totalUsers,
      totalProperties,
      totalInvestments,
      totalInvested: totalInvested._sum.contributionAmount || 0,
      recentUsers,
      recentProperties,
    };
  });
