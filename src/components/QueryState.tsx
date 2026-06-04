import { Loader2, AlertCircle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

type QueryLike = {
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
  error?: { message?: string } | null;
  data?: unknown;
};

type Props = {
  query: QueryLike;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyHint?: string;
  isEmpty?: (data: unknown) => boolean;
  children: ReactNode;
};

/**
 * Unified loading / error / empty / success wrapper for tRPC queries.
 * Eliminates 4-5 lines of boilerplate per page.
 */
export function QueryState({
  query,
  loadingLabel = "Loading…",
  emptyLabel = "Nothing here yet",
  emptyHint,
  isEmpty,
  children,
}: Props) {
  const loading = query.isLoading || query.isPending;

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center gap-3 py-12 text-gray-500"
      >
        <Loader2 className="h-7 w-7 animate-spin text-gold-500" aria-hidden="true" />
        <span className="text-sm">{loadingLabel}</span>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Something went wrong</p>
            <p className="mt-1 text-red-600">
              {query.error?.message ?? "Unknown error. Please refresh and try again."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const empty = isEmpty ? isEmpty(query.data) : false;
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
        <Inbox className="h-10 w-10 text-gray-300" aria-hidden="true" />
        <p className="text-sm font-medium text-gray-700">{emptyLabel}</p>
        {emptyHint && <p className="text-xs text-gray-500">{emptyHint}</p>}
      </div>
    );
  }

  return <>{children}</>;
}
