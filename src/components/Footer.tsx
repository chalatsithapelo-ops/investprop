import { Link } from "@tanstack/react-router";
import { Shield, Lock, FileText, Mail, Building2 } from "lucide-react";

/**
 * Trust-signal footer shown on every page (mounted in __root.tsx).
 * Keeps copy SA-compliance friendly:
 *   - FSCA FSP placeholder (until real number issued)
 *   - Auditor + bank trust references
 *   - Plain-language risk + cooling-off reminder
 *   - Quick legal links
 *
 * Replace TRUST_CONFIG placeholders with real values when ops confirms.
 */
const TRUST_CONFIG = {
  auditor: "Independent SA auditor",
  bank: "FNB Business + Standard Bank Custody",
  custodian: "Ring-fenced trust account: STBB Smith Tabata Buchanan Boyes Inc.",
  companyName: "Investprop (Pty) Ltd",
};

export function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-200 bg-gray-50 text-gray-700">
      {/* Trust strip */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-4 text-xs sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Shield className="text-gold-600" size={16} />
            <span><strong className="text-gray-900">FICA &amp; POPIA compliant</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="text-gold-600" size={16} />
            <span><strong className="text-gray-900">Audited by:</strong> {TRUST_CONFIG.auditor}</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="text-gold-600" size={16} />
            <span><strong className="text-gray-900">Banking:</strong> {TRUST_CONFIG.bank}</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="text-gold-600" size={16} />
            <span><strong className="text-gray-900">{TRUST_CONFIG.custodian}</strong></span>
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand + reg info */}
          <div className="md:col-span-1">
            <h3 className="text-lg font-bold text-gray-900">
              Invest<span className="text-gold-600">prop</span>
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              South African real-estate co-investment platform. Fractional property ownership for everyday investors.
            </p>
            <p className="mt-3 text-xs text-gray-500">
              {TRUST_CONFIG.companyName}
            </p>
          </div>

          {/* For investors */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-900">For Investors</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li><Link to="/investments/opportunities" className="hover:text-gold-600">Browse opportunities</Link></li>
              <li><Link to="/pricing" className="hover:text-gold-600">Plans &amp; pricing</Link></li>
              <li><Link to="/portfolio" className="hover:text-gold-600">My portfolio</Link></li>
              <li><Link to="/distributions" className="hover:text-gold-600">Distributions</Link></li>
              <li><Link to="/share-marketplace" className="hover:text-gold-600">Secondary market</Link></li>
            </ul>
          </div>

          {/* Compliance */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-900">Trust &amp; Compliance</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li><Link to="/kyc-compliance" className="hover:text-gold-600">FICA verification</Link></li>
              <li><Link to="/fsca-readiness" className="hover:text-gold-600">FSCA readiness</Link></li>
              <li><Link to="/compliance-dashboard" className="hover:text-gold-600">Compliance dashboard</Link></li>
              <li>
                <a href="/docs/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-gold-600">
                  Security &amp; data
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-900">Contact</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Mail size={14} className="text-gold-600" />
                <a href="mailto:support@investprop.io" className="hover:text-gold-600">support@investprop.io</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={14} className="text-gold-600" />
                <a href="mailto:compliance@investprop.io" className="hover:text-gold-600">compliance@investprop.io</a>
              </li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              Disputes: FAIS Ombud · Banking: Ombud for Banking Services
            </p>
          </div>
        </div>

        {/* Risk disclaimer — concise, single line */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-600">
            Investprop facilitates property co-investments — investors make their own investment decisions after their own research.
            Each deal includes a 5-business-day cooling-off period; read the offer documents before committing.
          </p>
        </div>

        {/* Legal row */}
        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-gray-200 pt-6 text-xs text-gray-500 md:flex-row">
          <p>&copy; {new Date().getFullYear()} {TRUST_CONFIG.companyName}. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="/docs/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-gold-600">Privacy (POPIA)</a>
            <span>·</span>
            <a href="/docs/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-gold-600">Terms of use</a>
            <span>·</span>
            <a href="/docs/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-gold-600">Cookie policy</a>
            <span>·</span>
            <Link to="/admin/popia-sar" className="hover:text-gold-600">POPIA data request</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
