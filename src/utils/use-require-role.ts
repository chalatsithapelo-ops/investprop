import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "~/stores/authStore";

/**
 * Redirects a signed-in user to a fallback route when their role is not
 * allowed on the current page. Property owners are sellers only, so they are
 * bounced away from investor/developer screens to their Owner Portal.
 */
export function useRequireRole(allowedRoles: string[], fallbackTo = "/dashboard") {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const authToken = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) {
      navigate({ to: "/login" });
      return;
    }
    if (user.role === "ADMIN") return;
    if (!allowedRoles.includes(user.role)) {
      navigate({ to: fallbackTo });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authToken, hasHydrated]);
}

/**
 * Convenience guard: blocks PROPERTY_OWNER from investor/developer pages and
 * sends them to the Owner Portal.
 */
export function useBlockPropertyOwner() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (user && user.role === "PROPERTY_OWNER") {
      navigate({ to: "/owner-portal" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasHydrated]);
}
