# Investprop Pre-Launch Audit Checklist
_Tracker for fixes from `docs/AUDIT_REPORT.md`. Update as items complete._

Legend: ✅ done · 🟡 in-progress · ⬜ todo · ⏸ deferred (needs vendor/decision)

---

## Phase 0 — Exposure removal (immediate)
- ✅ Remove `devmanager@demo.com` from public landing page demo grid
- ✅ Remove `devmanager@demo.com` from login page demo tile list
- ✅ Remove false "regulated by the FSCA" footer claim
- ✅ Remove false "CISCA Regulated" feature card
- ✅ Soften "regulated SPV structures" hero copy → honest disclosure
- ✅ Remove unused "Waterfall Returns" marketing card (not implemented)
- ✅ Fix branding bug on login page ("PropVest" still rendered in `<h1>`)
- ✅ Access token lifetime `24h` → `15m` (`src/server/utils/tokens.ts`)
- ✅ Caddyfile: add CSP, X-Frame-Options, X-XSS-Protection, expanded Permissions-Policy

## Phase 1 — Admin role unification & user management
- ✅ `ADMIN` added to `UserRole` enum (prior commit)
- ✅ Admin user seeded (`admin@investprop.io`, prior commit)
- ✅ `requireRole` helper: ADMIN bypasses all role checks (auth-helpers.ts)
- ✅ `hasRole` middleware: ADMIN bypasses all role checks (main.ts)
- ✅ `admin.ts` adminProcedure: allow ADMIN or DEVELOPMENT_MANAGER
- ✅ `audit-log.ts` admin check: allow ADMIN
- ✅ `share-certificates.ts:350` direct `.includes` check: include ADMIN
- ✅ `User.status` enum added: `ACTIVE | PENDING_APPROVAL | SUSPENDED`
- ✅ Login rejects PENDING_APPROVAL / SUSPENDED users with clear message
- ✅ New admin procedures: `createUser`, `updateUserRole`, `approveUser`, `suspendUser`, `unsuspendUser`
- ✅ Register flow: managers/owners/contractors default to PENDING_APPROVAL; investors auto-approved
- ✅ `/admin/users` page: list, search, approve, suspend, change role, create user

## Phase 2 — Security hardening
- ✅ Token versioning (`User.tokenVersion`); login/refresh enforce match; suspend increments + revokes
- ✅ File upload: MIME whitelist + 5MB size cap + extension/MIME match + per-user rate limit
- ✅ Rate limits added: `FILE_UPLOAD`, `KYC_SUBMIT`, `PAYMENT_CONFIRM`, `INVESTMENT_CREATE`
- ✅ Email verification enforced before submitting investment proposal
- ✅ Password policy strengthened (≥8 chars, must contain digit + letter)
- ⏸ CSRF protection (tRPC over HTTPS with SameSite cookies + bearer tokens partially mitigates; full CSRF middleware deferred — needs frontend cookie refactor)
- ⏸ Move rate limiter to Redis (still in-memory — acceptable for single-node; revisit when scaling)
- ⏸ 2FA / TOTP — roadmap

## Phase 3 — Compliance & regulatory
- ✅ Companies Act §96(1)(b): enforce ≤50 investors per SPV (`submitInvestmentProposal`, `Property.maxInvestors=50`)
- ✅ ShareClass `totalShares` cap enforced on issuance (`shares.ts` already had it)
- ✅ Distribution tax classification: `DIVIDEND` 20%, `RENTAL_INCOME` 0%, `INTEREST` 0%, `CAPITAL_GAIN` 0% (`TaxClassification` enum + `Distribution.taxClassification`)
- ✅ Platform-wide R1,000 minimum investment enforced
- ✅ 5-day cooling-off window: `InvestorContribution.coolingOffExpiresAt` + `cancelContributionDuringCoolingOff` endpoint
- ✅ Sanctions screening hook scaffolded (`screenSanctions` procedure, stub returns PASS — wire to vendor)
- ✅ IT3 tax certificate scaffolded (`generateTaxCertificate` procedure, aggregates payouts by classification — PDF rendering pending design)
- ✅ Soft-delete (`deletedAt`) on `Property`, `InvestorContribution`, `Distribution`
- ✅ `User.complianceOfficer` + license-number field; admin procedure to record appointment

## Phase 4 — UX / dead-ends
- ✅ FAIS risk disclaimer banner component (`RiskDisclaimer.tsx`) — landing has inline disclosure, properties page has compact banner
- ⏸ Confirmation modals on irreversible actions (suspend modal added; distribute/revoke deferred — too many surfaces, will add per-screen as needed)
- ⏸ Loading / empty / error states normalised via shared `<QueryState>` helper (deferred — would touch ~30 files)
- ✅ Receipt JSON stub: `generateInvestmentReceipt` procedure (PDF rendering pending)
- ✅ AuditLog extended: `status`, `errorMessage`, `oldValue`, `newValue`, `requestId` + indexes on `action` and `status`
- ⏸ "Certificate Pending" empty state on certificates page (cosmetic — defer)

## Phase 5 — Operations
- ✅ Reconciliation page (`/admin/reconciliation`) — paste CSV, mismatches highlighted, mark-paid action
- ✅ Manual override requires `reconciliationNotes` when amount delta != 0 (`DistributionPayout.reconciliationNotes` + `reconciledAt`)

## Phase 6 — Float → Decimal money migration ⚠ RISKY
- ⬜ Audit every `Float` money field in schema
- ⬜ Migrate to `Decimal(18,2)` (Prisma supports `Decimal` type with `@db.Decimal(18,2)`)
- ⬜ Update all read/write paths to handle `Decimal` (Prisma returns `Decimal.js` instances)
- ⬜ Backfill existing data (already-rounded `Float` values)
- ⬜ Reconciliation test: SUM(distributed) + SUM(withheld) == SUM(gross) to the penny
- ⬜ Schedule maintenance window for live migration

**Note:** This is the highest-risk migration. Postponed to a dedicated focused effort. Until done, current Float math is acceptable for testing/beta but NOT for processing real distributions at scale.

## Post-launch / 90-day roadmap (from audit § 9)
- ⬜ TOTP-based 2FA (mandatory for ADMIN, optional for INVESTOR)
- ⬜ Secondary market controls (share transfer/freeze)
- ⬜ BEE / BBBEE reporting
- ⬜ Automated payment reconciliation (Paystack webhook)
- ⬜ SMS notifications for payment status
- ⬜ IT3(c) for capital gains on share sales
- ⬜ Sanctions vendor integration (Sanction Scanner / Refinitiv World-Check)
- ⬜ Tax certificate PDF rendering (pdfkit or @react-pdf/renderer)
- ⬜ Receipt PDF rendering
- ⬜ External penetration test before public launch
- ⬜ Submit FSCA application package
- ⬜ Engage compliance officer with RE1 / RE5 qualification

---

_Last updated: 2026-06-03_

## Phase 7 — Seller portal completeness (P0)
- ✅ Public "Sell or Partner With Us" CTA on landing page
- ✅ Public `/sell-your-property` info page (engagement options + process + compliance note)
- ✅ Engagement type enum: OUTRIGHT_SALE / JOINT_VENTURE / LEASE_BACK / DEVELOPMENT_PARTNERSHIP
- ✅ Legal & financial disclosures: title-deed no., erf no., bond status + outstanding + bank, rates status + arrears
- ✅ Tenancy disclosure: owner-occupied / tenanted / vacant + monthly rent + lease end
- ✅ Property condition rating + estimated renovation cost
- ✅ Multi-image upload with delete + thumbnails
- ✅ Document upload: title deed, ID, rates account, bond statement, lease, other
- ✅ Co-owner free-text capture
- ✅ POPIA consent checkbox (required to submit)
- ✅ Cross-field validation in tRPC procedure (bond/rates/tenancy required-fields)
- ✅ Loosened registration: PROPERTY_OWNER auto-ACTIVE (was PENDING_APPROVAL — friction blocker)
- ✅ See `docs/PERSONA_AUDIT.md` for full 5-persona audit + Phases 8–14 backlog
