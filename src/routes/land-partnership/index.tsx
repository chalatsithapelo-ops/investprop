import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  Landmark,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  ArrowLeft,
  Loader2,
  Ban,
  MapPin,
  FileSignature,
  ShieldCheck,
  Building2,
  PenLine,
  Printer,
  Handshake,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/land-partnership/")({
  component: LandPartnershipPage,
});

const PROVINCES = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  SUBMITTED: { label: "Submitted", color: "bg-amber-100 text-amber-700", icon: Clock },
  UNDER_REVIEW: { label: "Under Review", color: "bg-blue-100 text-blue-700", icon: Eye },
  APPROVED: { label: "Approved", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  AGREEMENT_READY: {
    label: "Ready to Sign",
    color: "bg-gold-100 text-gold-700",
    icon: FileSignature,
  },
  SIGNED: { label: "Signed", color: "bg-indigo-100 text-indigo-700", icon: PenLine },
  COUNTERSIGNED: {
    label: "Executed",
    color: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  },
  SPV_FORMED: { label: "SPV Formed", color: "bg-teal-100 text-teal-700", icon: Building2 },
  ACTIVE: { label: "Active", color: "bg-emerald-100 text-emerald-700", icon: Handshake },
  REJECTED: { label: "Declined", color: "bg-red-100 text-red-700", icon: XCircle },
  WITHDRAWN: { label: "Withdrawn", color: "bg-gray-100 text-gray-600", icon: Ban },
};

const ZAR = (n?: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 0,
      }).format(n);

function LandPartnershipPage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [showForm, setShowForm] = useState(false);
  const [signing, setSigning] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    if (user && user.role !== "PROPERTY_OWNER") navigate({ to: "/land-partnerships" });
  }, [user, authToken, hasHydrated]);

  const listQuery = useQuery({
    ...trpc.getMyLandPartnerships.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && user?.role === "PROPERTY_OWNER",
  });
  const items = (listQuery.data as any[]) ?? [];

  const withdrawMutation = useMutation({
    mutationFn: (id: number) =>
      trpcClient.withdrawLandPartnership.mutate({ authToken: authToken ?? "", id }),
    onSuccess: () => {
      toast.success("Submission withdrawn");
      queryClient.invalidateQueries({ queryKey: trpc.getMyLandPartnerships.queryKey() });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to withdraw"),
  });

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
              <Landmark className="text-gold-500" /> Partner My Property
            </h1>
            <p className="mt-1 text-gray-500">
              Contribute your property or land into a ring-fenced company — to develop, renovate or
              flip. You keep equity, we fund and do everything.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-gold-600"
          >
            {showForm ? (
              <>
                <ArrowLeft size={16} /> Back
              </>
            ) : (
              <>
                <Plus size={16} /> Submit My Property
              </>
            )}
          </button>
        </div>

        {/* How it works */}
        {!showForm && (
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Landmark,
                title: "You bring the property",
                body: "Contribute only your property or land — vacant land, or a building to renovate or flip. No cash required from you.",
              },
              {
                icon: Building2,
                title: "We do everything",
                body: "Funding, approvals, design, construction/renovation and sales — all handled by Investprop.",
              },
              {
                icon: ShieldCheck,
                title: "You keep 20% equity",
                body: "Your property goes into a ring-fenced SPV in which you hold a 20% shareholding.",
              },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <c.icon className="mb-2 text-gold-500" size={22} />
                <h3 className="text-sm font-semibold text-gray-900">{c.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{c.body}</p>
              </div>
            ))}
          </div>
        )}

        {showForm ? (
          <SubmitForm
            onDone={() => {
              setShowForm(false);
              queryClient.invalidateQueries({ queryKey: trpc.getMyLandPartnerships.queryKey() });
            }}
          />
        ) : listQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-gold-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <Landmark className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-gray-500">
              You haven't submitted any property yet. Click <strong>Submit My Property</strong> to
              start.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((lp) => {
              const cfg = STATUS_CONFIG[lp.status] ?? STATUS_CONFIG.SUBMITTED;
              const Icon = cfg.icon;
              return (
                <div
                  key={lp.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{lp.landTitle}</h3>
                        <span className="font-mono text-xs text-gray-400">{lp.referenceCode}</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                        <MapPin size={14} /> {lp.address}, {lp.city}, {lp.province}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                        <span>
                          Est. land value: <strong>{ZAR(lp.estimatedLandValue)}</strong>
                        </span>
                        <span>
                          Your equity: <strong>{lp.ownerEquityPct}%</strong>
                        </span>
                        {lp.spv?.name && (
                          <span>
                            SPV: <strong>{lp.spv.name}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cfg.color}`}
                    >
                      <Icon size={13} /> {cfg.label}
                    </span>
                  </div>

                  {lp.reviewNotes && (
                    <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                      <strong>Notes from our team:</strong> {lp.reviewNotes}
                    </p>
                  )}
                  {lp.rejectedReason && lp.status === "REJECTED" && (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      <strong>Reason:</strong> {lp.rejectedReason}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {lp.status === "AGREEMENT_READY" && (
                      <button
                        onClick={() => setSigning(lp)}
                        className="flex items-center gap-1.5 rounded-lg bg-gold-500 px-3 py-2 text-sm font-semibold text-white hover:bg-gold-600"
                      >
                        <FileSignature size={15} /> Review &amp; Sign Agreement
                      </button>
                    )}
                    {lp.agreementContent && (
                      <>
                        <button
                          onClick={() => setViewing(lp)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Eye size={15} /> View Agreement
                        </button>
                        <Link
                          to="/land-partnership/$id/agreement"
                          params={{ id: String(lp.id) }}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Printer size={15} /> Print
                        </Link>
                      </>
                    )}
                    {["SUBMITTED", "UNDER_REVIEW", "APPROVED", "AGREEMENT_READY"].includes(
                      lp.status,
                    ) && (
                      <button
                        onClick={() => {
                          if (confirm("Withdraw this submission?")) withdrawMutation.mutate(lp.id);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
                      >
                        <Ban size={15} /> Withdraw
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {signing && (
        <SignModal
          lp={signing}
          onClose={() => setSigning(null)}
          onSigned={() => {
            setSigning(null);
            queryClient.invalidateQueries({ queryKey: trpc.getMyLandPartnerships.queryKey() });
          }}
        />
      )}
      {viewing && <ViewAgreementModal lp={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* ─── Submit form ─── */
function SubmitForm({ onDone }: { onDone: () => void }) {
  const trpcClient = useTRPCClient();
  const authToken = useAuthStore((s) => s.token);
  const [submitting, setSubmitting] = useState(false);
  const [f, setF] = useState<Record<string, any>>({
    province: "Gauteng",
    bondStatus: "NONE",
    ratesStatus: "CURRENT",
    intendedStrategy: "DEVELOP",
  });
  const [popia, setPopia] = useState(false);
  const set = (k: string, v: any) => setF((prev) => ({ ...prev, [k]: v }));

  const num = (v: any) => (v === "" || v == null ? undefined : Number(v));

  const submit = async () => {
    if (!popia) {
      toast.error("Please consent to POPIA processing to continue.");
      return;
    }
    setSubmitting(true);
    try {
      await trpcClient.submitLandPartnership.mutate({
        authToken: authToken ?? "",
        ownerFullName: f.ownerFullName,
        ownerIdNumber: f.ownerIdNumber || undefined,
        ownerPhone: f.ownerPhone || undefined,
        ownerEmail: f.ownerEmail || undefined,
        ownerAddress: f.ownerAddress || undefined,
        ownerEntityName: f.ownerEntityName || undefined,
        ownerEntityRegNumber: f.ownerEntityRegNumber || undefined,
        landTitle: f.landTitle,
        landDescription: f.landDescription,
        address: f.address,
        city: f.city,
        province: f.province,
        erfNumber: f.erfNumber || undefined,
        titleDeedNumber: f.titleDeedNumber || undefined,
        erfSize: num(f.erfSize),
        currentZoning: f.currentZoning || undefined,
        currentUse: f.currentUse || undefined,
        municipalValue: num(f.municipalValue),
        estimatedLandValue: num(f.estimatedLandValue),
        bondStatus: f.bondStatus,
        bondOutstanding: num(f.bondOutstanding),
        bondBank: f.bondBank || undefined,
        ratesStatus: f.ratesStatus,
        ratesArrears: num(f.ratesArrears),
        coOwners: f.coOwners || undefined,
        developmentType: f.developmentType || undefined,
        intendedStrategy: f.intendedStrategy,
        proposedUnits: num(f.proposedUnits),
        estimatedGDV: num(f.estimatedGDV),
        estimatedBuildCost: num(f.estimatedBuildCost),
        popiaConsent: true,
      });
      toast.success("Your property has been submitted for a development partnership.");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const Input = ({
    label,
    k,
    type = "text",
    required,
    placeholder,
  }: {
    label: string;
    k: string;
    type?: string;
    required?: boolean;
    placeholder?: string;
  }) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        type={type}
        value={f[k] ?? ""}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:ring-gold-500"
      />
    </label>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Section title="Your details">
        <Input label="Full name" k="ownerFullName" required placeholder="As on your ID" />
        <Input label="ID number" k="ownerIdNumber" />
        <Input label="Phone" k="ownerPhone" />
        <Input label="Email" k="ownerEmail" type="email" />
        <Input label="Residential / postal address" k="ownerAddress" />
      </Section>

      <Section title="If the property is held by a company or trust (optional)">
        <Input label="Entity name" k="ownerEntityName" placeholder="e.g. Family Trust / (Pty) Ltd" />
        <Input label="Registration number" k="ownerEntityRegNumber" />
      </Section>

      <Section title="The property / land">
        <Input label="Short title" k="landTitle" required placeholder="e.g. 2ha vacant stand, or 4-bed house to flip, Midrand" />
        <Input label="Street address" k="address" required />
        <Input label="City / town" k="city" required />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Province</span>
          <select
            value={f.province}
            onChange={(e) => set("province", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:ring-gold-500"
          >
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <Input label="Erf / stand number" k="erfNumber" />
        <Input label="Title deed number" k="titleDeedNumber" />
        <Input label="Erf size (m²)" k="erfSize" type="number" />
        <Input label="Current zoning" k="currentZoning" placeholder="e.g. Residential 1, Agricultural" />
        <Input label="Current use" k="currentUse" placeholder="e.g. Vacant, Farming, Existing house" />
        <Input label="Municipal value (R)" k="municipalValue" type="number" />
        <Input label="Your estimated property value (R)" k="estimatedLandValue" type="number" />
        <Input label="Other registered owners (if any)" k="coOwners" />
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Describe the property <span className="text-red-500">*</span>
          </span>
          <textarea
            value={f.landDescription ?? ""}
            onChange={(e) => set("landDescription", e.target.value)}
            rows={3}
            placeholder="Location, access, services (water/sewer/electricity), condition of any existing buildings, surroundings, any approvals already in place…"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:ring-gold-500"
          />
        </label>
      </Section>

      <Section title="Bond & rates">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Bond status</span>
          <select
            value={f.bondStatus}
            onChange={(e) => set("bondStatus", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:ring-gold-500"
          >
            <option value="NONE">No bond (paid off)</option>
            <option value="EXISTING">Existing bond</option>
          </select>
        </label>
        {f.bondStatus === "EXISTING" && (
          <>
            <Input label="Bond outstanding (R)" k="bondOutstanding" type="number" />
            <Input label="Bank" k="bondBank" />
          </>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Rates status</span>
          <select
            value={f.ratesStatus}
            onChange={(e) => set("ratesStatus", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:ring-gold-500"
          >
            <option value="CURRENT">Up to date</option>
            <option value="ARREARS">In arrears</option>
          </select>
        </label>
        {f.ratesStatus === "ARREARS" && (
          <Input label="Rates arrears (R)" k="ratesArrears" type="number" />
        )}
      </Section>

      <Section title="Proposed project (your thoughts — optional)">
        <Input
          label="Development / renovation type"
          k="developmentType"
          placeholder="e.g. Residential estate, flats, commercial, full renovation"
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Intended strategy</span>
          <select
            value={f.intendedStrategy}
            onChange={(e) => set("intendedStrategy", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:ring-gold-500"
          >
            <option value="DEVELOP">Develop</option>
            <option value="FLIP">Flip / renovate</option>
            <option value="HOLD">Hold / rent</option>
          </select>
        </label>
        <Input label="Proposed units" k="proposedUnits" type="number" />
        <Input label="Estimated end value / GDV (R)" k="estimatedGDV" type="number" />
        <Input label="Estimated build / renovation cost (R)" k="estimatedBuildCost" type="number" />
      </Section>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={popia}
            onChange={(e) => setPopia(e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-gold-500 focus:ring-gold-500"
          />
          <span className="text-sm text-gray-600">
            I consent, in terms of POPIA, to Investprop processing the personal and property
            information provided here for the purpose of assessing and structuring a development
            partnership. I confirm the information is true and that I am (or represent) the
            registered owner of this property.
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={submit}
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gold-600 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          Submit My Property
        </button>
      </div>
    </div>
  );
}

/* ─── Sign modal ─── */
function SignModal({
  lp,
  onClose,
  onSigned,
}: {
  lp: any;
  onClose: () => void;
  onSigned: () => void;
}) {
  const trpcClient = useTRPCClient();
  const authToken = useAuthStore((s) => s.token);
  const [name, setName] = useState("");
  const [idNo, setIdNo] = useState(lp.ownerIdNumber ?? "");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);

  const sign = async () => {
    if (name.trim().length < 3) {
      toast.error("Please type your full legal name to sign.");
      return;
    }
    if (!accept) {
      toast.error("Please tick the box to accept the agreement terms.");
      return;
    }
    setBusy(true);
    try {
      await trpcClient.signLandPartnership.mutate({
        authToken: authToken ?? "",
        id: lp.id,
        signatureName: name.trim(),
        signatureId: idNo || undefined,
        acceptTerms: true,
      });
      toast.success("Agreement signed. Thank you.");
      onSigned();
    } catch (err: any) {
      toast.error(err?.message ?? "Signing failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileSignature className="text-gold-500" size={20} /> Partnership Agreement —{" "}
            {lp.referenceCode}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <XCircle size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-800">
            {lp.agreementContent}
          </pre>
        </div>
        <div className="space-y-3 border-t border-gray-200 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Type your full legal name to sign <span className="text-red-500">*</span>
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={lp.ownerFullName}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:ring-gold-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">ID number</span>
              <input
                value={idNo}
                onChange={(e) => setIdNo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:ring-gold-500"
              />
            </label>
          </div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-gold-500 focus:ring-gold-500"
            />
            <span className="text-sm text-gray-600">
              I have read and understood this agreement, and by typing my name above I am signing it
              electronically and agreeing to be bound by its terms. I understand this is a legally
              binding electronic signature.
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={sign}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-2 text-sm font-semibold text-white hover:bg-gold-600 disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin" size={16} /> : <PenLine size={16} />}
              Sign Agreement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── View agreement modal ─── */
function ViewAgreementModal({ lp, onClose }: { lp: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Agreement — {lp.referenceCode}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <XCircle size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-800">
            {lp.agreementContent}
          </pre>
        </div>
      </div>
    </div>
  );
}
