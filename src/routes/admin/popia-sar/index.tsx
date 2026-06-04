import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useAuthStore } from "~/stores/authStore";
import { useTRPC } from "~/trpc/react";

export const Route = createFileRoute("/admin/popia-sar/")({
  component: PopiaSarPage,
});

function PopiaSarPage() {
  const trpc = useTRPC();
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [userId, setUserId] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") nav({ to: "/dashboard" });
  }, [user]);

  const trpcReact = useTRPC();

  const runExport = async () => {
    setExporting(true);
    try {
      const id = userId ? parseInt(userId, 10) : undefined;
      // call as query via fetch helper
      const res = await fetch(
        `/trpc/popiaSubjectAccessExport?input=${encodeURIComponent(
          JSON.stringify({ json: { authToken: token, userId: id } })
        )}`,
        { method: "GET", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const data = body.result?.data?.json ?? body.result?.data;
      if (!data) throw new Error("Empty response");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `popia-sar-user-${id ?? "self"}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-gold-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">POPIA Subject Access Request</h1>
            <p className="text-sm text-gray-500">
              Export every personal data record for a data subject in a single JSON file.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <label
            htmlFor="userId"
            className="mb-1 block text-sm font-semibold text-gray-700"
          >
            Subject user ID
          </label>
          <input
            id="userId"
            type="number"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Leave blank to export your own data"
            className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-gold-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            The export includes the user record, all contributions, owned properties, generated
            documents, the 500 most recent audit-trail events, and all notifications. Sensitive
            fields (password hash) are stripped.
          </p>

          <button
            type="button"
            onClick={runExport}
            disabled={exporting}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-700 disabled:opacity-50"
          >
            {exporting ? <FileText className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
            {exporting ? "Compiling export…" : "Download SAR export (JSON)"}
          </button>

          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <strong>Legal basis:</strong> POPIA s23 (right of access). Retention: personal data is
            kept for 7 years post-account closure per FICA s42. Every export is itself audit-logged.
          </div>
        </div>
      </div>
    </div>
  );
}
