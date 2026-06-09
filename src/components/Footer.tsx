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
    <footer className="mt-12 border-t border-gray-800 bg-gray-900 text-gray-300">
      {/* Trust strip */}
      <div className="border-b border-gray-800 bg-gray-950/40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-4 text-xs sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Shield className="text-gold-400" size={16} />
            <span><strong className="text-white">FICA &amp; POPIA compliant</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="text-gold-400" size={16} />
            <span><strong className="text-white">Audited by:</strong> {TRUST_CONFIG.auditor}</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="text-gold-400" size={16} />
            <span><strong className="text-white">Banking:</strong> {TRUST_CONFIG.bank}</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="text-gold-400" size={16} />
            <span><strong className="text-white">{TRUST_CONFIG.custodian}</strong></span>
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand + reg info */}
          <div className="md:col-span-1">
            <h3 className="text-lg font-bold text-white">
              Invest<span className="text-gold-400">prop</span>
            </h3>
            <p className="mt-2 text-sm text-gray-300">
              South African real-estate co-investment platform. Fractional property ownership for everyday investors.
            </p>
            <p className="mt-3 text-xs text-gray-400">
              {TRUST_CONFIG.companyName}
            </p>
          </div>

          {/* For investors */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-200">For Investors</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/investments/opportunities" className="hover:text-gold-400">Browse opportunities</Link></li>
              <li><Link to="/portfolio" className="hover:text-gold-400">My portfolio</Link></li>
              <li><Link to="/distributions" className="hover:text-gold-400">Distributions</Link></li>
              <li><Link to="/share-marketplace" className="hover:text-gold-400">Secondary market</Link></li>
            </ul>
          </div>

          {/* Compliance */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-200">Trust &amp; Compliance</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/kyc-compliance" className="hover:text-gold-400">FICA verification</Link></li>
              <li><Link to="/fsca-readiness" className="hover:text-gold-400">FSCA readiness</Link></li>
              <li><Link to="/compliance-dashboard" className="hover:text-gold-400">Compliance dashboard</Link></li>
              <li>
                <a href="/docs/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-gold-400">
                  Security &amp; data
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-200">Contact</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Mail size={14} />
                <a href="mailto:support@investprop.io" className="hover:text-gold-400">support@investprop.io</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={14} />
                <a href="mailto:compliance@investprop.io" className="hover:text-gold-400">compliance@investprop.io</a>
              </li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              Disputes: FAIS Ombud · Banking: Ombud for Banking Services
            </p>
          </div>
        </div>

        {/* Risk disclaimer — concise, single line */}
        <div className="mt-8 rounded-lg border border-gray-700 bg-gray-800/60 p-4">
          <p className="text-xs text-gray-300">
            Investprop facilitates property co-investments — investors make their own investment decisions after their own research.
            Each deal includes a 5-business-day cooling-off period; read the offer documents before committing.
          </p>
        </div>

        {/* Legal row */}
        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-navy-800/30 pt-6 text-xs text-gray-500 md:flex-row">
          <p>&copy; {new Date().getFullYear()} {TRUST_CONFIG.companyName}. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="/docs/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-gold-400">Privacy (POPIA)</a>
            <span>·</span>
            <a href="/docs/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-gold-400">Terms of use</a>
            <span>·</span>
            <a href="/docs/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-gold-400">Cookie policy</a>
            <span>·</span>
            <Link to="/admin/popia-sar" className="hover:text-gold-400">POPIA data request</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
