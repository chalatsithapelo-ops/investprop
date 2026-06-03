import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Building2,
  Users,
  FileText,
  Landmark,
  ScrollText,
  Scale,
  ClipboardList,
  Activity,
  BarChart3,
} from 'lucide-react';
import { Navbar } from '~/components/Navbar';
import { useTRPC } from '~/trpc/react';
import { useAuthStore } from '~/stores/authStore';

const MANAGER_ROLES = ['DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PROPERTY_OWNER', 'OWNER'];

const CATEGORY_ICONS: Record<string, any> = {
  'A': Landmark,
  'B': Users,
  'C': ScrollText,
  'D': Scale,
  'E': BarChart3,
  'F': Building2,
  'G': ClipboardList,
};

export const Route = createFileRoute('/fsca-readiness/')({
  component: FSCAReadinessPage,
});

function FSCAReadinessPage() {
  const trpc = useTRPC();
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
          <p className="mt-2 text-gray-500">Only managers can access the FSCA readiness assessment.</p>
          <button onClick={() => navigate({ to: '/dashboard' })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const readinessQuery = useQuery({
    ...trpc.getFSCAReadiness.queryOptions({ authToken: authToken ?? '' }),
    enabled: !!authToken,
  });

  const data = readinessQuery.data as any;
  const readiness = data?.overallReadiness ?? 0;
  const checklist = (data?.checklist ?? []) as any[];
  const summary = data?.summary ?? {};
  const docInventory = data?.documentInventory ?? {};

  const getReadinessColor = (pct: number) => {
    if (pct >= 80) return 'text-emerald-600';
    if (pct >= 50) return 'text-yellow-400';
    return 'text-red-600';
  };

  const getReadinessBg = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getReadinessLabel = (pct: number) => {
    if (pct >= 80) return 'Ready for Submission';
    if (pct >= 50) return 'Partially Ready';
    return 'Significant Gaps';
  };

  const fmt = (n: number) => `R${(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <ShieldCheck className="text-gold-600" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">FSCA Readiness Assessment</h1>
            <p className="text-gray-500">Financial Sector Conduct Authority compliance checklist per CISCA, FICA &amp; Companies Act</p>
          </div>
        </div>

        {readinessQuery.isLoading ? (
          <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" /></div>
        ) : readinessQuery.isError ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center">
            <p className="text-red-600">Failed to load readiness data. Please try again.</p>
          </div>
        ) : (
          <>
            {/* Overall Readiness */}
            <div className="mb-8 rounded-xl border border-navy-800/50 bg-navy-900/50 p-8">
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <div className="relative flex h-40 w-40 items-center justify-center">
                  <svg className="h-40 w-40" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#1e293b" strokeWidth="12" />
                    <circle cx="80" cy="80" r="70" fill="none" stroke={readiness >= 80 ? '#10b981' : readiness >= 50 ? '#eab308' : '#ef4444'} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(readiness / 100) * 440} 440`} transform="rotate(-90 80 80)" />
                  </svg>
                  <div className="absolute text-center">
                    <span className={`text-4xl font-bold ${getReadinessColor(readiness)}`}>{Math.round(readiness)}%</span>
                  </div>
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h2 className={`text-2xl font-bold ${getReadinessColor(readiness)}`}>{getReadinessLabel(readiness)}</h2>
                  <p className="mt-2 text-gray-500">
                    Your platform's readiness score based on {checklist.reduce((s: number, c: any) => s + (c.items?.length ?? 0), 0)} compliance items
                    across {checklist.length} regulatory categories. Items marked complete indicate data or processes already in place.
                  </p>
                  <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-navy-800">
                    <div className={`h-full rounded-full transition-all duration-700 ${getReadinessBg(readiness)}`} style={{ width: `${readiness}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Key Stats */}
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Properties', value: summary.totalProperties ?? 0, icon: Building2 },
                { label: 'SPVs', value: summary.totalSPVs ?? 0, icon: Landmark },
                { label: 'Investors', value: summary.totalInvestors ?? 0, icon: Users },
                { label: 'KYC Verified', value: summary.investorsWithKYC ?? 0, icon: ShieldCheck },
                { label: 'Legal Docs', value: summary.legalDocCount ?? 0, icon: FileText },
                { label: 'Audit Logs', value: summary.auditLogCount ?? 0, icon: Activity },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                  <s.icon className="mb-2 text-gold-600" size={18} />
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Financial summary row */}
            <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                <p className="text-sm text-gray-500">Total Share Value</p>
                <p className="mt-1 text-xl font-bold text-gray-900">{fmt(summary.totalShareValue ?? 0)}</p>
                <p className="text-xs text-gray-500">{summary.totalSharesIssued?.toLocaleString() ?? 0} shares issued</p>
              </div>
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                <p className="text-sm text-gray-500">Total Distributed</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">{fmt(summary.totalDistributed ?? 0)}</p>
                <p className="text-xs text-gray-500">Tax withheld: {fmt(summary.totalTaxWithheld ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                <p className="text-sm text-gray-500">Management Fees</p>
                <p className="mt-1 text-xl font-bold text-gold-600">{fmt(summary.totalManagementFees ?? 0)}</p>
                <p className="text-xs text-gray-500">{summary.acquisitionCount ?? 0} acquisitions recorded</p>
              </div>
            </div>

            {/* Checklist */}
            <h2 className="mb-4 text-xl font-bold text-gray-900">Compliance Checklist</h2>
            <div className="space-y-4">
              {checklist.map((cat: any, ci: number) => {
                const doneCount = cat.items?.filter((i: any) => i.done).length ?? 0;
                const totalCount = cat.items?.length ?? 0;
                const catPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
                const letter = cat.category?.charAt(0) ?? 'A';
                const Icon = CATEGORY_ICONS[letter] ?? ClipboardList;

                return (
                  <div key={ci} className="rounded-xl border border-navy-800/50 bg-navy-900/50 overflow-hidden">
                    <div className="flex items-start gap-4 p-5">
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${catPct === 100 ? 'bg-emerald-50' : catPct > 0 ? 'bg-yellow-500/10' : 'bg-red-50'}`}>
                        <Icon className={`${catPct === 100 ? 'text-emerald-600' : catPct > 0 ? 'text-yellow-400' : 'text-red-600'}`} size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-semibold text-gray-900">{cat.category}</h3>
                          <span className={`text-sm font-bold ${getReadinessColor(catPct)}`}>{doneCount}/{totalCount}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{cat.description}</p>
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-navy-800">
                          <div className={`h-full rounded-full transition-all ${getReadinessBg(catPct)}`} style={{ width: `${catPct}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-navy-800/50 bg-navy-950/30 px-5 py-3">
                      <div className="space-y-2">
                        {(cat.items ?? []).map((item: any, ii: number) => (
                          <div key={ii} className="flex items-start gap-3">
                            {item.done ? (
                              <CheckCircle2 className="mt-0.5 flex-shrink-0 text-emerald-600" size={16} />
                            ) : (
                              <XCircle className="mt-0.5 flex-shrink-0 text-red-600" size={16} />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${item.done ? 'text-gray-600' : 'text-gray-500'}`}>{item.label}</p>
                              <p className="text-xs text-gray-600">{item.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Document Inventory */}
            <h2 className="mb-4 mt-8 text-xl font-bold text-gray-900">Document Inventory</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'MOI', count: docInventory.moi ?? 0 },
                { label: 'Shareholder Agreements', count: docInventory.shareholderAgreements ?? 0 },
                { label: 'Share Certificates', count: docInventory.shareCertificates ?? 0 },
                { label: 'Tax Certificates', count: docInventory.taxCertificates ?? 0 },
                { label: 'Compliance Reports', count: docInventory.complianceReports ?? 0 },
                { label: 'Distribution Statements', count: docInventory.distributionStatements ?? 0 },
                { label: 'Cession of Rights', count: docInventory.cessionOfRights ?? 0 },
                { label: 'KYC Documents', count: docInventory.kycDocuments ?? 0 },
              ].map((d) => (
                <div key={d.label} className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                  <FileText className={`mb-2 ${d.count > 0 ? 'text-emerald-600' : 'text-gray-600'}`} size={18} />
                  <p className="text-xl font-bold text-gray-900">{d.count}</p>
                  <p className="text-xs text-gray-500">{d.label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
