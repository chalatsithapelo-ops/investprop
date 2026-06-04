import { Clock, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";

type Contribution = {
  id: number;
  contributionAmount: number;
  coolingOffExpiresAt?: string | Date | null;
  property?: { title?: string };
};

type Props = {
  contributions: Contribution[];
  onCancel: (id: number) => void;
  cancelling?: boolean;
};

/**
 * Phase 9 cooling-off banner — POPIA / CISCA mandates a withdrawal window.
 * Lists every contribution still inside the cooling-off period and exposes
 * an in-place "Cancel & refund" action.
 */
export function CoolingOffBanner({ contributions, onCancel, cancelling }: Props) {
  const [pendingId, setPendingId] = useState<number | null>(null);

  const active = useMemo(() => {
    const now = Date.now();
    return contributions.filter(
      (c) => c.coolingOffExpiresAt && new Date(c.coolingOffExpiresAt).getTime() > now
    );
  }, [contributions]);

  if (active.length === 0) return null;

  return (
    <>
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 text-blue-600" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900">
              {active.length === 1
                ? "1 investment is in its cooling-off window"
                : `${active.length} investments are in their cooling-off windows`}
            </p>
            <p className="mt-1 text-xs text-blue-800">
              You can cancel any of these investments below for a full refund. The
              statutory 5-day cooling-off period expires automatically.
            </p>
            <ul className="mt-3 space-y-2">
              {active.map((c) => {
                const exp = new Date(c.coolingOffExpiresAt!);
                const hours = Math.max(
                  0,
                  Math.round((exp.getTime() - Date.now()) / (1000 * 60 * 60))
                );
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-gray-900">
                        {c.property?.title ?? `Investment #${c.id}`}
                      </span>
                      <span className="ml-2 text-gray-500">
                        R{c.contributionAmount.toLocaleString()} · expires in {hours}h
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingId(c.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <X className="h-3 w-3" />
                      Cancel & refund
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={pendingId !== null}
        onClose={() => setPendingId(null)}
        onConfirm={() => {
          if (pendingId !== null) {
            onCancel(pendingId);
            setPendingId(null);
          }
        }}
        title="Cancel this investment?"
        message="Your contribution will be refunded in full within 7 business days. This action is recorded in the audit log."
        confirmLabel="Yes, cancel & refund"
        tone="danger"
        loading={cancelling}
      />
    </>
  );
}
