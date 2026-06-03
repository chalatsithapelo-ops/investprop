import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { FileText, Plus, Download, Eye, Building2, Users, CheckCircle, Clock, XCircle, ShieldAlert } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

export const Route = createFileRoute("/legal-documents/")({
  component: LegalDocumentsPage,
});

const DOC_TYPE_OPTIONS = [
  { value: "MOI", label: "Memorandum of Incorporation" },
  { value: "SHAREHOLDER_AGREEMENT", label: "Shareholder Agreement" },
  { value: "CESSION_OF_RIGHTS", label: "Cession of Rights" },
  { value: "SHARE_CERTIFICATE", label: "Share Certificate" },
  { value: "TAX_CERTIFICATE", label: "Tax Certificate" },
  { value: "DISTRIBUTION_STATEMENT", label: "Distribution Statement" },
  { value: "COMPLIANCE_REPORT", label: "Compliance Report" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-navy-800/50 text-gray-800",
  GENERATED: "bg-gold-50 text-gold-600",
  SIGNED: "bg-emerald-50 text-emerald-600",
  ARCHIVED: "bg-gold-50 text-gold-600",
};

function LegalDocumentsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken]);

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");
  if (!user || !authToken) return null;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950"><Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access Restricted</h1>
          <p className="mt-2 text-gray-500">Only managers and property owners can access legal documents.</p>
          <button onClick={() => navigate({ to: "/dashboard" })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({
    documentType: "MOI" as string,
    propertyId: null as number | null,
    investorId: null as number | null,
    spvId: null as number | null,
  });

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const docsQuery = useQuery({
    ...trpc.getLegalDocuments.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const generateMutation = useMutation(
    trpc.generateLegalDocument.mutationOptions({
      onSuccess: () => {
        toast.success("Document generated successfully");
        qc.invalidateQueries({ queryKey: trpc.getLegalDocuments.queryKey() });
        setShowGenerate(false);
        setGenForm({ documentType: "MOI", propertyId: null, investorId: null, spvId: null });
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const updateStatusMutation = useMutation(
    trpc.updateDocumentStatus.mutationOptions({
      onSuccess: () => {
        toast.success("Status updated");
        qc.invalidateQueries({ queryKey: trpc.getLegalDocuments.queryKey() });
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const properties = (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const docs = (docsQuery.data ?? []) as any[];

  const needsInvestor = ["SHARE_CERTIFICATE", "TAX_CERTIFICATE"].includes(genForm.documentType);
  const needsProperty = ["MOI", "SHAREHOLDER_AGREEMENT", "CESSION_OF_RIGHTS", "COMPLIANCE_REPORT"].includes(genForm.documentType);

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="text-indigo-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Legal Documents</h1>
              <p className="text-gray-500">Generate and manage legal documents</p>
            </div>
          </div>
          <button onClick={() => setShowGenerate(!showGenerate)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-indigo-700">
            <Plus size={16} /> Generate Document
          </button>
        </div>

        {/* Generate Document Dialog */}
        {showGenerate && (
          <div className="mb-6 rounded-lg border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Generate New Document</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm text-gray-500">Document Type</label>
                <select value={genForm.documentType} onChange={(e) => setGenForm({ ...genForm, documentType: e.target.value })} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50">
                  {DOC_TYPE_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Property *</label>
                <select value={genForm.propertyId ?? ""} onChange={(e) => setGenForm({ ...genForm, propertyId: e.target.value ? Number(e.target.value) : null })} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50 text-gray-900">
                  <option value="">Select property</option>
                  {(Array.isArray(properties) ? properties : []).map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              {needsInvestor && (
                <div>
                  <label className="mb-1 block text-sm text-gray-500">Investor ID</label>
                  <input type="number" placeholder="Investor ID" value={genForm.investorId ?? ""} onChange={(e) => setGenForm({ ...genForm, investorId: e.target.value ? Number(e.target.value) : null })} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50" />
                </div>
              )}
              <div className="flex items-end">
                <button onClick={() => {
                  if (!genForm.propertyId) { toast.error("Please select a property"); return; }
                  const payload: any = { authToken: authToken ?? "", documentType: genForm.documentType, propertyId: genForm.propertyId };
                  if (genForm.investorId) payload.generatedFor = genForm.investorId;
                  if (genForm.spvId) payload.spvId = genForm.spvId;
                  generateMutation.mutate(payload);
                }} disabled={generateMutation.isPending} className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-indigo-700 disabled:opacity-50">
                  {generateMutation.isPending ? "Generating..." : "Generate"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Document Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Total Documents", value: docs.length, icon: FileText, color: "bg-navy-800/30 text-gold-600" },
            { label: "Draft", value: docs.filter((d: any) => d.status === "DRAFT").length, icon: Clock, color: "bg-navy-800/30 text-gray-700 bg-navy-900/50" },
            { label: "Generated", value: docs.filter((d: any) => d.status === "GENERATED").length, icon: CheckCircle, color: "bg-emerald-50 text-emerald-600" },
            { label: "Signed", value: docs.filter((d: any) => d.status === "SIGNED").length, icon: CheckCircle, color: "bg-gold-50 text-indigo-700" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
              <s.icon size={20} className="mb-2" />
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-sm opacity-80">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Document List */}
        <div className="rounded-lg border border-navy-800/50 bg-navy-900/50">
          {docsQuery.isLoading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-r-transparent"></div></div>
          ) : docs.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <FileText className="mx-auto mb-3 text-gray-600" size={48} />
              <p className="text-lg font-medium">No documents generated yet</p>
              <p className="text-sm">Click "Generate Document" to create your first document</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-navy-800/30 text-left text-gray-500 border-navy-800/50 bg-navy-950">
                  <tr>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Property</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Created</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {docs.map((doc: any) => (
                    <tr key={doc.id} className="hover:bg-navy-800/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-indigo-500" />
                          <span className="font-medium text-gray-900">{DOC_TYPE_OPTIONS.find((d) => d.value === doc.documentType)?.label ?? doc.documentType}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{doc.property?.title ?? "—"}</td>
                      <td className="px-6 py-4">
                        <select value={doc.status} onChange={(e) => (updateStatusMutation.mutate as any)({ authToken: authToken ?? "", documentId: doc.id, status: e.target.value })} className={`rounded-full border-0 px-3 py-1 text-xs font-medium ${STATUS_COLORS[doc.status] ?? "bg-navy-800/50 text-gray-800"}`}>
                          <option value="DRAFT">Draft</option>
                          <option value="GENERATED">Generated</option>
                          <option value="SIGNED">Signed</option>
                          <option value="ARCHIVED">Archived</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{new Date(doc.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {doc.content ? (
                            <>
                              <button onClick={() => {
                                const w = window.open("", "_blank");
                                if (w) {
                                  w.document.write(`<!DOCTYPE html><html><head><title>${DOC_TYPE_OPTIONS.find((d) => d.value === doc.documentType)?.label ?? doc.documentType}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:20px;color:#1a202c;line-height:1.6}h1,h2,h3{color:#1a365d}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #e2e8f0;text-align:left}@media print{body{margin:0;padding:20px}}</style></head><body>${doc.content}</body></html>`);
                                  w.document.close();
                                }
                              }} className="rounded p-1.5 text-gold-600 hover:bg-navy-800 flex items-center gap-1 text-sm">
                                <Eye size={14} /> View
                              </button>
                              <button onClick={() => {
                                const w = window.open("", "_blank");
                                if (w) {
                                  w.document.write(`<!DOCTYPE html><html><head><title>${DOC_TYPE_OPTIONS.find((d) => d.value === doc.documentType)?.label ?? doc.documentType}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:20px;color:#1a202c;line-height:1.6}h1,h2,h3{color:#1a365d}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #e2e8f0;text-align:left}@media print{body{margin:0;padding:20px}}</style></head><body>${doc.content}<script>window.onload=function(){window.print()}<\/script></body></html>`);
                                  w.document.close();
                                }
                              }} className="rounded p-1.5 text-gray-500 hover:bg-navy-800/50 flex items-center gap-1 text-sm">
                                <Download size={14} /> PDF
                              </button>
                            </>
                          ) : doc.documentUrl ? (
                            <>
                              <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="rounded p-1.5 text-gold-600 hover:bg-navy-800 flex items-center gap-1 text-sm"><Eye size={14} /> View</a>
                              <a href={doc.documentUrl} download className="rounded p-1.5 text-gray-500 hover:bg-navy-800/50 flex items-center gap-1 text-sm"><Download size={14} /> PDF</a>
                            </>
                          ) : (
                            <span className="text-xs text-gray-500">No content</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
