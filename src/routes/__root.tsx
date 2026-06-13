import * as React from "react";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Footer } from "~/components/Footer";
import { useAuthStore } from "~/stores/authStore";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  // Ensure the auth store's hydration flag is reliably set on the client.
  // Route guards gate on `_hasHydrated` before redirecting; if it never flips
  // to true (e.g. the persist rehydration callback is missed), all auth/role
  // redirects silently stop firing. This belt-and-suspenders effect guarantees
  // the flag is set once persistence has finished hydrating.
  React.useEffect(() => {
    const markHydrated = () => useAuthStore.getState().setHasHydrated(true);
    const unsub = useAuthStore.persist.onFinishHydration(markHydrated);
    if (useAuthStore.persist.hasHydrated()) {
      markHydrated();
    }
    return unsub;
  }, []);

  return (
    <React.Fragment>
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </div>
    </React.Fragment>
  );
}
