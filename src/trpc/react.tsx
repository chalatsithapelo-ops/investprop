import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "~/server/trpc/root";
import { createTRPCClient, httpBatchLink, httpLink } from "@trpc/client";
import superjson from "superjson";
import { useAuthStore } from "~/stores/authStore";

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:8010";
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns the new access token or null on failure.
 */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) return null;

      const res = await fetch(`${getBaseUrl()}/trpc/refreshToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { refreshToken } }),
      });

      if (!res.ok) return null;

      const json = await res.json();
      const result = json?.result?.data?.json ?? json?.result?.data;
      if (!result?.accessToken) return null;

      // Update the store with the new token
      useAuthStore.getState().updateAccessToken(result.accessToken);
      if (result.refreshToken) {
        useAuthStore.setState({ refreshToken: result.refreshToken });
      }

      return result.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/trpc`,
      transformer: superjson,
      async headers() {
        const token = useAuthStore.getState().accessToken;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      async fetch(url, options) {
        let response = await globalThis.fetch(url, options);

        // If unauthorized, try refreshing the token and retry the request
        if (response.status === 401 || response.status === 403) {
          try {
            const body = await response.clone().text();
            if (body.includes("UNAUTHORIZED") || body.includes("expired")) {
              const newToken = await refreshAccessToken();
              if (newToken && options?.body && typeof options.body === "string") {
                // Replace the old authToken in the request body with the new one
                const updatedBody = options.body.replace(
                  /"authToken":"[^"]*"/g,
                  `"authToken":"${newToken}"`
                );
                response = await globalThis.fetch(url, {
                  ...options,
                  body: updatedBody,
                });
              } else if (!newToken) {
                // Refresh failed — force logout so user re-authenticates
                useAuthStore.getState().logout();
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        return response;
      },
    }),
  ],
});
