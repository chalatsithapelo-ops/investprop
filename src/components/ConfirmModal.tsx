import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "info";
  loading?: boolean;
};

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "warning",
  loading,
}: Props) {
  const toneColors = {
    danger: "bg-red-600 hover:bg-red-700 focus:ring-red-400",
    warning: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-400",
    info: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-400",
  }[tone];

  const iconColor = {
    danger: "text-red-500",
    warning: "text-amber-500",
    info: "text-blue-500",
  }[tone];

  return (
    <Dialog open={open} onClose={loading ? () => {} : onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-6 w-6 ${iconColor}`} aria-hidden="true" />
              <DialogTitle className="text-lg font-semibold text-gray-900">
                {title}
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              aria-label="Close dialog"
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 text-sm text-gray-600">{message}</div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${toneColors}`}
            >
              {loading ? "Working…" : confirmLabel}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
