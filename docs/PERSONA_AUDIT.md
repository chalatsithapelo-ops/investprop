# Persona-Based Audit & Implementation Plan

**Date:** 2026-06-03  
**Scope:** Walk every flow in the shoes of every actor (Investor, Property Owner/Seller, Contractor, Development Manager, Admin) and list what is broken, illogical, missing, or non-compliant. Each item is tagged with a priority (P0/P1/P2) and rolled into a phased rollout.

Legend: ✅ done · 🟡 in-progress · ⬜ todo · ⏸ deferred

---

## Persona 1 — Property Owner / Seller

### What exists today
- `/owner-portal` (auth-gated, role=`PROPERTY_OWNER`) with form fields: title, description, address, city, province, propertyType, askingPrice, marketValue, urgency, saleType, reason, bed/bath/m², contact phone/email.
- `OwnerSaleProposal` model + `submitSaleProposal` / `getMySaleProposals` / `withdrawSaleProposal` procedures.
- Dev-manager review queue at `/sale-proposals` with accept/reject + review notes.

### Gaps found
| # | Gap | Why it matters | Priority |
|---|-----|----------------|----------|
| S-1 | **No public CTA** for sellers on landing page. A homeowner who lands on investprop.io sees only "Start Investing" — no way to discover the sell/partner flow without first registering blindly. | Lost leads, primary persona invisible | P0 |
| S-2 | **No partnership / JV option.** Sale type is only CASH/BOND/INSTALLMENT — there is no path for "I want to develop together" or "buy-and-leaseback". | Half the inbound owner enquiries don't fit this form | P0 |
| S-3 | **No proof-of-ownership / title-deed capture.** A platform cannot acquire/co-develop without verifying ownership (FICA §21A, Alienation of Land Act §2). | Compliance blocker; deals can't progress | P0 |
| S-4 | **No bond / encumbrance disclosure.** Without outstanding bond balance + bank, the platform can't compute net offer or settlement structure. | Deal modelling impossible | P0 |
| S-5 | **No rates clearance / levy / SARS-tax-clearance status.** All three are required before transfer (Local Government: Municipal Systems Act §118; Sectional Titles Schemes Management Act). | Conveyancer can't proceed | P0 |
| S-6 | **No tenant / lease disclosure.** A tenanted property carries the lease (huur gaat voor koop). Affects valuation + holding cost. | Material misrepresentation risk | P0 |
| S-7 | **No compliance-certificate status** (electrical CoC, gas, beetle, plumbing, electric-fence). Required for transfer in most ZA jurisdictions. | Hidden costs at closing | P1 |
| S-8 | **Form has no image upload UI** despite `imageUrls` field in the schema. | Owners can't show condition | P0 |
| S-9 | **No document upload UI** (title deed, ID, rates account). | Verification has to happen out-of-band | P0 |
| S-10 | **No multi-owner / power-of-attorney capture.** Joint owners cannot proceed without all signatories. | Deal blocker | P1 |
| S-11 | **No sectional-title fields** (scheme name, section #, body corporate, special levies). | Missing material info | P1 |
| S-12 | **No condition rating** (excellent → distressed) and no estimated renovation cost. | Underwriting blind | P1 |
| S-13 | **No estimated holding cost** (monthly rates+levy+insurance) — needed for cash-flow on hold-and-rent strategies. | Inaccurate IRR | P2 |
| S-14 | **Status feedback is poor.** Owner sees "Accepted" but no next step (e.g. "we'll send you a Letter of Intent within 5 working days"). | Drop-off after acceptance | P1 |
| S-15 | **No counter-offer mechanism.** Dev manager can only ACCEPT/REJECT — no "We'll offer R X if you'd accept". | Negotiation forced off-platform | P1 |
| S-16 | **No NDA / Letter of Intent / Offer-to-Purchase generation.** Once accepted, the deal evaporates into email. | No audit trail | P1 |
| S-17 | **No KYC/FICA gate** before submission. Anonymous PROPERTY_OWNER accounts can spam proposals. | Operational risk | P1 |
| S-18 | **Seller registration auto-approves** (Phase 1 set non-investors to `PENDING_APPROVAL`, but PROPERTY_OWNER may not have been included — verify). | Spam vector | P1 |
| S-19 | **No commission / fee transparency.** Owner has no idea what InvestProp's cut would be on a partnership. | Trust killer | P2 |
| S-20 | **No POPIA consent capture** when submitting third-party personal info (e.g. tenant details). | POPIA breach | P1 |

### Recommended fixes (rolled into Phases 7–9 below)

---

## Persona 2 — Investor

### What exists today
- `/properties`, `/investments/opportunities`, proposal flow, payments (Paystack), share certificates, distributions, portfolio, tax certificate stub.
- Phase 2–3 already shipped: R1,000 min, 50-investor cap, cooling-off, FAIS disclaimer, IT3 stub.

### Gaps found
| # | Gap | Why it matters | Priority |
|---|-----|----------------|----------|
| I-1 | **No risk-rating per opportunity** (Low/Medium/High). Investors need a simple signal alongside expected IRR. | Misled retail investors | P0 |
| I-2 | **No "expected vs actual" return tracking** on portfolio. Once they invest they can't see whether the SPV is hitting plan. | Trust + retention | P0 |
| I-3 | **No cooling-off UI.** Procedure exists (`cancelContributionDuringCoolingOff`) but no banner / button in the investor UI to action it within 5 days. | Regulator-facing gap | P0 |
| I-4 | **Min/max per opportunity not enforced visually** — investor can type R10 and only learns at submit. | Friction + bounce | P1 |
| I-5 | **Cap-table / dilution preview missing** before pledging — investor doesn't see what % of the SPV their R5,000 buys. | Informed-consent gap | P1 |
| I-6 | **Distribution forecast missing.** Investor sees "expected IRR 18%" but no monthly/annual payout schedule preview. | Mis-set expectations | P1 |
| I-7 | **No "documents pack" on each opportunity** (MOI, valuation, SPV registration, sale agreement). Required for informed consent under FAIS GCoC §3(1)(a). | Compliance gap | P0 |
| I-8 | **Email-verified gate on invest** was added in Phase 2 but there's no in-app prompt to verify if blocked. | Confusing dead-end | P0 |
| I-9 | **FICA status not visible to investor.** They don't know if they're approved to invest until rejected. | UX dead-end | P0 |
| I-10 | **Payment proof upload is one-shot, no resubmit** if rejected. | Support ticket spike | P1 |
| I-11 | **Tax certificate UI missing** (only JSON procedure exists). | Tax season blocker | P1 |
| I-12 | **Receipt UI missing** (only JSON procedure exists). | Audit-trail gap | P1 |
| I-13 | **No "my SPVs" voting page** — distributions+voting are merged but voting UX is buried. | Governance broken | P2 |
| I-14 | **Investor cannot withdraw uncommitted funds** (e.g. failed match / cancelled SPV). No refund path visible. | Trust killer | P1 |
| I-15 | **No portfolio diversification dashboard** (concentration by city/asset class). | Risk education missing | P2 |
| I-16 | **Currency formatting inconsistent** — `R5000.00` vs `R 5,000.00` vs `5000` across pages. | Polish | P2 |
| I-17 | **No appropriateness questionnaire** (FAIS GCoC §8 — "advice" vs "execution-only" boundary). Once the platform suggests anything it becomes advice. | Regulatory exposure | P1 |
| I-18 | **Share-marketplace** has no liquidity warning, no minimum-holding-period enforcement. | Regulatory + investor education | P1 |

---

## Persona 3 — Contractor

### What exists today
- `/contractor-portal` (auth-gated, role=CONTRACTOR): view work orders, submit quotes, invoices, progress reports.
- `/contractor-management` for dev managers: onboard, RFQ, work orders, review invoices.

### Gaps found
| # | Gap | Why it matters | Priority |
|---|-----|----------------|----------|
| C-1 | **No contractor self-registration path** visible from landing page. Same problem as sellers. | Lost supply side | P0 |
| C-2 | **No CIDB grade / tax-clearance / BBBEE / public-liability-insurance capture.** Standard prequalification for ZA construction work. | Compliance + liability | P0 |
| C-3 | **No work-order acceptance signature/timestamp** — contractor "starts" without legal acceptance. | Disputes | P1 |
| C-4 | **No retention / payment-milestone schema.** Standard JBCC/NEC contracts have retention (5–10%) and stage payments. Currently invoices are flat. | Financial control | P1 |
| C-5 | **No variation-order workflow.** Site changes happen — there is no formal way to request/approve scope changes with cost impact. | Cost overrun | P1 |
| C-6 | **No defects-liability period** tracking after handover. | Quality + recourse | P2 |
| C-7 | **No health-and-safety file upload** (OHS Act §37(2) requires one per site). | Compliance | P1 |
| C-8 | **No rating / track-record** visible to other dev managers. | Vendor quality | P2 |
| C-9 | **Invoice approval lacks 3-way match** (PO ↔ GRN ↔ invoice). | Fraud risk | P1 |
| C-10 | **No SLA / dispute mechanism** between contractor and dev manager (currently informal). | Escalation gap | P2 |

---

## Persona 4 — Development Manager / Project Manager

### What exists today
- Dashboard, properties CRUD, project management, contractor management, distributions, payments review, KYC dashboard, compliance dashboard, FSCA readiness, financial reports, sale-proposal review, admin panel, reconciliation page.

### Gaps found
| # | Gap | Why it matters | Priority |
|---|-----|----------------|----------|
| D-1 | **No single "Pipeline" view** — proposals, acquisitions, active dev, completed are scattered across 6 pages. | Operational chaos | P1 |
| D-2 | **No SLA timers** on tasks (e.g. respond to seller within 5 days, FICA review within 48h). | Service breakdown | P1 |
| D-3 | **No counter-offer / LOI generation** on sale proposals. | (mirror of S-15/S-16) | P0 |
| D-4 | **No deal-room** to consolidate seller docs, valuations, comparables, conveyancer info. | Knowledge fragmentation | P1 |
| D-5 | **Budget vs actual variance alerts missing.** Budgets are stored but no surface flags >10% variance. | Cost-overrun blind | P1 |
| D-6 | **No board pack / monthly report generator** for SPV directors. Companies Act §61 obliges annual report at minimum. | Governance gap | P1 |
| D-7 | **No multi-currency / FX** for international investors. | Roadmap | P2 |
| D-8 | **No data export** (CSV/XLSX) on most lists — auditor/regulator requests cannot be served. | Compliance | P1 |
| D-9 | **Hard delete on Property exists** but soft-delete column was just added — UI still uses hard delete. | Data integrity | P1 |
| D-10 | **No "draft" state for properties** before publish — every save is live. | Mistake risk | P2 |
| D-11 | **Notifications fire to "all dev managers"** with no routing / on-call rota. | Noise → ignored | P2 |
| D-12 | **No audit-log viewer UI** — AuditLog is written but never displayed. | Forensic dead-end | P1 |

---

## Persona 5 — Admin

### What exists today
- `/admin` with create / approve / suspend / appoint-compliance-officer flows (Phase 1 shipped).
- `/admin/reconciliation` (Phase 5).

### Gaps found
| # | Gap | Why it matters | Priority |
|---|-----|----------------|----------|
| A-1 | **No user-impersonation / view-as** for support. | Support tickets unsolvable | P1 |
| A-2 | **No bulk operations** (bulk-approve KYC, bulk-suspend, bulk-email). | Scale blocker | P1 |
| A-3 | **No system-health dashboard** (queue depth, failed payments, stuck distributions). | Ops blind | P1 |
| A-4 | **No password-reset / token-revoke** from admin per-user (only suspend). | Support gap | P1 |
| A-5 | **No backup / export of full SPV book** for an investor (subject-access request under POPIA §23). | POPIA breach risk | P1 |
| A-6 | **Audit log viewer** missing (same as D-12). | Forensic | P1 |
| A-7 | **No tier-based pricing / fees configuration.** Platform fees are hard-coded across the codebase. | Business agility | P2 |

---

## Cross-cutting themes

- **Discoverability:** all three non-investor personas (seller, contractor, dev manager applicant) have zero public entry points. Landing page treats the platform as investor-only.
- **Documents:** uploads exist but no persistent "document vault" per entity (property, SPV, user, proposal). Documents are scattered across `imageUrls`, `proofOfPaymentUrl`, etc. with no central registry.
- **Notifications:** in-app only; no email digest, no preference centre, no quiet hours.
- **Mobile:** every page assumes desktop; no mobile-first review tested.
- **Accessibility:** no keyboard-only audit, no aria-live for toasts, no contrast audit.
- **i18n:** English only; ZA has 11 official languages — at minimum Afrikaans + isiZulu for owner outreach.
- **Tests:** no Playwright e2e for the seller→dev manager→investor end-to-end happy path. Critical risk.

---

## Phased implementation plan

### Phase 7 — Seller portal completeness (this batch — P0 only)
- ⬜ S-1 Public "Sell or Partner with Us" CTA on landing + dedicated `/sell-your-property` info page
- ⬜ S-2 Add `engagementType` enum: OUTRIGHT_SALE · JOINT_VENTURE · LEASE_BACK · DEVELOPMENT_PARTNERSHIP
- ⬜ S-3 / S-9 Document upload UI (title deed, ID, rates account) — uses existing `uploadFile` mutation
- ⬜ S-4 Bond status fields: `bondStatus` (NONE/EXISTING), `bondOutstanding`, `bondBank`
- ⬜ S-5 Rates clearance: `ratesStatus` (CURRENT/ARREARS), `ratesArrearsAmount`
- ⬜ S-6 Tenant disclosure: `tenancyStatus` (OWNER_OCCUPIED/TENANTED/VACANT), `monthlyRent`, `leaseEndDate`
- ⬜ S-8 Image upload UI (multi-file)
- ⬜ S-18 Verify PROPERTY_OWNER goes through `PENDING_APPROVAL` flow (or add)
- ⬜ S-20 POPIA consent checkbox on submission

### Phase 8 — Seller portal extensions (P1)
- ⬜ S-7 Compliance-certificate status block
- ⬜ S-10 Multi-owner + POA
- ⬜ S-11 Sectional-title fields
- ⬜ S-12 Condition rating + estimated reno cost
- ⬜ S-14 Post-acceptance next-step messaging + status timeline
- ⬜ S-15 Counter-offer mechanism (`counterOfferAmount`, `counterOfferTerms`)
- ⬜ S-16 LOI generator (PDF)
- ⬜ S-17 KYC/FICA gate before submission

### Phase 9 — Investor improvements (P0 batch)
- ⬜ I-1 Risk rating per opportunity
- ⬜ I-2 Expected vs actual on portfolio
- ⬜ I-3 Cooling-off banner + cancel button
- ⬜ I-7 Documents pack per opportunity
- ⬜ I-8 In-app "verify your email" CTA
- ⬜ I-9 FICA status badge on dashboard

### Phase 10 — Investor improvements (P1)
- ⬜ I-4 / I-5 / I-6 Cap-table preview + min/max client-side + distribution forecast
- ⬜ I-10 Resubmit payment proof
- ⬜ I-11 / I-12 Receipt + IT3 PDF rendering
- ⬜ I-14 Refund / withdraw uncommitted path
- ⬜ I-17 Appropriateness questionnaire
- ⬜ I-18 Marketplace liquidity warning + min holding period

### Phase 11 — Contractor (P0)
- ⬜ C-1 Public "Become a contractor" CTA + `/become-a-contractor`
- ⬜ C-2 CIDB / tax-clearance / BBBEE / PL-insurance capture

### Phase 12 — Contractor (P1)
- ⬜ C-3 Work-order acceptance signature
- ⬜ C-4 Retention + milestone payments
- ⬜ C-5 Variation orders
- ⬜ C-7 H&S file
- ⬜ C-9 3-way match

### Phase 13 — Dev Manager + Admin (P0/P1)
- ⬜ D-1 Unified pipeline view
- ⬜ D-3 Counter-offer / LOI (paired with S-15/S-16)
- ⬜ D-4 Deal room per proposal
- ⬜ D-5 Budget variance alerts
- ⬜ D-8 CSV/XLSX export everywhere
- ⬜ D-9 Switch to soft-delete in UI
- ⬜ D-12 / A-6 Audit-log viewer
- ⬜ A-1 Impersonation
- ⬜ A-2 Bulk ops
- ⬜ A-3 System-health dashboard
- ⬜ A-5 POPIA SAR export

### Phase 14 — Cross-cutting (P1/P2)
- ⬜ Central document vault model
- ⬜ Email notifications + preference centre
- ⬜ Mobile-first pass on top 10 pages
- ⬜ Accessibility audit
- ⬜ Afrikaans + isiZulu i18n
- ⬜ Playwright happy-path e2e

---

## What is being shipped right now (Phase 7)

See [docs/AUDIT_CHECKLIST.md](docs/AUDIT_CHECKLIST.md) for the running master tracker. Phase 7 ships:

1. Public landing CTA + `/sell-your-property` public info page
2. Schema extensions on `OwnerSaleProposal` (engagement type, bond, rates, tenancy, POPIA consent, documents)
3. Form rebuild with image + document upload
4. PROPERTY_OWNER approval-flow verification
5. POPIA consent checkbox
