import webpush from "web-push";
import { GoogleAuth } from "google-auth-library";
import { env } from "~/server/env";
import { db } from "~/server/db";

// ── Web Push (VAPID) ─────────────────────────────────────────────────────────

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link path opened when the notification is clicked, e.g. "/dashboard". */
  url?: string;
  /** Groups/replaces notifications with the same tag. */
  tag?: string;
  data?: Record<string, unknown>;
}

async function sendWebPush(userId: number, payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;

  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        // 404/410 mean the subscription is dead — remove it.
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined);
        } else {
          console.error("Web push failed:", statusCode ?? error);
        }
      }
    })
  );
}

// ── Firebase Cloud Messaging (HTTP v1) ───────────────────────────────────────

let cachedAuth: GoogleAuth | null = null;

function getFcmAuth(): GoogleAuth | null {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return null;
  }
  if (!cachedAuth) {
    cachedAuth = new GoogleAuth({
      credentials: {
        client_email: env.FIREBASE_CLIENT_EMAIL,
        // Env-encoded private keys usually have literal "\n" — normalise them.
        private_key: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
  }
  return cachedAuth;
}

async function sendFcm(userId: number, payload: PushPayload): Promise<void> {
  const auth = getFcmAuth();
  if (!auth) return;

  const tokens = await db.deviceToken.findMany({ where: { userId } });
  if (tokens.length === 0) return;

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = accessTokenResponse.token;
  if (!accessToken) return;

  const endpoint = `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`;

  await Promise.all(
    tokens.map(async (device) => {
      const message = {
        message: {
          token: device.token,
          notification: { title: payload.title, body: payload.body },
          data: {
            url: payload.url ?? "/",
            ...(payload.tag ? { tag: payload.tag } : {}),
            ...Object.fromEntries(
              Object.entries(payload.data ?? {}).map(([k, v]) => [k, String(v)])
            ),
          },
          android: { priority: "HIGH" as const },
        },
      };

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (!res.ok) {
          const errBody = await res.text();
          // UNREGISTERED / invalid token — drop it.
          if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(errBody)) {
            await db.deviceToken
              .delete({ where: { id: device.id } })
              .catch(() => undefined);
          } else {
            console.error("FCM send failed:", res.status, errBody);
          }
        }
      } catch (error) {
        console.error("FCM request error:", error);
      }
    })
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Deliver a push notification to every registered browser + mobile device for a
 * user. Never throws — push is best-effort and must not break the caller.
 */
export async function sendPushToUser(
  userId: number,
  payload: PushPayload
): Promise<void> {
  try {
    await Promise.all([sendWebPush(userId, payload), sendFcm(userId, payload)]);
  } catch (error) {
    console.error("sendPushToUser failed:", error);
  }
}
