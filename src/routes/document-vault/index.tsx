import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { FileText, Download, ShieldCheck, Receipt } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { QueryState } from "~/components/QueryState";
import { useAuthStore } from "~/stores/authStore";
import { useTRPC } from "~/trpc/react";

export const Route = createFileRoute("/document-vault/")({
  component: DocumentVaultPage,
});

function DocumentVaultPage() {
  const trpc = useTRPC();
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!token || !user) nav({ to: "/login" });
  }, [token, user]);

  const q = useQuery({
    ...trpc.listMyDocuments.queryOptions({ authToken: token ?? "" }),
    enabled: !!token,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Document Vault</h1>
        <p className="mb-6 text-sm text-gray-500">
          Every legal document, payment proof, share certificate and IT3 issued to you in one place.
        </p>

        <QueryState
          query={q}
          isEmpty={(d: any) => !d || d.totalCount === 0}
          emptyLabel="No documents yet"
          emptyHint="Your contracts, certificates and tax statements will appear here as they are generated."
        >
          {q.data && (
            <div className="space-y-6">
              <Section
                icon={ShieldCheck}
                title="Share certificates"
                empty="No share certificates yet."
                items={(q.data.shareCertificates as any[]).map((c) => ({
                  key: c.id,
                  label: `Certificate #${c.certificateNumber ?? c.id} — ${c.contribution?.property?.title ?? "Property"}`,
                  sub: c.issuedAt ? new Date(c.issuedAt).toLocaleDateString("en-ZA") : "Pending",
                  href: `/investments/certificates`,
                }))}
              />

              <Section
                icon={Receipt}
                title="Payment proofs"
                empty="No payment proofs uploaded yet."
                items={(q.data.paymentProofs as any[]).map((p) => ({
                  key: p.id,
                  label: `${p.property?.title ?? "Investment"} — ref ${p.paymentReference ?? "—"}`,
                  sub: p.paymentSubmittedAt
                    ? `Submitted ${new Date(p.paymentSubmittedAt).toLocaleDateString("en-ZA")}`
                    : "—",
                  href: p.proofOfPaymentUrl ?? "#",
                  external: true,
                }))}
              />

              <Section
                icon={FileText}
                title="Legal documents"
                empty="No legal documents generated yet."
                items={(q.data.legalDocuments as any[]).map((d) => ({
                  key: d.id,
                  label: `${d.title} (${d.documentType})`,
                  sub: d.status,
                  href: d.documentUrl ?? "#",
                  external: !!d.documentUrl,
                }))}
              />
            </div>
          )}
        </QueryState>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  empty,
  items,
}: {
  icon: any;
  title: string;
  empty: string;
  items: Array<{ key: any; label: string; sub: string; href: string; external?: boolean }>;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
        <Icon className="h-4 w-4" aria-hidden="true" /> {title}{" "}
        <span className="text-gray-400">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-gray-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((it) => {
            const inner = (
              <>
                <span className="flex-1 truncate text-sm text-gray-800">{it.label}</span>
                <span className="ml-3 text-xs text-gray-400">{it.sub}</span>
                <Download className="ml-3 h-4 w-4 text-gray-400" aria-hidden="true" />
              </>
            );
            return (
              <li key={it.key} className="flex items-center py-2">
                {it.external ? (
                  <a
                    href={it.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center hover:text-gold-600"
                  >
                    {inner}
                  </a>
                ) : (
                  <Link to={it.href as any} className="flex w-full items-center hover:text-gold-600">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
