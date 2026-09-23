import { z } from "zod";
import { db } from "~/server/db";
import { env } from "~/server/env";
import { publicProcedure, protectedProcedure } from "../main";

// Expose the VAPID public key so browsers can create a PushSubscription.
export const getVapidPublicKey = publicProcedure.query(() => {
  return { publicKey: env.VAPID_PUBLIC_KEY };
});

// Web Push: store (or refresh) a browser subscription for the current user.
export const savePushSubscription = protectedProcedure
  .input(
    z.object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }),
      userAgent: z.string().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: ctx.user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent,
      },
      update: {
        userId: ctx.user.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent,
      },
    });
    return { success: true };
  });

// Web Push: remove a browser subscription (on logout / unsubscribe).
export const deletePushSubscription = protectedProcedure
  .input(z.object({ endpoint: z.string() }))
  .mutation(async ({ input, ctx }) => {
    await db.pushSubscription
      .deleteMany({ where: { endpoint: input.endpoint, userId: ctx.user.id } })
      .catch(() => undefined);
    return { success: true };
  });

// Mobile Push (FCM): register (or refresh) a device token for the current user.
export const registerDeviceToken = protectedProcedure
  .input(
    z.object({
      token: z.string().min(1),
      platform: z.enum(["android", "ios", "web"]).default("android"),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await db.deviceToken.upsert({
      where: { token: input.token },
      create: {
        userId: ctx.user.id,
        token: input.token,
        platform: input.platform,
      },
      update: {
        userId: ctx.user.id,
        platform: input.platform,
      },
    });
    return { success: true };
  });

// Mobile Push (FCM): unregister a device token (on logout).
export const unregisterDeviceToken = protectedProcedure
  .input(z.object({ token: z.string() }))
  .mutation(async ({ input, ctx }) => {
    await db.deviceToken
      .deleteMany({ where: { token: input.token, userId: ctx.user.id } })
      .catch(() => undefined);
    return { success: true };
  });
