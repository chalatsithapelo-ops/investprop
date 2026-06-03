import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "~/server/db";
import { protectedProcedure } from "../main";

export const createAuditLog = async (
  userId: number | null,
  action: string,
  entity: string,
  entityId: number | null,
  changes: any = null,
  ipAddress: string | null = null,
  userAgent: string | null = null
) => {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        changes,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
    // Don't throw error - audit logging should not break main functionality
  }
};

export const getAuditLogs = protectedProcedure
  .input(
    z.object({
      entity: z.string().optional(),
      entityId: z.number().optional(),
      userId: z.number().optional(),
      action: z.string().optional(),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
    })
  )
  .query(async ({ input, ctx }) => {
    // Only admins can view audit logs
    if (ctx.user.role !== "ADMIN" && ctx.user.role !== "DEVELOPMENT_MANAGER") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only administrators can view audit logs",
      });
    }

    const where: any = {};
    if (input.entity) where.entity = input.entity;
    if (input.entityId) where.entityId = input.entityId;
    if (input.userId) where.userId = input.userId;
    if (input.action) where.action = input.action;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      db.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  });
