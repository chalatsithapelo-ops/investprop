import * as React from "react";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Footer } from "~/components/Footer";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
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
