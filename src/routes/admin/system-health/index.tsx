import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Activity,
  Cpu,
  Users,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { QueryState } from "~/components/QueryState";
import { useAuthStore } from "~/stores/authStore";
import { useTRPC } from "~/trpc/react";

export const Route = createFileRoute("/admin/system-health/")({
  component: SystemHealthPage,
});

function SystemHealthPage() {
  const trpc = useTRPC();
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") nav({ to: "/dashboard" });
  }, [user]);

  const q = useQuery({
    ...trpc.getSystemHealth.queryOptions({ authToken: token ?? "" }),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">System Health</h1>
        <p className="mb-6 text-sm text-gray-500">
          Live operational dashboard — refreshes every 30 seconds.
        </p>

        <QueryState query={q} loadingLabel="Reading system telemetry…">
          {q.data && <Dashboard data={q.data} />}
        </QueryState>
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: any }) {
  const uptimeHrs = Math.floor((data.uptime ?? 0) / 3600);
  const uptimeMins = Math.floor(((data.uptime ?? 0) % 3600) / 60);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Cpu} label="Uptime" value={`${uptimeHrs}h ${uptimeMins}m`} tone="good" />
        <Stat
          icon={Activity}
          label="Memory"
          value={`${data.memory.used} / ${data.memory.total} MB`}
          tone={data.memory.used / data.memory.total > 0.85 ? "warn" : "good"}
        />
        <Stat icon={Users} label="Users (total)" value={data.users.total} tone="info" />
        <Stat
          icon={Building2}
          label="Active properties"
          value={data.properties.active}
          tone="info"
        />
      </div>

      <Card title="User growth">
        <Row label="New users (24h)" value={data.users.new24h} />
        <Row label="New users (7d)" value={data.users.new7d} />
        <Row label="Logins last hour" value={data.activity.logins1h} />
      </Card>

      <Card title="Workload queues">
        <Row
          label="Pending contributions"
          value={data.workload.pendingContributions}
          warn={data.workload.pendingContributions > 10}
        />
        <Row
          label="Payment proofs awaiting review"
          value={data.workload.pendingPayments}
          warn={data.workload.pendingPayments > 10}
        />
        <Row
          label="FICA verifications pending"
          value={data.workload.pendingFica}
          warn={data.workload.pendingFica > 5}
        />
      </Card>

      <Card title="Audit activity (24h)">
        <Row label="Events recorded" value={data.activity.auditEvents24h} />
        <Row
          label="Error events"
          value={data.activity.errorAuditEvents24h}
          warn={data.activity.errorAuditEvents24h > 0}
        />
      </Card>

      <p className="text-xs text-gray-400">
        Snapshot at {new Date(data.timestamp).toLocaleString("en-ZA")}
      </p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: any) {
  const toneCls = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
  }[tone as "good" | "info" | "warn"];
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm`}>
      <div className={`mb-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${toneCls}`}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <span
        className={`inline-flex items-center gap-1 text-sm font-semibold ${
          warn ? "text-amber-700" : "text-gray-900"
        }`}
      >
        {warn ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        {value}
      </span>
    </div>
  );
}
