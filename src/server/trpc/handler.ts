import { defineEventHandler, toWebRequest } from "@tanstack/react-start/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./root";
import { createContext } from "./context";

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  if (!request) {
    return new Response("No request", { status: 400 });
  }

  return fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: appRouter,
    createContext: (opts) => createContext(opts),
    onError({ error, path }) {
      console.error(`tRPC error on '${path}':`, error);
    },
  });
});
