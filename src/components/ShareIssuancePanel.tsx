import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Send, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export function ShareIssuancePanel({ propertyId }: { propertyId: number }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const qc = useQueryClient();
  const authToken = useAuthStore((s) => s.token) ?? "";

  const [tab, setTab] = useState<"classes" | "issue" | "history">("classes");

  // Form state — create share class
  const [classForm, setClassForm] = useState({
    name: "",
    totalShares: 0,
    pricePerShare: 0,
    minimumShares: 1,
  });

  // Form state — purchase shares
  const [issueForm, setIssueForm] = useState({
    shareClassId: 0,
    shares: 0,
  });

  const [creatingClass, setCreatingClass] = useState(false);
  const [issuingShares, setIssuingShares] = useState(false);

  // Query share info for this property
  const { data: shareInfoRaw, isLoading } = useQuery({
    ...trpc.getShareInfo.queryOptions({ propertyId }),
    enabled: !!propertyId,
  });
  const shareClasses = ((shareInfoRaw as any) ?? []) as any[];

  // Create share class handler
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classForm.name || classForm.totalShares <= 0 || classForm.pricePerShare <= 0) {
      toast.error("Please fill in all fields");
      return;
    }
    setCreatingClass(true);
    try {
      await trpcClient.createShareClass.mutate({
        authToken,
        propertyId,
        name: classForm.name,
        totalShares: classForm.totalShares,
        pricePerShare: classForm.pricePerShare,
        minimumShares: classForm.minimumShares,
      });
      toast.success("Share class created");
      qc.invalidateQueries({ queryKey: trpc.getShareInfo.queryKey() });
      setClassForm({ name: "", totalShares: 0, pricePerShare: 0, minimumShares: 1 });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create share class");
    } finally {
      setCreatingClass(false);
    }
  };

  // Purchase / issue shares handler
  const handleIssueShares = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueForm.shareClassId || issueForm.shares <= 0) {
      toast.error("Please fill in all fields");
      return;
    }
    setIssuingShares(true);
    try {
      await trpcClient.purchaseShares.mutate({
        authToken,
        shareClassId: issueForm.shareClassId,
        shares: issueForm.shares,
      });
      toast.success("Shares issued successfully");
      qc.invalidateQueries({ queryKey: trpc.getShareInfo.queryKey() });
      setIssueForm({ shareClassId: 0, shares: 0 });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to issue shares");
    } finally {
      setIssuingShares(false);
    }
  };

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? "bg-gold-500/20 text-gold-600 border border-gold-300"
        : "text-gray-500 hover:text-gray-900 hover:bg-navy-800/50"
    }`;

  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-navy-800/50 px-6 py-4">
        <Layers className="h-5 w-5 text-gold-600" />
        <h3 className="text-base font-semibold text-gray-900">Share Issuance Panel</h3>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-800/50 px-6 py-3">
        <button className={tabClass("classes")} onClick={() => setTab("classes")}>
          <span className="flex items-center gap-1.5"><Layers className="h-4 w-4" /> Share Classes</span>
        </button>
        <button className={tabClass("issue")} onClick={() => setTab("issue")}>
          <span className="flex items-center gap-1.5"><Send className="h-4 w-4" /> Issue Shares</span>
        </button>
        <button className={tabClass("history")} onClick={() => setTab("history")}>
          <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> History</span>
        </button>
      </div>

      <div className="p-6">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
          </div>
        )}

        {/* ── Share Classes Tab ── */}
        {!isLoading && tab === "classes" && (
          <div className="space-y-6">
            {/* Table */}
            {shareClasses.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-navy-800/50">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-navy-800/50 bg-navy-800/30">
                      <th className="px-4 py-3 font-medium text-gray-500">Class Name</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right">Total Shares</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right">Sold</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right">Available</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right">Price / Share</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right">% Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shareClasses.map((sc: any, i: number) => (
                      <tr key={sc.id ?? i} className="border-b border-navy-800/30 last:border-0">
                        <td className="px-4 py-3 font-medium text-gray-900">{sc.name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{Number(sc.totalShares).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{Number(sc.totalSold ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{Number(sc.availableShares ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-600">R{Number(sc.pricePerShare).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            Number(sc.percentageSold ?? 0) >= 80
                              ? "bg-red-50 text-red-600"
                              : Number(sc.percentageSold ?? 0) >= 50
                                ? "bg-gold-50 text-gold-600"
                                : "bg-emerald-50 text-emerald-600"
                          }`}>
                            {Number(sc.percentageSold ?? 0).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No share classes created yet.</p>
            )}

            {/* Create Form */}
            <div className="rounded-lg border border-navy-800/50 bg-navy-800/20 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Plus className="h-4 w-4 text-gold-600" />
                <h4 className="text-sm font-semibold text-gray-900">Create Share Class</h4>
              </div>
              <form onSubmit={handleCreateClass} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Class Name</label>
                  <input
                    type="text"
                    value={classForm.name}
                    onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                    placeholder="e.g. Ordinary"
                    className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Total Shares</label>
                  <input
                    type="number"
                    value={classForm.totalShares || ""}
                    onChange={(e) => setClassForm({ ...classForm, totalShares: Number(e.target.value) })}
                    placeholder="1000"
                    className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Price / Share (R)</label>
                  <input
                    type="number"
                    value={classForm.pricePerShare || ""}
                    onChange={(e) => setClassForm({ ...classForm, pricePerShare: Number(e.target.value) })}
                    placeholder="100"
                    className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Min. Shares</label>
                  <input
                    type="number"
                    value={classForm.minimumShares || ""}
                    onChange={(e) => setClassForm({ ...classForm, minimumShares: Number(e.target.value) })}
                    placeholder="1"
                    className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <button
                    type="submit"
                    disabled={creatingClass}
                    className="flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-400 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {creatingClass ? "Creating…" : "Create Share Class"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Issue Shares Tab ── */}
        {!isLoading && tab === "issue" && (
          <div className="rounded-lg border border-navy-800/50 bg-navy-800/20 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Send className="h-4 w-4 text-gold-600" />
              <h4 className="text-sm font-semibold text-gray-900">Purchase / Issue Shares</h4>
            </div>
            <form onSubmit={handleIssueShares} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Share Class</label>
                <select
                  value={issueForm.shareClassId}
                  onChange={(e) => setIssueForm({ ...issueForm, shareClassId: Number(e.target.value) })}
                  className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                >
                  <option value={0}>Select class…</option>
                  {shareClasses.map((sc: any) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name} — {Number(sc.availableShares ?? 0).toLocaleString()} available @ R{Number(sc.pricePerShare).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Number of Shares</label>
                <input
                  type="number"
                  value={issueForm.shares || ""}
                  onChange={(e) => setIssueForm({ ...issueForm, shares: Number(e.target.value) })}
                  placeholder="100"
                  className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={issuingShares}
                  className="flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-400 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {issuingShares ? "Issuing…" : "Issue Shares"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Transaction History Tab ── */}
        {!isLoading && tab === "history" && (
          <div className="space-y-3">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gold-600" />
              <h4 className="text-sm font-semibold text-gray-900">Share Holdings & Issuance History</h4>
            </div>

            {shareClasses.length > 0 ? (
              shareClasses.map((sc: any, i: number) => {
                const holdings = (sc.holdings ?? []) as any[];
                return (
                  <div key={sc.id ?? i} className="rounded-lg border border-navy-800/50 bg-navy-800/20 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-gold-600">{sc.name}</p>
                      <span className="text-xs text-gray-500">{Number(sc.totalSold ?? 0).toLocaleString()} / {Number(sc.totalShares).toLocaleString()} sold</span>
                    </div>
                    {holdings.length === 0 ? (
                      <p className="text-xs text-gray-500">No holdings yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {holdings.map((h: any, j: number) => (
                          <li key={h.id ?? j} className="flex items-center justify-between rounded-md bg-navy-800/30 px-3 py-2 text-sm">
                            <span className="text-gray-600">
                              {h.investor?.name ?? `Investor #${h.investorId}`} — {Number(h.sharesOwned).toLocaleString()} shares
                            </span>
                            <span className="text-xs text-gray-500">
                              R{(Number(h.sharesOwned) * Number(sc.pricePerShare)).toLocaleString()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-gray-500">No share classes or transaction history available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
