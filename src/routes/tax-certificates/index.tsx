import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Receipt, Download, Loader2, Calendar, Info } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { downloadTaxCertificatePDF } from "~/utils/generate-tax-certificate-pdf";
import toast from "react-hot-toast";

export const Route = createFileRoute("/tax-certificates/")({
  component: TaxCertificatesPage,
});

const CLASSIFICATION_LABELS: Record<string, string> = {
  DIVIDEND: "Local Dividends",
  INTEREST: "Local Interest",
  RENTAL_INCOME: "Rental Income",
  CAPITAL_GAIN: "Capital Gain",
};

function currentSaTaxYear(): number {
  const now = new Date();
  // SA tax year ends end of February. After 1 March, we are in the next tax year.
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

function money(n: number): string {
  return `R ${(Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function TaxCertificatesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const thisYear = currentSaTaxYear();
  const years = useMemo(
    () => Array.from({ length: 6 }, (_, i) => thisYear - i),
    [thisYear],
  );
  const [taxYear, setTaxYear] = useState<number>(thisYear);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const certQuery = useQuery({
    ...trpc.generateTaxCertificate.queryOptions({
      authToken: authToken ?? "",
      taxYear,
    }),
    enabled: !!authToken,
  });

  const data = certQuery.data as any;
  const classes: string[] = data ? Object.keys(data.summary ?? {}) : [];
  const hasIncome = (data?.payoutCount ?? 0) > 0;

  const handleDownload = () => {
    if (!data) return;
    try {
      setDownloading(true);
      downloadTaxCertificatePDF(data);
      toast.success("Tax summary PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Receipt className="text-gold-600" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tax Certificates</h1>
            <p className="text-gray-500">
              Download your annual IT3 income summary for SARS filing
            </p>
          </div>
        </div>

        {/* Year selector */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
          <Calendar size={18} className="text-gold-500" />
          <label htmlFor="taxYear" className="text-sm font-medium text-gray-700">
            SA tax year
          </label>
          <select
            id="taxYear"
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className="rounded-md border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-gray-100 focus:border-gold-500 focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y} (1 Mar {y - 1} – 28 Feb {y})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!data || !hasIncome || downloading}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-gold-600 px-4 py-2 text-sm font-semibold text-navy-950 transition hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Download IT3 PDF
          </button>
        </div>

        {certQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
          </div>
        ) : certQuery.isError ? (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-6 text-sm text-red-300">
            {(certQuery.error as any)?.message ?? "Failed to load tax summary"}
          </div>
        ) : !hasIncome ? (
          <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-10 text-center">
            <Receipt className="mx-auto mb-3 text-gray-600" size={40} />
            <p className="text-gray-400">
              No distribution income was paid to you in the {taxYear} tax year.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Gross income
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-100">
                  {money(data.totalGross)}
                </p>
              </div>
              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Tax withheld
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-400">
                  {money(data.totalTaxWithheld)}
                </p>
              </div>
              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Net received
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-400">
                  {money(data.totalNet)}
                </p>
              </div>
            </div>

            {/* Breakdown table */}
            <div className="overflow-hidden rounded-lg border border-navy-800/50 bg-navy-900/50">
              <table className="w-full text-sm">
                <thead className="bg-navy-800/60 text-left text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Classification</th>
                    <th className="px-4 py-3 text-right">Payouts</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-4 py-3 text-right">Tax withheld</th>
                    <th className="px-4 py-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800/50">
                  {classes.map((cls) => {
                    const row = data.summary[cls];
                    return (
                      <tr key={cls} className="text-gray-200">
                        <td className="px-4 py-3 font-medium">
                          {CLASSIFICATION_LABELS[cls] ?? cls}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {row.count}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {money(row.gross)}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-400">
                          {money(row.taxWithheld)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-400">
                          {money(row.net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Disclaimer */}
            <div className="flex gap-3 rounded-lg border border-gold-700/40 bg-gold-950/20 p-4 text-xs text-gray-400">
              <Info size={16} className="mt-0.5 shrink-0 text-gold-500" />
              <p>{data.disclaimer}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
