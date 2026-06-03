import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FolderOpen, FileText, Award, Receipt, Building2, Shield, Eye, Download, ExternalLink, Hash, PieChart, DollarSign, Loader2 } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { downloadCertificatePDF } from "~/utils/generate-certificate-pdf";
import toast from "react-hot-toast";

export const Route = createFileRoute("/my-documents/")({
  component: MyDocumentsPage,
});

function MyDocumentsPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
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

  const docsQuery = useQuery({
    ...trpc.getMyDocuments.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const data = docsQuery.data as any;

  const sections = [
    { key: "shareCertificates", label: "Share Certificates", icon: Award, color: "text-indigo-500", bgColor: "bg-gold-50" },
    { key: "taxCertificates", label: "Tax Certificates", icon: Receipt, color: "text-green-500", bgColor: "bg-emerald-50" },
    { key: "distributionStatements", label: "Distribution Statements", icon: FileText, color: "text-gold-600", bgColor: "bg-navy-800/30" },
    { key: "companyDocs", label: "SPV & Company Documents", icon: Building2, color: "text-purple-500", bgColor: "bg-purple-50" },
    { key: "complianceReports", label: "Compliance Reports", icon: Shield, color: "text-orange-500", bgColor: "bg-gold-50" },
  ];

  const totalDocs = sections.reduce((sum, s) => sum + (data?.[s.key]?.length ?? 0), 0);

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <FolderOpen className="text-gold-600" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Documents</h1>
            <p className="text-gray-500">Access your investment documents and certificates</p>
          </div>
        </div>

        {docsQuery.isLoading ? (
          <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div></div>
        ) : (
          <>
            {/* Stats */}
            <div className="mb-6 flex flex-wrap gap-3">
              <div className="rounded-lg bg-navy-800/30 px-4 py-2">
                <span className="text-2xl font-bold text-gold-600">{totalDocs}</span>
                <span className="ml-2 text-sm text-gold-600">Total Documents</span>
              </div>
              {sections.map((s) => {
                const count = data?.[s.key]?.length ?? 0;
                if (!count) return null;
                return (
                  <div key={s.key} className={`rounded-lg px-4 py-2 ${s.bgColor}`}>
                    <span className={`text-lg font-bold ${s.color}`}>{count}</span>
                    <span className="ml-2 text-sm text-gray-500">{s.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Document Sections */}
            <div className="space-y-6">
              {sections.map((section) => {
                const sectionDocs = (data?.[section.key] ?? []) as any[];
                return (
                  <div key={section.key} className="rounded-lg border border-navy-800/50 bg-navy-900/50">
                    <div className="flex items-center gap-2 border-b px-6 py-4 border-navy-800/50">
                      <section.icon size={20} className={section.color} />
                      <h3 className="font-semibold text-gray-900">{section.label}</h3>
                      <span className="ml-auto rounded-full bg-navy-800/50 px-2 py-0.5 text-xs text-gray-600 bg-navy-800">{sectionDocs.length}</span>
                    </div>
                    {sectionDocs.length === 0 ? (
                      <p className="py-8 text-center text-sm text-gray-500">No documents in this category yet</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
                        {sectionDocs.map((doc: any) => (
                          <div key={`${doc.isCertificateRecord ? 'cert' : 'doc'}-${doc.id}`} className="rounded-lg border p-4 transition hover:shadow-md border-navy-700">
                            <div className="mb-2 flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                {doc.isCertificateRecord ? <Award size={16} className="text-gold-500" /> : <FileText size={16} className={section.color} />}
                                <span className="text-sm font-medium text-gray-900">
                                  {doc.isCertificateRecord ? doc.certificateNumber : (doc.documentType?.replace(/_/g, " ") ?? "Document")}
                                </span>
                              </div>
                              {doc.isCertificateRecord ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">ISSUED</span>
                              ) : doc.status ? (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${doc.status === "SIGNED" ? "bg-emerald-50 text-emerald-600" : doc.status === "GENERATED" ? "bg-gold-50 text-gold-600" : "bg-navy-800/50 text-gray-600"}`}>{doc.status}</span>
                              ) : null}
                            </div>

                            {/* Certificate-specific details */}
                            {doc.isCertificateRecord && (
                              <div className="mb-3 space-y-1.5">
                                <p className="flex items-center gap-1.5 text-xs text-gray-600">
                                  <Building2 size={12} className="text-navy-600" />
                                  {doc.propertyTitle}
                                </p>
                                <p className="text-xs text-gray-500">{doc.propertyAddress}</p>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <div className="rounded-md bg-gray-50 p-2 text-center">
                                    <p className="text-[10px] text-gray-400">Shares</p>
                                    <p className="text-sm font-bold text-gray-900">{doc.numberOfShares?.toLocaleString()}</p>
                                  </div>
                                  <div className="rounded-md bg-gray-50 p-2 text-center">
                                    <p className="text-[10px] text-gray-400">Ownership</p>
                                    <p className="text-sm font-bold text-green-600">{doc.ownershipPercentage?.toFixed(2)}%</p>
                                  </div>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                  Value: <span className="font-semibold text-gray-700">R{doc.totalValue?.toLocaleString()}</span>
                                  {" · "}
                                  {doc.shareClassName} @ R{doc.sharePrice?.toLocaleString()}/share
                                </p>
                              </div>
                            )}

                            {!doc.isCertificateRecord && doc.property?.title && <p className="mb-2 text-xs text-gray-500">{doc.property.title}</p>}
                            <p className="mb-3 text-xs text-gray-500">{new Date(doc.createdAt ?? doc.issueDate).toLocaleDateString()}</p>
                            <div className="flex gap-2">
                              {doc.isCertificateRecord && (
                                <>
                                  <Link to="/investments/certificates" className="inline-flex items-center gap-1 rounded-lg border border-gold-300 bg-gold-50 px-3 py-1.5 text-xs font-medium text-gold-700 hover:bg-gold-100">
                                    <Award size={12} /> View
                                  </Link>
                                  <button
                                    onClick={() => handleDownloadPDF(doc.id)}
                                    disabled={downloadingId === doc.id}
                                    className="inline-flex items-center gap-1 rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-50"
                                  >
                                    {downloadingId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF
                                  </button>
                                </>
                              )}
                              {doc.documentUrl && (
                                <>
                                  <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs text-gold-600 hover:bg-navy-800 border-navy-700">
                                    <Eye size={12} /> View
                                  </a>
                                  <a href={doc.documentUrl} download className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs text-gray-600 hover:bg-navy-800/50 border-navy-700">
                                    <Download size={12} /> Download
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalDocs === 0 && (
              <div className="mt-6 rounded-lg border-2 border-dashed py-16 text-center border-navy-700">
                <FolderOpen className="mx-auto mb-3 text-gray-600" size={48} />
                <p className="text-lg font-medium text-gray-500">No documents available yet</p>
                <p className="text-sm text-gray-500">Documents will appear here as they are generated for your investments</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
