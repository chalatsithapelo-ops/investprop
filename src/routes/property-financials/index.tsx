import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DollarSign, Plus, Trash2, TrendingUp, TrendingDown, BarChart3, Calendar, Building2, ShieldAlert, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Navbar } from '~/components/Navbar';
import { useTRPC } from '~/trpc/react';
import { useAuthStore } from '~/stores/authStore';
import toast from 'react-hot-toast';

const MANAGER_ROLES = ['DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PROPERTY_OWNER', 'OWNER'];

const INCOME_CATEGORIES = [
  { value: 'RENTAL_INCOME', label: 'Rental Income' },
  { value: 'SALE_PROCEEDS', label: 'Sale Proceeds' },
  { value: 'INTEREST_INCOME', label: 'Interest Income' },
  { value: 'OTHER_INCOME', label: 'Other Income' },
];

const EXPENSE_CATEGORIES = [
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'PROPERTY_TAX', label: 'Property Tax' },
  { value: 'MANAGEMENT_FEE', label: 'Management Fee' },
  { value: 'LEGAL_FEES', label: 'Legal Fees' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'TRANSFER_DUTY', label: 'Transfer Duty' },
  { value: 'CONVEYANCING', label: 'Conveyancing' },
  { value: 'RATES_AND_LEVIES', label: 'Rates & Levies' },
  { value: 'OTHER_EXPENSE', label: 'Other Expense' },
];

export const Route = createFileRoute('/property-financials/')({
  component: PropertyFinancialsPage,
});

function PropertyFinancialsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: '/login' });
  }, [user, authToken, hasHydrated]);

  const isManager = MANAGER_ROLES.includes(user?.role ?? '');
  if (!user || !authToken) return null;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950"><Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access Restricted</h1>
          <p className="mt-2 text-gray-500">Only managers and property owners can access property financials.</p>
          <button onClick={() => navigate({ to: '/dashboard' })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tab, setTab] = useState<'summary' | 'entries' | 'cashflow'>('summary');
  const [entryForm, setEntryForm] = useState({
    type: 'INCOME' as 'INCOME' | 'EXPENSE',
    category: 'RENTAL_INCOME',
    amount: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({}),
    enabled: !!authToken,
  });

  const summaryQuery = useQuery({
    ...trpc.getFinancialSummary.queryOptions({ authToken: authToken ?? '', propertyId: selectedPropertyId ?? 0 }),
    enabled: !!authToken && !!selectedPropertyId,
  });

  const entriesQuery = useQuery({
    ...trpc.getFinancialEntries.queryOptions({ authToken: authToken ?? '', propertyId: selectedPropertyId ?? 0 }),
    enabled: !!authToken && !!selectedPropertyId,
  });

  const cashFlowQuery = useQuery({
    ...trpc.getMonthlyCashFlow.queryOptions({ authToken: authToken ?? '', propertyId: selectedPropertyId ?? 0 }),
    enabled: !!authToken && !!selectedPropertyId,
  });

  const createMutation = useMutation(
    trpc.createFinancialEntry.mutationOptions({
      onSuccess: () => {
        toast.success('Financial entry added');
        qc.invalidateQueries({ queryKey: trpc.getFinancialEntries.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.getFinancialSummary.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.getMonthlyCashFlow.queryKey() });
        setShowAddForm(false);
        setEntryForm({ type: 'INCOME', category: 'RENTAL_INCOME', amount: '', description: '', date: new Date().toISOString().slice(0, 10) });
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const deleteMutation = useMutation(
    trpc.deleteFinancialEntry.mutationOptions({
      onSuccess: () => {
        toast.success('Entry deleted');
        qc.invalidateQueries({ queryKey: trpc.getFinancialEntries.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.getFinancialSummary.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.getMonthlyCashFlow.queryKey() });
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const properties = (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const propertiesArr = Array.isArray(properties) ? properties : [];
  const summary = summaryQuery.data as any;
  const entries = (entriesQuery.data ?? []) as any[];
  const cashFlow = (cashFlowQuery.data ?? []) as any[];

  const fmt = (n: number) => `R${(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <DollarSign className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Property Financials</h1>
              <p className="text-gray-500">Track income, expenses and cash flow per property</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedPropertyId ?? ''}
              onChange={(e) => setSelectedPropertyId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2 text-sm text-gray-900"
            >
              <option value="">Select Property</option>
              {propertiesArr.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            {selectedPropertyId && (
              <button onClick={() => setShowAddForm(!showAddForm)} className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600">
                <Plus size={16} /> Add Entry
              </button>
            )}
          </div>
        </div>

        {!selectedPropertyId ? (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-16 text-center">
            <Building2 className="mx-auto mb-4 text-gray-600" size={48} />
            <p className="text-lg text-gray-500">Select a property to view its financial data</p>
          </div>
        ) : (
          <>
            {/* Add Entry Form */}
            {showAddForm && (
              <div className="mb-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Add Financial Entry</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Type</label>
                    <select value={entryForm.type} onChange={(e) => {
                      const t = e.target.value as 'INCOME' | 'EXPENSE';
                      setEntryForm({ ...entryForm, type: t, category: t === 'INCOME' ? 'RENTAL_INCOME' : 'MAINTENANCE' });
                    }} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-gray-900">
                      <option value="INCOME">Income</option>
                      <option value="EXPENSE">Expense</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Category</label>
                    <select value={entryForm.category} onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-gray-900">
                      {(entryForm.type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Amount (R)</label>
                    <input type="number" min="0" step="0.01" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} placeholder="0.00" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-gray-900" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Date</label>
                    <input type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-gray-900" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={() => {
                      if (!entryForm.amount || Number(entryForm.amount) <= 0) { toast.error('Enter a valid amount'); return; }
                      createMutation.mutate({
                        authToken: authToken ?? '',
                        propertyId: selectedPropertyId!,
                        type: entryForm.type,
                        category: entryForm.category as 'RENTAL_INCOME' | 'SALE_PROCEEDS' | 'INTEREST_INCOME' | 'OTHER_INCOME' | 'MAINTENANCE' | 'INSURANCE' | 'PROPERTY_TAX' | 'MANAGEMENT_FEE' | 'LEGAL_FEES' | 'UTILITIES' | 'TRANSFER_DUTY' | 'CONVEYANCING' | 'RATES_AND_LEVIES' | 'OTHER_EXPENSE',
                        amount: Number(entryForm.amount),
                        description: entryForm.description || entryForm.category.replace(/_/g, ' '),
                        date: entryForm.date,
                      });
                    }} disabled={createMutation.isPending} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      {createMutation.isPending ? 'Saving...' : 'Save Entry'}
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <input type="text" placeholder="Description (optional)" value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-sm text-gray-900" />
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-navy-900/50 p-1">
              {(['summary', 'entries', 'cashflow'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-gold-500 text-white' : 'text-gray-500 hover:text-gold-600'}`}>
                  {t === 'summary' ? 'P&L Summary' : t === 'entries' ? 'All Entries' : 'Monthly Cash Flow'}
                </button>
              ))}
            </div>

            {/* Summary Tab */}
            {tab === 'summary' && (
              <div>
                {summaryQuery.isLoading ? (
                  <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" /></div>
                ) : !summary ? (
                  <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-12 text-center text-gray-500">No financial data yet. Add income and expense entries above.</div>
                ) : (
                  <>
                    {/* Top Cards */}
                    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                        <div className="flex items-center gap-2 text-emerald-600"><ArrowUpRight size={18} /><span className="text-sm">Total Income</span></div>
                        <p className="mt-2 text-2xl font-bold text-gray-900">{fmt(summary.totalIncome)}</p>
                      </div>
                      <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                        <div className="flex items-center gap-2 text-red-600"><ArrowDownRight size={18} /><span className="text-sm">Total Expenses</span></div>
                        <p className="mt-2 text-2xl font-bold text-gray-900">{fmt(summary.totalExpenses)}</p>
                      </div>
                      <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                        <div className={`flex items-center gap-2 ${summary.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {summary.netIncome >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                          <span className="text-sm">Net Income</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-gray-900">{fmt(summary.netIncome)}</p>
                      </div>
                      <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                        <div className="flex items-center gap-2 text-gold-600"><BarChart3 size={18} /><span className="text-sm">Gross Yield</span></div>
                        <p className="mt-2 text-2xl font-bold text-gray-900">{(summary.grossYield ?? 0).toFixed(1)}%</p>
                        <p className="text-xs text-gray-500">Net: {(summary.netYield ?? 0).toFixed(1)}%</p>
                      </div>
                    </div>

                    {/* Category Breakdown */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                        <h3 className="mb-4 text-lg font-semibold text-emerald-600">Income Breakdown</h3>
                        {summary.incomeByCategory && Object.keys(summary.incomeByCategory).length > 0 ? (
                          <div className="space-y-3">
                            {Object.entries(summary.incomeByCategory).map(([cat, amt]: [string, any]) => (
                              <div key={cat} className="flex items-center justify-between">
                                <span className="text-sm text-gray-600">{cat.replace(/_/g, ' ')}</span>
                                <span className="text-sm font-medium text-emerald-600">{fmt(amt)}</span>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-sm text-gray-500">No income recorded</p>}
                      </div>
                      <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                        <h3 className="mb-4 text-lg font-semibold text-red-600">Expense Breakdown</h3>
                        {summary.expenseByCategory && Object.keys(summary.expenseByCategory).length > 0 ? (
                          <div className="space-y-3">
                            {Object.entries(summary.expenseByCategory).map(([cat, amt]: [string, any]) => (
                              <div key={cat} className="flex items-center justify-between">
                                <span className="text-sm text-gray-600">{cat.replace(/_/g, ' ')}</span>
                                <span className="text-sm font-medium text-red-600">{fmt(amt)}</span>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-sm text-gray-500">No expenses recorded</p>}
                      </div>
                    </div>

                    {/* Monthly Breakdown */}
                    {summary.monthlyBreakdown && summary.monthlyBreakdown.length > 0 && (
                      <div className="mt-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                        <h3 className="mb-4 text-lg font-semibold text-gray-900">Monthly P&L</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-navy-800/50 text-gray-500">
                                <th className="px-4 py-2 text-left">Month</th>
                                <th className="px-4 py-2 text-right">Income</th>
                                <th className="px-4 py-2 text-right">Expenses</th>
                                <th className="px-4 py-2 text-right">Net</th>
                              </tr>
                            </thead>
                            <tbody>
                              {summary.monthlyBreakdown.map((m: any, i: number) => (
                                <tr key={i} className="border-b border-navy-800/30">
                                  <td className="px-4 py-2 text-gray-600">{m.month}</td>
                                  <td className="px-4 py-2 text-right text-emerald-600">{fmt(m.income)}</td>
                                  <td className="px-4 py-2 text-right text-red-600">{fmt(m.expenses)}</td>
                                  <td className={`px-4 py-2 text-right font-medium ${m.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(m.net)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Entries Tab */}
            {tab === 'entries' && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
                {entriesQuery.isLoading ? (
                  <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" /></div>
                ) : entries.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">No entries yet. Click "Add Entry" to record income or expenses.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-navy-800/50 bg-navy-950 text-gray-500">
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Type</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Description</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e: any) => (
                          <tr key={e.id} className="border-b border-navy-800/30 hover:bg-navy-800/20">
                            <td className="px-4 py-3 text-gray-600">{new Date(e.date).toLocaleDateString('en-ZA')}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.type === 'INCOME' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                {e.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{(e.category ?? '').replace(/_/g, ' ')}</td>
                            <td className="px-4 py-3 text-gray-500">{e.description ?? '\u2014'}</td>
                            <td className={`px-4 py-3 text-right font-medium ${e.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {e.type === 'INCOME' ? '+' : '-'}{fmt(e.amount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => { if (confirm('Delete this entry?')) deleteMutation.mutate({ authToken: authToken ?? '', entryId: e.id }); }} className="rounded p-1 text-gray-500 hover:text-red-600">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Cash Flow Tab */}
            {tab === 'cashflow' && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                <h3 className="mb-4 text-lg font-semibold text-gray-900 flex items-center gap-2"><Calendar size={18} className="text-gold-600" /> Monthly Cash Flow</h3>
                {cashFlowQuery.isLoading ? (
                  <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" /></div>
                ) : cashFlow.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No cash flow data available</p>
                ) : (
                  <div className="space-y-2">
                    {cashFlow.map((m: any, i: number) => {
                      const maxVal = Math.max(...cashFlow.map((c: any) => Math.max(c.income ?? 0, c.expenses ?? 0, 1)));
                      const incomeWidth = ((m.income ?? 0) / maxVal) * 100;
                      const expenseWidth = ((m.expenses ?? 0) / maxVal) * 100;
                      return (
                        <div key={i} className="rounded-lg border border-navy-800/30 bg-navy-800/20 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-600">{m.month}</span>
                            <span className={`text-sm font-bold ${(m.net ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(m.net ?? 0)}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="w-16 text-xs text-emerald-600">Income</span>
                              <div className="flex-1 overflow-hidden rounded-full bg-navy-800/50 h-3">
                                <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${incomeWidth}%` }} />
                              </div>
                              <span className="w-24 text-right text-xs text-emerald-600">{fmt(m.income ?? 0)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-16 text-xs text-red-600">Expense</span>
                              <div className="flex-1 overflow-hidden rounded-full bg-navy-800/50 h-3">
                                <div className="h-full rounded-full bg-red-500/60" style={{ width: `${expenseWidth}%` }} />
                              </div>
                              <span className="w-24 text-right text-xs text-red-600">{fmt(m.expenses ?? 0)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
