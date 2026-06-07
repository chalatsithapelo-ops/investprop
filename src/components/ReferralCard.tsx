import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Copy, Check, Share2, Loader2 } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const SITE_URL = "https://investprop.io";

export function ReferralCard() {
  const trpc = useTRPC();
  const authToken = useAuthStore((s) => s.token);

  const meQuery = useQuery({
    ...trpc.getMe.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const me = meQuery.data as
    | { name?: string; investorCode?: string | null }
    | undefined;
  const code = me?.investorCode ?? null;

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const inviteUrl = code
    ? `${SITE_URL}/register?ref=${encodeURIComponent(code)}`
    : `${SITE_URL}/register`;

  const inviteMessage = code
    ? `Join me on Investprop and start investing in South African property from a fraction of the cost. Use my referral code ${code} when you sign up: ${inviteUrl}`
    : `Join me on Investprop and start investing in South African property from a fraction of the cost: ${inviteUrl}`;

  async function copy(text: string, which: "code" | "msg") {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedMsg(true);
        setTimeout(() => setCopiedMsg(false), 2000);
      }
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  }

  async function nativeShare() {
    const shareData = {
      title: "Investprop",
      text: inviteMessage,
      url: inviteUrl,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* user cancelled — no-op */
      }
    } else {
      await copy(inviteMessage, "msg");
    }
  }

  if (!authToken) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-900">
            Invite friends to Investprop
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Share your personal investor code and help others start building a
            property portfolio.
          </p>

          {meQuery.isLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your code…
            </div>
          ) : (
            <>
              <div className="mt-4">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Your referral code
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-base font-semibold text-slate-900">
                    {code ?? "Not assigned yet"}
                  </code>
                  <button
                    type="button"
                    onClick={() => code && copy(code, "code")}
                    disabled={!code}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copiedCode ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedCode ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={nativeShare}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                >
                  <Share2 className="h-4 w-4" />
                  Share invite
                </button>
                <button
                  type="button"
                  onClick={() => copy(inviteMessage, "msg")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {copiedMsg ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiedMsg ? "Message copied" : "Copy invite message"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
