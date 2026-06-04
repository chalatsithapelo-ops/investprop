import { Link } from "@tanstack/react-router";
import { MailWarning } from "lucide-react";
import { useAuthStore } from "~/stores/authStore";

/**
 * Banner that prompts unverified users to confirm their email.
 * Gates investor actions per FSCA / SARB AML guidance.
 */
export function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  if (!user || (user as any).emailVerified) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm"
    >
      <MailWarning className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-semibold">Verify your email to invest</p>
        <p className="mt-1 text-xs text-amber-800">
          You must confirm your email address before you can submit investment
          proposals or fund opportunities. Check your inbox for the verification
          link we sent to <span className="font-mono">{user.email}</span>.
        </p>
      </div>
      <Link
        to="/verify-email"
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Resend link
      </Link>
    </div>
  );
}
