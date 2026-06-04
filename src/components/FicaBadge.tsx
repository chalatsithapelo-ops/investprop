import { Link } from "@tanstack/react-router";
import { BadgeCheck, ShieldAlert } from "lucide-react";

type Props = {
  ficaVerified?: boolean;
  showLink?: boolean;
};

export function FicaBadge({ ficaVerified, showLink = true }: Props) {
  if (ficaVerified) {
    return (
      <span
        title="FICA verified — KYC complete"
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        FICA verified
      </span>
    );
  }
  return (
    <span
      title="FICA not yet verified — required for investments above R5,000"
      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
    >
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
      FICA pending
      {showLink && (
        <Link to="/kyc-compliance" className="ml-1 underline hover:text-amber-900">
          Complete
        </Link>
      )}
    </span>
  );
}
