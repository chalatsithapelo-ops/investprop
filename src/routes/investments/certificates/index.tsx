import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Award,
  ShieldCheck,
  Eye,
  X,
  Building,
  DollarSign,
  PieChart,
  Hash,
  Calendar,
  MapPin,
  Loader2,
  FileText,
  Download,
  Clock,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { downloadCertificatePDF } from "~/utils/generate-certificate-pdf";
import toast from "react-hot-toast";

export const Route = createFileRoute("/investments/certificates/")({
  component: MyCertificatesPage,
});

function MyCertificatesPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownloadPDF = async (certId: number) => {
    try {
      setDownloadingId(certId);
      const pdfData = await trpcClient.getCertificatePDFData.mutate({
        authToken: authToken!,
        certificateId: certId,
      });
      await downloadCertificatePDF(pdfData as any);
      toast.success("Certificate PDF downloaded");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to download PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const certsQuery = useQuery({
    ...trpc.getMyCertificates.queryOptions({
      authToken: authToken ?? "",
    }),
    enabled: !!authToken,
  });

  // Used to surface contributions that are paid but awaiting certificate issuance
  const contributionsQuery = useQuery({
    ...trpc.getMyContributions.queryOptions({
      authToken: authToken ?? "",
    }),
    enabled: !!authToken,
  });

  const detailQuery = useQuery({
    ...trpc.getCertificateDetail.queryOptions({
      authToken: authToken ?? "",
      certificateId: selectedId!,
    }),
    enabled: !!authToken && selectedId !== null,
  });

  const certs = (certsQuery.data as any[]) ?? [];

  const contributionsResp = contributionsQuery.data as any;
  const allContributions: any[] = contributionsResp?.contributions ?? contributionsResp ?? [];
  const issuedContribIds = new Set<number>(certs.map((c: any) => c.contributionId).filter(Boolean));
  const pendingContributions = allContributions.filter(
    (c) =>
      c?.paymentStatus === "CONFIRMED" &&
      !c?.cancelledAt &&
      !issuedContribIds.has(c.id),
  );

  const totalValue = certs.reduce(
    (s: number, c: any) => s + (c.totalValue ?? 0),
    0,
  );
  const totalShares = certs.reduce(
    (s: number, c: any) => s + (c.numberOfShares ?? 0),
    0,
  );

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Award className="text-gold-500" size={32} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              My Certificates
            </h1>
            <p className="text-gray-500">
              Share certificates for your investments
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Certificates</p>
            <p className="text-2xl font-bold text-gray-900">{certs.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Total Shares</p>
            <p className="text-2xl font-bold text-gray-900">
              {totalShares.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Total Value</p>
            <p className="text-2xl font-bold text-green-600">
              R{totalValue.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Loading */}
        {certsQuery.isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-gold-500" size={32} />
          </div>
        )}

        {/* Empty State */}
        {!certsQuery.isLoading && certs.length === 0 && pendingContributions.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center">
            <FileText className="mx-auto mb-3 text-gray-300" size={48} />
            <h3 className="text-lg font-semibold text-gray-900">
              No Certificates Yet
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Certificates are issued automatically when your investment payment
              is confirmed.
            </p>
            <button
              onClick={() => navigate({ to: "/investments" })}
              className="mt-4 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              Browse Investment Opportunities
            </button>
          </div>
        )}

        {/* Pending Issuance */}
        {!certsQuery.isLoading && pendingContributions.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="text-amber-600" size={20} />
              <h3 className="font-semibold text-amber-900">
                Certificates pending issuance ({pendingContributions.length})
              </h3>
            </div>
            <p className="mb-3 text-sm text-amber-800">
              Your payment has been confirmed. Certificates are typically issued within 1–2 business days after the cooling-off window opens.
            </p>
            <ul className="divide-y divide-amber-200 rounded-lg border border-amber-200 bg-white">
              {pendingContributions.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{c.property?.title ?? `Contribution #${c.id}`}</p>
                    <p className="text-xs text-gray-500">
                      R{Number(c.contributionAmount ?? 0).toLocaleString()}
                      {c.numberOfShares ? ` · ${c.numberOfShares} shares` : ""}
                      {c.paymentReviewedAt ? ` · confirmed ${new Date(c.paymentReviewedAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                    Awaiting issuance
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Certificate Grid */}
        {!certsQuery.isLoading && certs.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {certs.map((cert: any) => (
              <div
                key={cert.id}
                className="group cursor-pointer rounded-xl border bg-white shadow-sm transition hover:shadow-md"
                onClick={() => setSelectedId(cert.id)}
              >
                {/* Property Image Header */}
                {cert.property?.imageUrl && (
                  <div className="relative h-32 overflow-hidden rounded-t-xl">
                    <img
                      src={cert.property.imageUrl}
                      alt={cert.propertyTitle}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3">
                      <p className="text-sm font-semibold text-white">
                        {cert.propertyTitle}
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-4">
                  {!cert.property?.imageUrl && (
                    <p className="mb-2 font-semibold text-gray-900">
                      {cert.propertyTitle}
                    </p>
                  )}

                  <div className="mb-3 flex items-center gap-2">
                    <ShieldCheck className="text-green-500" size={16} />
                    <span className="font-mono text-xs text-gray-600">
                      {cert.certificateNumber}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-600">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Hash size={12} />
                        Shares
                      </span>
                      <span className="font-medium text-gray-900">
                        {cert.numberOfShares?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <DollarSign size={12} />
                        Value
                      </span>
                      <span className="font-medium text-gray-900">
                        R{cert.totalValue?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <PieChart size={12} />
                        Ownership
                      </span>
                      <span className="font-medium text-gray-900">
                        {cert.ownershipPercentage?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        Issued
                      </span>
                      <span className="font-medium text-gray-900">
                        {new Date(cert.issueDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gold-500 py-1.5 text-xs font-medium text-white hover:bg-gold-600">
                      <Eye size={14} />
                      View
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownloadPDF(cert.id); }}
                      disabled={downloadingId === cert.id}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gold-300 bg-gold-50 py-1.5 text-xs font-medium text-gold-700 hover:bg-gold-100 disabled:opacity-50"
                    >
                      {downloadingId === cert.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      PDF
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Certificate Detail Modal */}
        {selectedId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Share Certificate
                </h2>
                <button onClick={() => setSelectedId(null)}>
                  <X
                    size={20}
                    className="text-gray-500 hover:text-gray-700"
                  />
                </button>
              </div>

              {detailQuery.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-gold-500" size={32} />
                </div>
              )}

              {detailQuery.data && (
                <div className="p-6">
                  {/* Certificate Header */}
                  <div className="mb-4 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 p-4 text-center text-white">
                    <Award size={32} className="mx-auto mb-2" />
                    <p className="text-xs uppercase tracking-wider opacity-80">
                      Certificate of Ownership
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold">
                      {(detailQuery.data as any).certificateNumber}
                    </p>
                  </div>

                  {/* Details */}
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                      <Building className="mt-0.5 text-gray-400" size={16} />
                      <div>
                        <p className="text-xs text-gray-500">Property</p>
                        <p className="font-medium text-gray-900">
                          {(detailQuery.data as any).propertyTitle}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(detailQuery.data as any).propertyAddress}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Shares</p>
                        <p className="text-lg font-bold text-gray-900">
                          {(detailQuery.data as any).numberOfShares?.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(detailQuery.data as any).shareClassName} class
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Price per Share</p>
                        <p className="text-lg font-bold text-gray-900">
                          R{(detailQuery.data as any).sharePrice?.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-green-50 p-3">
                        <p className="text-xs text-gray-500">Total Value</p>
                        <p className="text-lg font-bold text-green-600">
                          R{(detailQuery.data as any).totalValue?.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-3">
                        <p className="text-xs text-gray-500">Ownership</p>
                        <p className="text-lg font-bold text-blue-600">
                          {(detailQuery.data as any).ownershipPercentage?.toFixed(
                            4,
                          )}
                          %
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                      <Calendar className="text-gray-400" size={16} />
                      <div>
                        <p className="text-xs text-gray-500">Issue Date</p>
                        <p className="font-medium text-gray-900">
                          {new Date(
                            (detailQuery.data as any).issueDate,
                          ).toLocaleDateString("en-ZA", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 p-3">
                      <ShieldCheck className="text-green-600" size={20} />
                      <span className="font-semibold text-green-700">
                        Certificate Valid
                      </span>
                    </div>

                    {/* Download PDF */}
                    <button
                      onClick={() => handleDownloadPDF((detailQuery.data as any).id)}
                      disabled={downloadingId === (detailQuery.data as any).id}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-navy-800 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50"
                    >
                      {downloadingId === (detailQuery.data as any).id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      Download Share Certificate (PDF)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
