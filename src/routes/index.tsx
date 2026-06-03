import { createFileRoute, Link } from '@tanstack/react-router'
import { Navbar } from '~/components/Navbar'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-white" />
        <div className="relative mx-auto max-w-7xl text-center">
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Fractional Property Investment
            <span className="block bg-gradient-to-r from-gold-500 to-gold-700 bg-clip-text text-transparent">
              Made Simple in South Africa
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-3xl text-lg text-gray-600 sm:text-xl">
            Investprop enables everyday South Africans to invest in premium real estate through
            dedicated SPV structures, with full transparency on each opportunity. Investment
            from R1,000 per property.
          </p>
          <p className="mx-auto -mt-6 mb-10 max-w-3xl text-xs text-gray-400">
            Investprop is a financial services platform currently preparing its FSCA licensing
            application. We are not yet a licensed Financial Services Provider. All investments
            carry risk and past performance does not guarantee future returns.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-gold-500/25 transition hover:from-gold-600 hover:to-gold-700"
            >
              Start Investing
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-8 py-3.5 text-lg font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-gray-200 bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-4xl font-bold text-gold-600">120+</p>
            <p className="mt-1 text-gray-500">Properties Listed</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold text-gold-600">8,500+</p>
            <p className="mt-1 text-gray-500">Active Investors</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold text-gold-600">R2.4B+</p>
            <p className="mt-1 text-gray-500">Total Invested</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-4 text-center text-3xl font-bold">Why Investprop?</h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-gray-500">
            Built for the South African market with full regulatory compliance and
            institutional-grade infrastructure.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* SPV Structure */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold-300 hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gold-50">
                <svg className="h-6 w-6 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">SPV Structure</h3>
              <p className="text-sm text-gray-500">
                Each property is held in a Special Purpose Vehicle, providing legal protection and
                transparent ownership.
              </p>
            </div>

            {/* Transparent Reporting */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold-300 hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gold-50">
                <svg className="h-6 w-6 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2a4 4 0 014-4h6m-4 6l4-4-4-4" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Transparent Reporting</h3>
              <p className="text-sm text-gray-500">
                Live distribution statements, share certificates, and downloadable tax records.
                Every payout is auditable.
              </p>
            </div>

            {/* Pro-rata Returns */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold-300 hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gold-50">
                <svg className="h-6 w-6 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Pro-rata Distributions</h3>
              <p className="text-sm text-gray-500">
                Income and capital gains are distributed proportionally to your ownership stake
                in each SPV, with withholding tax handled per SARS rules.
              </p>
            </div>

            {/* Paystack Payments */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold-300 hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gold-50">
                <svg className="h-6 w-6 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Paystack Payments</h3>
              <p className="text-sm text-gray-500">
                Secure ZAR payments via Paystack with instant settlement and automated
                reconciliation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-12 text-center shadow-sm">
          <h2 className="mb-4 text-3xl font-bold">Ready to Build Your Property Portfolio?</h2>
          <p className="mx-auto mb-8 max-w-xl text-gray-500">
            Join thousands of South African investors already building wealth through fractional
            property ownership on Investprop.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 px-8 py-3 font-semibold text-white shadow-lg shadow-gold-500/25 transition hover:from-gold-600 hover:to-gold-700"
            >
              Create Free Account
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center rounded-lg border border-gray-300 px-8 py-3 font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center text-xs text-gray-500">
          <p className="text-sm">&copy; {new Date().getFullYear()} Investprop. All rights reserved.</p>
          <p className="mt-3 leading-relaxed">
            <strong>Risk warning &amp; disclosure.</strong> Investprop is a financial services
            platform currently preparing its FSCA licensing application. We are not yet a
            licensed Financial Services Provider under the Financial Advisory and Intermediary
            Services Act (FAIS). Investments in property carry risk including loss of capital;
            past performance is not indicative of future returns. Projected yields are estimates
            only and not guaranteed. Investors should obtain independent financial advice.
          </p>
        </div>
      </footer>
    </div>
  )
}
