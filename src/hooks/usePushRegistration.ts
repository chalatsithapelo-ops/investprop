import { useEffect, useRef } from "react";
import { useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Registers the service worker and subscribes the browser to Web Push once the
 * user is authenticated. Runs at most once per session and is a no-op on
 * unsupported browsers or when the user has denied notification permission.
 */
export function usePushRegistration() {
  const client = useTRPCClient();
  const user = useAuthStore((s) => s.user);
  const attempted = useRef(false);

  useEffect(() => {
    if (!user || attempted.current || !pushSupported()) return;
    attempted.current = true;

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // Only prompt if the user hasn't already decided.
        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted" || cancelled) return;

        const { publicKey } = await client.getVapidPublicKey.query();
        if (!publicKey || cancelled) return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

        await client.savePushSubscription.mutate({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        });
      } catch (error) {
        console.error("Push registration failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, client]);
}
