import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { DollarSign, TrendingUp, TrendingDown, Plus, Trash2, BarChart3, Calendar, ShieldAlert } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"];

export const Route = createFileRoute("/property-financials/")({
  component: PropertyFinancialsPage,
});

const INCOME_CATEGORIES = ["RENTAL_INCOME", "PARKING_INCOME", "LAUNDRY_INCOME", "PET_FEES", "LATE_FEES", "APPLICATION_FEES", "OTHER_INCOME"] as const;
const EXPENSE_CATEGORIES = ["MORTGAGE", "INSURANCE", "PROPERTY_TAX", "MAINTENANCE", "UTILITIES", "MANAGEMENT_FEES", "LEGAL_FEES", "OTHER_EXPENSE"] as const;

function PropertyFinancialsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");

  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [tab, setTab] = useState<"summary" | "entries" | "cashflow">("summary");
  const [entryForm, setEntryForm] = useState({ type: "INCOME" as "INCOME" | "EXPENSE", category: "RENTAL_INCOME" as string, amount: 0, description: "", date: new Date().toISOString().split("T")[0], reference: "", period: "" });

  const propertiesQuery = useQuery({ ...trpc.getProperties.queryOptions({ authToken: authToken ?? "" }), enabled: !!authToken });
  const summaryQuery = useQuery({ ...trpc.getFinancialSummary.queryOptions({ authToken: authToken ?? "", propertyId: selectedPropertyId ?? 0 }), enabled: !!authToken && !!selectedPropertyId });
  const entriesQuery = useQuery({ ...trpc.getFinancialEntries.queryOptions({ authToken: authToken ?? "", propertyId: selectedPropertyId ?? 0 }), enabled: !!authToken && !!selectedPropertyId });
  const cashFlowQuery = useQuery({ ...trpc.getMonthlyCashFlow.queryOptions({ authToken: authToken ?? "", propertyId: selectedPropertyId ?? 0 }), enabled: !!authToken && !!selectedPropertyId });

  const createMutation = useMutation(trpc.createFinancialEntry.mutationOptions({
    onSuccess: () => { toast.success("Entry added"); qc.invalidateQueries({ queryKey: trpc.getFinancialEntries.queryKey() }); qc.invalidateQueries({ queryKey: trpc.getFinancialSummary.queryKey() }); qc.invalidateQueries({ queryKey: trpc.getMonthlyCashFlow.queryKey() }); setShowAddEntry(false); },
    onError: (e: any) => toast.error(e.message),
  }));

  const deleteMutation = useMutation(trpc.deleteFinancialEntry.mutationOptions({
    onSuccess: () => { toast.success("Entry deleted"); qc.invalidateQueries({ queryKey: trpc.getFinancialEntries.queryKey() }); qc.invalidateQueries({ queryKey: trpc.getFinancialSummary.queryKey() }); qc.invalidateQueries({ queryKey: trpc.getMonthlyCashFlow.queryKey() }); },
    onError: (e: any) => toast.error(e.message),
  }));

  // Guards must come AFTER all hooks (Rules of Hooks) — otherwise sign-out
  // unmounts hooks mid-render and throws React error #300.
  if (!user || !authToken) return null;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950"><Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-400" size={48} />
          <h1 className="text-2xl font-bold text-white">Access Restricted</h1>
          <p className="mt-2 text-gray-400">Only managers and property owners can access property financials.</p>
          <button onClick={() => navigate({ to: "/dashboard" })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const properties = (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const summary = summaryQuery.data as any;
  const entries = (entriesQuery.data ?? []) as any[];
  const cashFlow = (cashFlowQuery.data ?? []) as any[];
  const categories = entryForm.type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <DollarSign className="text-green-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Property Financials</h1>
              <p className="text-gray-500 dark:text-gray-400">Track income, expenses and cash flow</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select value={selectedPropertyId ?? ""} onChange={(e) => setSelectedPropertyId(e.target.value ? Number(e.target.value) : null)} className="rounded-lg border px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
              <option value="">Select Property</option>
              {(Array.isArray(properties) ? properties : []).map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            {selectedPropertyId && <button onClick={() => setShowAddEntry(!showAddEntry)} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"><Plus size={16} /> Add Entry</button>}
          </div>
        </div>

        {!selectedPropertyId ? (
          <div className="rounded-lg border-2 border-dashed py-16 text-center dark:border-gray-600"><DollarSign className="mx-auto mb-3 text-gray-300" size={48} /><p className="text-lg font-medium text-gray-500">Select a property to view financials</p></div>
        ) : (
          <>
            {showAddEntry && (
              <div className="mb-6 rounded-lg border bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Add Financial Entry</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Type</label>
                    <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
                      {(["INCOME", "EXPENSE"] as const).map((t) => (<button key={t} onClick={() => setEntryForm({ ...entryForm, type: t, category: t === "INCOME" ? "RENTAL_INCOME" : "MORTGAGE" })} className={`flex-1 rounded-md py-2 text-sm font-medium ${entryForm.type === t ? (t === "INCOME" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "text-gray-500"}`}>{t}</button>))}
                    </div>
                  </div>
                  <div><label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Category</label><select value={entryForm.category} onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })} className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{categories.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></div>
                  <div><label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Amount (R)</label><input type="number" min={0} step={0.01} value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                  <div><label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Date</label><input type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                  <div className="md:col-span-2"><label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Description</label><input type="text" placeholder="Description" value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                  <div><label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Reference</label><input type="text" placeholder="Ref # (optional)" value={entryForm.reference} onChange={(e) => setEntryForm({ ...entryForm, reference: e.target.value })} className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                  <div className="flex items-end"><button onClick={() => { if (!entryForm.amount) { toast.error("Enter amount"); return; } (createMutation.mutate as any)({ authToken: authToken ?? "", propertyId: selectedPropertyId, type: entryForm.type, category: entryForm.category, amount: entryForm.amount, description: entryForm.description || undefined, date: entryForm.date, reference: entryForm.reference || undefined, period: entryForm.period || undefined }); }} disabled={createMutation.isPending} className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">{createMutation.isPending ? "Saving..." : "Save Entry"}</button></div>
                </div>
              </div>
            )}

            <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              {([{ key: "summary" as const, label: "Summary", icon: BarChart3 }, { key: "entries" as const, label: "All Entries", icon: DollarSign }, { key: "cashflow" as const, label: "Cash Flow", icon: Calendar }]).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium ${tab === key ? "bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white" : "text-gray-500"}`}><Icon size={14} /> {label}</button>
              ))}
            </div>

            {tab === "summary" && (summaryQuery.isLoading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-r-transparent" /></div> : summary ? (
              <>
                <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="rounded-xl bg-green-50 p-5 dark:bg-green-900/20"><TrendingUp size={20} className="mb-2 text-green-600" /><p className="text-2xl font-bold text-green-700 dark:text-green-300">R{Number(summary.totalIncome ?? 0).toLocaleString()}</p><p className="text-sm text-green-600">Total Income</p></div>
                  <div className="rounded-xl bg-red-50 p-5 dark:bg-red-900/20"><TrendingDown size={20} className="mb-2 text-red-600" /><p className="text-2xl font-bold text-red-700 dark:text-red-300">R{Number(summary.totalExpenses ?? 0).toLocaleString()}</p><p className="text-sm text-red-600">Total Expenses</p></div>
                  <div className={`rounded-xl p-5 ${Number(summary.netIncome ?? 0) >= 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-orange-50 dark:bg-orange-900/20"}`}><DollarSign size={20} className="mb-2 text-blue-600" /><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">R{Number(summary.netIncome ?? 0).toLocaleString()}</p><p className="text-sm text-gray-600">Net Income</p></div>
                  <div className="rounded-xl bg-purple-50 p-5 dark:bg-purple-900/20"><BarChart3 size={20} className="mb-2 text-purple-600" /><p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{summary.profitMargin != null ? `${Number(summary.profitMargin).toFixed(1)}%` : "—"}</p><p className="text-sm text-purple-600">Profit Margin</p></div>
                </div>
                {summary.yields && (
                  <div className="mb-6 rounded-lg border bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">Yields</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div><p className="text-gray-500">Gross Yield</p><p className="text-lg font-bold">{Number(summary.yields.gross ?? 0).toFixed(2)}%</p></div>
                      <div><p className="text-gray-500">Net Yield</p><p className="text-lg font-bold">{Number(summary.yields.net ?? 0).toFixed(2)}%</p></div>
                      <div><p className="text-gray-500">Cap Rate</p><p className="text-lg font-bold">{Number(summary.yields.capRate ?? 0).toFixed(2)}%</p></div>
                    </div>
                  </div>
                )}
                {summary.categoryBreakdown && (
                  <div className="rounded-lg border bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">By Category</h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {Object.entries(summary.categoryBreakdown).map(([cat, val]: [string, any]) => (
                        <div key={cat} className="flex items-center justify-between rounded-lg border p-3 dark:border-gray-700"><span className="text-sm text-gray-600 dark:text-gray-400">{cat.replace(/_/g, " ")}</span><span className={`font-medium ${Number(val) >= 0 ? "text-green-600" : "text-red-600"}`}>R{Number(val).toLocaleString()}</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : <p className="py-12 text-center text-gray-500">No financial data available</p>)}

            {tab === "entries" && (
              <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
                {entriesQuery.isLoading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-r-transparent" /></div> : entries.length === 0 ? <p className="py-12 text-center text-gray-500">No entries yet</p> : (
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 text-left text-gray-500 dark:border-gray-700 dark:bg-gray-900"><tr><th className="px-6 py-3">Date</th><th className="px-6 py-3">Type</th><th className="px-6 py-3">Category</th><th className="px-6 py-3">Description</th><th className="px-6 py-3 text-right">Amount</th><th className="px-6 py-3"></th></tr></thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {entries.map((e: any) => (<tr key={e.id}><td className="px-6 py-3 text-gray-500">{new Date(e.date).toLocaleDateString()}</td><td className="px-6 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${e.type === "INCOME" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{e.type}</span></td><td className="px-6 py-3">{e.category?.replace(/_/g, " ")}</td><td className="px-6 py-3 text-gray-500">{e.description ?? "—"}</td><td className={`px-6 py-3 text-right font-medium ${e.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>{e.type === "EXPENSE" ? "-" : ""}R{Number(e.amount).toLocaleString()}</td><td className="px-6 py-3"><button onClick={() => (deleteMutation.mutate as any)({ authToken: authToken ?? "", entryId: e.id })} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td></tr>))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === "cashflow" && (
              <div className="rounded-lg border bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Monthly Cash Flow</h3>
                {cashFlowQuery.isLoading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-r-transparent" /></div> : cashFlow.length === 0 ? <p className="py-12 text-center text-gray-500">No cash flow data</p> : (
                  <div className="space-y-2">
                    {(() => { const maxV = Math.max(...cashFlow.map((m: any) => Math.max(Math.abs(Number(m.income ?? 0)), Math.abs(Number(m.expenses ?? 0)))), 1); return cashFlow.map((m: any, i: number) => { const inc = Number(m.income ?? 0); const exp = Number(m.expenses ?? 0); const net = inc - exp; return (
                      <div key={i} className="rounded-lg border p-3 dark:border-gray-700">
                        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-gray-900 dark:text-white">{m.month ?? m.period}</span><span className={`font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>{net >= 0 ? "+" : ""}R{net.toLocaleString()}</span></div>
                        <div className="flex gap-2">
                          <div className="flex-1"><div className="mb-1 flex justify-between text-xs text-gray-500"><span>Income</span><span>R{inc.toLocaleString()}</span></div><div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700"><div className="h-2 rounded-full bg-green-500" style={{ width: `${(inc / maxV) * 100}%` }} /></div></div>
                          <div className="flex-1"><div className="mb-1 flex justify-between text-xs text-gray-500"><span>Expenses</span><span>R{exp.toLocaleString()}</span></div><div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700"><div className="h-2 rounded-full bg-red-500" style={{ width: `${(exp / maxV) * 100}%` }} /></div></div>
                        </div>
                      </div>
                    ); }); })()}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
