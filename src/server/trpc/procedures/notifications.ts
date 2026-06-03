import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "~/server/db";
import { protectedProcedure } from "../main";

export const createNotification = async (
  userId: number,
  title: string,
  message: string,
  type: "INFO" | "SUCCESS" | "WARNING" | "ERROR",
  category: "INVESTMENT" | "PROPERTY" | "MILESTONE" | "SYSTEM",
  relatedId: number | null = null
) => {
  try {
    await db.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        category,
        relatedId,
      },
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
};

export const getNotifications = protectedProcedure
  .input(
    z.object({
      unreadOnly: z.boolean().default(false),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(50).default(20),
    })
  )
  .query(async ({ input, ctx }) => {
    const where: any = { userId: ctx.user.id };
    if (input.unreadOnly) {
      where.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      db.notification.count({ where }),
      db.notification.count({
        where: { userId: ctx.user.id, read: false },
      }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  });

export const markNotificationAsRead = protectedProcedure
  .input(z.object({ notificationId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const notification = await db.notification.findUnique({
      where: { id: input.notificationId },
    });

    if (!notification || notification.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Notification not found",
      });
    }

    await db.notification.update({
      where: { id: input.notificationId },
      data: { read: true },
    });

    return { success: true };
  });

export const markAllNotificationsAsRead = protectedProcedure
  .mutation(async ({ ctx }) => {
    await db.notification.updateMany({
      where: {
        userId: ctx.user.id,
        read: false,
      },
      data: {
        read: true,
      },
    });

    return { success: true };
  });

export const deleteNotification = protectedProcedure
  .input(z.object({ notificationId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const notification = await db.notification.findUnique({
      where: { id: input.notificationId },
    });

    if (!notification || notification.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Notification not found",
      });
    }

    await db.notification.delete({
      where: { id: input.notificationId },
    });

    return { success: true };
  });
