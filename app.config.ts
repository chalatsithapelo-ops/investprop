import { createApp } from "vinxi";
import reactRefresh from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { config } from "vinxi/plugins/config";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { consoleForwardPlugin } from "./vite-console-forward-plugin";

// Get BASE_URL from environment, but don't validate entire env schema at build time
const BASE_URL = process.env.BASE_URL;

export default createApp({
  server: {
    preset: "node-server", // change to 'netlify' or 'bun' or anyof the supported presets for nitro (nitro.unjs.io)
    experimental: {
      asyncContext: true,
    },
    // Prisma uses a generated package at `.prisma/client` which Nitro's
    // rollup-based bundler can't resolve as a regular package. Mark all
    // prisma-related modules as external so they're loaded from node_modules
    // at runtime instead of being bundled. We also disable tracing so Nitro
    // doesn't walk into @prisma/client/default.js whose `require('.prisma/...')`
    // breaks the resolver.
    externals: {
      external: [
        "@prisma/client",
        /^@prisma\//,
        /^\.prisma\//,
      ],
      inline: [],
      trace: false,
    },
  },
  routers: [
    {
      type: "static",
      name: "public",
      dir: "./public",
    },
    {
      type: "http",
      name: "trpc",
      base: "/trpc",
      handler: "./src/server/trpc/handler.ts",
      target: "server",
      plugins: () => [
        config("allowedHosts", {
          // @ts-ignore
          server: {
            allowedHosts: BASE_URL
              ? [BASE_URL.split("://")[1]]
              : undefined,
          },
        }),
        config("ssr-externals", {
          ssr: {
            external: [
              // RegExp entries are accepted at runtime by Vite/Vinxi but the
              // typed shape in this version expects strings only — cast to keep TS happy.
              ...([/\.prisma/, /@prisma\/client/] as unknown as string[]),
              "bcryptjs",
              "jsonwebtoken",
              "@node-rs/argon2",
              "@node-rs/bcrypt",
            ],
          },
          resolve: {
            conditions: ["import", "module", "default"],
          },
        }),
        tsConfigPaths({
          projects: ["./tsconfig.json"],
        }),
      ],
    },
    {
      type: "http",
      name: "debug",
      base: "/api/debug/client-logs",
      handler: "./src/server/debug/client-logs-handler.ts",
      target: "server",
      plugins: () => [
        config("allowedHosts", {
          // @ts-ignore
          server: {
            allowedHosts: BASE_URL
              ? [BASE_URL.split("://")[1]]
              : undefined,
          },
        }),
        tsConfigPaths({
          projects: ["./tsconfig.json"],
        }),
      ],
    },
    {
      type: "spa",
      name: "client",
      handler: "./index.html",
      target: "browser",
      plugins: () => [
        config("allowedHosts", {
          // @ts-ignore
          server: {
            allowedHosts: BASE_URL
              ? [BASE_URL.split("://")[1]]
              : undefined,
          },
        }),
        tsConfigPaths({
          projects: ["./tsconfig.json"],
        }),
        config("client-build-opts", {
          build: {
            // Split heavy, rarely-changing vendor libraries into their own
            // chunks so the main app bundle shrinks and vendors stay cached
            // across deploys. Silences the >500kB chunk warning too.
            chunkSizeWarningLimit: 900,
            rollupOptions: {
              output: {
                manualChunks(id: string) {
                  if (!id.includes("node_modules")) return;
                  // Keep the React runtime (react + react-dom + scheduler) together.
                  if (
                    /[\\/]react-dom[\\/]/.test(id) ||
                    /[\\/]react[\\/]/.test(id) ||
                    id.includes("react/jsx") ||
                    /[\\/]scheduler[\\/]/.test(id)
                  )
                    return "react-vendor";
                  if (id.includes("@tanstack")) return "tanstack";
                  if (id.includes("lucide-react")) return "icons";
                  if (
                    id.includes("jspdf") ||
                    id.includes("html2canvas") ||
                    id.includes("canvg") ||
                    id.includes("fflate") ||
                    id.includes("raphael")
                  )
                    return "pdf";
                  if (
                    id.includes("@trpc") ||
                    id.includes("superjson") ||
                    id.includes("zod")
                  )
                    return "trpc";
                  if (
                    id.includes("react-hook-form") ||
                    id.includes("@hookform")
                  )
                    return "forms";
                  if (id.includes("markdown-to-jsx")) return "markdown";
                  if (id.includes("qrcode")) return "qrcode";
                },
              },
            },
          },
        }),
        TanStackRouterVite({
          target: "react",
          autoCodeSplitting: false,
          routesDirectory: "./src/routes",
          generatedRouteTree: "./src/generated/routeTree.gen.ts",
        }),
        reactRefresh(),
        nodePolyfills(),
        consoleForwardPlugin({
          enabled: true,
          endpoint: "/api/debug/client-logs",
          levels: ["log", "warn", "error", "info", "debug"],
        }),
      ],
    },
  ],
});
