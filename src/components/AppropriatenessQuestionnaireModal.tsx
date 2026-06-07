import { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ShieldAlert, X } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
};

export function AppropriatenessQuestionnaireModal({ open, onClose, onComplete }: Props) {
  const trpc = useTRPC();
  const token = useAuthStore((s) => s.token);
  const [form, setForm] = useState({
    investmentExperience: "NONE" as "NONE" | "BASIC" | "EXPERIENCED" | "PROFESSIONAL",
    annualIncome: "UNDER_350K" as "UNDER_350K" | "350_750K" | "750K_1_5M" | "OVER_1_5M",
    netWorth: "UNDER_500K" as "UNDER_500K" | "500K_2M" | "2M_10M" | "OVER_10M",
    understandsIlliquid: false,
    understandsLossOfCapital: false,
    understandsCoolingOff: false,
    maxLossTolerance: "0",
  });

  const submitM = useMutation(
    trpc.submitAppropriatenessQuestionnaire.mutationOptions({
      onSuccess: () => {
        toast.success("Thank you. You may now proceed with investments.");
        onComplete?.();
        onClose();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const allAcksTicked =
    form.understandsIlliquid && form.understandsLossOfCapital && form.understandsCoolingOff;

  const handleSubmit = () => {
    if (!allAcksTicked) {
      toast.error("Please acknowledge all three risk disclosures");
      return;
    }
    submitM.mutate({
      authToken: token ?? "",
      investmentExperience: form.investmentExperience,
      annualIncome: form.annualIncome,
      netWorth: form.netWorth,
      understandsIlliquid: form.understandsIlliquid,
      understandsLossOfCapital: form.understandsLossOfCapital,
      understandsCoolingOff: form.understandsCoolingOff,
      maxLossTolerance: parseFloat(form.maxLossTolerance || "0"),
    });
  };

  return (
    <Dialog open={open} onClose={submitM.isPending ? () => {} : onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
              <DialogTitle className="text-lg font-bold text-gray-900">
                Appropriateness Assessment
              </DialogTitle>
            </div>
            {!submitM.isPending && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <p className="mb-4 text-sm text-gray-600">
            Before your first investment, the FSCA requires us to assess whether this product is
            appropriate for you. Your answers are confidential and used solely for compliance.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="exp" className="mb-1 block text-sm font-medium text-gray-700">
                Property investment experience
              </label>
              <select
                id="exp"
                value={form.investmentExperience}
                onChange={(e) =>
                  setForm({ ...form, investmentExperience: e.target.value as typeof form.investmentExperience })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="NONE">None</option>
                <option value="BASIC">Basic (1–2 investments)</option>
                <option value="EXPERIENCED">Experienced (3–10)</option>
                <option value="PROFESSIONAL">Professional (10+)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="income" className="mb-1 block text-sm font-medium text-gray-700">
                  Annual income (R)
                </label>
                <select
                  id="income"
                  value={form.annualIncome}
                  onChange={(e) => setForm({ ...form, annualIncome: e.target.value as typeof form.annualIncome })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="UNDER_350K">Under R350,000</option>
                  <option value="350_750K">R350,000 – R750,000</option>
                  <option value="750K_1_5M">R750,000 – R1.5M</option>
                  <option value="OVER_1_5M">Over R1.5M</option>
                </select>
              </div>
              <div>
                <label htmlFor="net" className="mb-1 block text-sm font-medium text-gray-700">
                  Net worth (R)
                </label>
                <select
                  id="net"
                  value={form.netWorth}
                  onChange={(e) => setForm({ ...form, netWorth: e.target.value as typeof form.netWorth })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="UNDER_500K">Under R500,000</option>
                  <option value="500K_2M">R500,000 – R2M</option>
                  <option value="2M_10M">R2M – R10M</option>
                  <option value="OVER_10M">Over R10M</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="loss" className="mb-1 block text-sm font-medium text-gray-700">
                Maximum amount you can afford to lose (R)
              </label>
              <input
                id="loss"
                type="number"
                min={0}
                value={form.maxLossTolerance}
                onChange={(e) => setForm({ ...form, maxLossTolerance: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <fieldset className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <legend className="px-2 text-sm font-semibold text-amber-700">
                Risk disclosures — please tick all to confirm understanding
              </legend>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.understandsIlliquid}
                    onChange={(e) =>
                      setForm({ ...form, understandsIlliquid: e.target.checked })
                    }
                    className="mt-0.5"
                  />
                  <span>
                    I understand that property investments are <strong>illiquid</strong> and
                    capital may be locked up for years.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.understandsLossOfCapital}
                    onChange={(e) =>
                      setForm({ ...form, understandsLossOfCapital: e.target.checked })
                    }
                    className="mt-0.5"
                  />
                  <span>
                    I understand I may <strong>lose some or all</strong> of my invested capital.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.understandsCoolingOff}
                    onChange={(e) =>
                      setForm({ ...form, understandsCoolingOff: e.target.checked })
                    }
                    className="mt-0.5"
                  />
                  <span>
                    I understand I have a <strong>5-business-day cooling-off</strong> period to
                    cancel and receive a full refund.
                  </span>
                </label>
              </div>
            </fieldset>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            {!submitM.isPending && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Later
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!allAcksTicked || submitM.isPending}
              className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-gold-700"
            >
              {submitM.isPending ? "Submitting…" : "Submit assessment"}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
