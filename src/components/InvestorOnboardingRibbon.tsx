import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  UserCheck,
  ShieldCheck,
  TrendingUp,
  Sparkles,
} from "lucide-react";

type Props = {
  emailVerified: boolean;
  ficaVerified: boolean;
  ficaDocsSubmitted: boolean;
  appropriatenessCompleted: boolean;
  hasInvested: boolean;
};

/**
 * 4-step progress ribbon for new investors.
 * Hidden entirely once all four steps are complete.
 * Otherwise renders a compact horizontal stepper with the next action.
 */
export function InvestorOnboardingRibbon({
  emailVerified,
  ficaVerified,
  ficaDocsSubmitted,
  appropriatenessCompleted,
  hasInvested,
}: Props) {
  const steps = [
    {
      key: "email",
      title: "Verify email",
      done: emailVerified,
      href: "/verify-email",
      icon: UserCheck,
      cta: "Verify",
    },
    {
      key: "appropriate",
      title: "Suitability questionnaire",
      done: appropriatenessCompleted,
      href: "/dashboard",
      icon: Sparkles,
      cta: "Take 2 min",
    },
    {
      key: "fica",
      title: "FICA verification",
      done: ficaVerified,
      hint: ficaDocsSubmitted && !ficaVerified ? "Awaiting review" : undefined,
      href: "/kyc-compliance",
      icon: ShieldCheck,
      cta: ficaDocsSubmitted ? "View status" : "Upload docs",
    },
    {
      key: "invest",
      title: "Make first investment",
      done: hasInvested,
      href: "/investments/opportunities",
      icon: TrendingUp,
      cta: "Browse",
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-gold-200 bg-gradient-to-r from-gold-50 via-white to-white shadow-sm">
      <div className="border-b border-gold-100 bg-gold-50/50 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-gold-700">
              Get ready to invest
            </h2>
            <p className="mt-0.5 text-xs text-gray-600">
              {doneCount}/{steps.length} steps complete — finish setup to start putting capital to work.
            </p>
          </div>
          {nextStep && (
            <Link
              to={nextStep.href as any}
              className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-semibold text-navy-950 transition hover:bg-gold-400"
            >
              Next: {nextStep.title} <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.key}
              to={step.href as any}
              className={`flex items-start gap-3 rounded-lg border p-3 transition ${
                step.done
                  ? "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50"
                  : nextStep?.key === step.key
                    ? "border-gold-300 bg-gold-50 ring-2 ring-gold-200"
                    : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex-shrink-0">
                {step.done ? (
                  <CheckCircle2 className="text-emerald-600" size={22} />
                ) : (
                  <Circle className={`${nextStep?.key === step.key ? "text-gold-500" : "text-gray-300"}`} size={22} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className={step.done ? "text-emerald-700" : "text-gray-500"} />
                  <p className="truncate text-xs font-medium text-gray-500">Step {idx + 1}</p>
                </div>
                <p className={`text-sm font-semibold ${step.done ? "text-emerald-800" : "text-gray-900"}`}>
                  {step.title}
                </p>
                {step.hint && <p className="mt-0.5 text-xs text-gray-500">{step.hint}</p>}
                {!step.done && !step.hint && (
                  <p className="mt-0.5 text-xs text-gold-700">{step.cta} →</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
