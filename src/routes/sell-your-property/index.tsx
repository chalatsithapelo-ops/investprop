import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "~/components/Navbar";
import { Home, Handshake, RefreshCw, Building2, ShieldCheck, Clock, FileCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/sell-your-property/")({
  component: SellYourPropertyPage,
});

function SellYourPropertyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar />

      {/* Hero */}
      <section className="px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <span className="inline-block rounded-full bg-gold-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-700">
            For Property Owners
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Sell, Partner, or Develop Your Property
            <span className="block bg-gradient-to-r from-gold-500 to-gold-700 bg-clip-text text-transparent">
              With Investprop
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Whether you need a quick cash sale, want to keep upside through a joint-venture, or want
            us to develop the property with you — submit your details and our acquisitions team will
            respond within 5 working days.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 px-8 py-3 text-lg font-semibold text-white shadow-lg shadow-gold-500/25 hover:from-gold-600 hover:to-gold-700"
            >
              Submit Your Property <ArrowRight size={18} />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-8 py-3 text-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              I already have an account
            </Link>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Free to submit · No obligation · Confidential
          </p>
        </div>
      </section>

      {/* Engagement options */}
      <section className="border-y border-gray-200 bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-center text-3xl font-bold">Four ways we can work together</h2>
          <p className="mx-auto mb-10 max-w-2xl text-center text-gray-500">
            Pick the one that best fits your situation. You can change your preference any time
            during the conversation with our team.
          </p>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { I: Home, t: "Outright Sale", d: "We buy the property for cash or via bond. Best if you need liquidity quickly." },
              { I: Handshake, t: "Joint Venture", d: "Contribute the property as equity into an SPV. Share in income and capital uplift." },
              { I: RefreshCw, t: "Sale & Lease-Back", d: "Free up the capital but stay in the property as a tenant under a fixed lease." },
              { I: Building2, t: "Development Partnership", d: "We co-develop / refurbish and split the profits per a JV agreement." },
            ].map((o) => (
              <div key={o.t} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gold-300 hover:shadow-md">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gold-50">
                  <o.I className="h-5 w-5 text-gold-600" />
                </div>
                <h3 className="text-base font-semibold text-gray-900">{o.t}</h3>
                <p className="mt-1 text-sm text-gray-500">{o.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-3xl font-bold">How it works</h2>
          <ol className="space-y-6">
            {[
              { I: FileCheck, t: "1. Submit your property", d: "Create an account, complete the secure submission form (engagement type, bond, rates, tenancy, photos, title deed)." },
              { I: Clock, t: "2. Initial review (≤5 working days)", d: "Our acquisitions team reviews the proposal, runs a desktop valuation, and either makes an offer, sends a counter, or schedules a site visit." },
              { I: ShieldCheck, t: "3. FICA & due diligence", d: "If accepted, we verify ownership, rates clearance, bond status, and (for tenanted) the lease. All documents stay encrypted in your portal." },
              { I: Handshake, t: "4. Sign & transfer", d: "Letter of Intent → Offer-to-Purchase → conveyancing. Funds settle directly with you or your bond bank at registration." },
            ].map((s) => (
              <li key={s.t} className="flex gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gold-50">
                  <s.I className="h-5 w-5 text-gold-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{s.t}</h3>
                  <p className="mt-1 text-sm text-gray-500">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Compliance note */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong className="block text-amber-800">Important.</strong>
          Investprop is preparing its FSCA licensing application. We are not a registered estate
          agent — sale transactions are concluded through accredited conveyancers and, where
          applicable, registered estate-agency partners. All offers are subject to due diligence,
          valuation, internal credit approval and signed agreements. Personal information is
          processed in accordance with the Protection of Personal Information Act 4 of 2013 (POPIA).
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl bg-gradient-to-br from-gold-500 to-gold-700 p-10 text-center text-white shadow-lg">
          <h2 className="text-2xl font-bold">Ready to submit your property?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/90">
            Create your free property-owner account and complete the submission form. We&apos;ll respond within 5 working days.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3 text-base font-semibold text-gold-700 hover:bg-gray-100"
          >
            Get Started <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
