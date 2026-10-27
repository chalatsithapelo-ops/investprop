import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/land-partnership/$id/agreement")({
  component: AgreementPrintPage,
});

function AgreementPrintPage() {
  const navigate = useNavigate();
  const { id } = useParams({ from: "/land-partnership/$id/agreement" });
  const trpc = useTRPC();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const q = useQuery({
    ...trpc.getLandPartnershipById.queryOptions({
      authToken: authToken ?? "",
      id: Number(id),
    }),
    enabled: !!authToken && !!id,
  });

  const lp = q.data as any;

  if (!authToken) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Print controls — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <Link
          to="/land-partnership"
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} /> Back
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600"
        >
          <Printer size={16} /> Print / Save PDF
        </button>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-gold-500" />
        </div>
      ) : !lp?.agreementContent ? (
        <div className="mx-auto max-w-3xl px-4 py-20 text-center text-gray-500">
          The agreement has not been generated yet. It becomes available once your submission is
          approved.
        </div>
      ) : (
        <div className="mx-auto my-6 max-w-[210mm] bg-white p-[18mm] shadow-lg print:my-0 print:shadow-none">
          <pre className="whitespace-pre-wrap break-words font-serif text-[11px] leading-relaxed text-gray-900">
            {lp.agreementContent}
          </pre>
        </div>
      )}
    </div>
  );
}
