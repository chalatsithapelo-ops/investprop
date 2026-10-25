# Investprop — End-to-End Logic Audit

**Date:** 2026-10-25
**Scope:** Every core procedure traced from a *business-logic* perspective (not just code), per persona, start to finish. For each flow: what happens, who does it, where the record goes, and where the logic breaks. Gaps are marked **[FIXED]** (closed this session), **[OPEN-P0/P1/P2]** (documented for follow-up).

---

## 0. Method & summary

I traced the real procedures and UI for each persona end-to-end: Property Owner → Investor → Manager/Ops → Contractor → Admin. The platform is substantially complete and the **investor money flow is sound** (fees booked at every money-movement point, auto-funding, auto share-certificate issuance). The single biggest *logical* break was that **an accepted owner proposal never became an investable opportunity** — the two halves of the marketplace were not connected. That bridge is now built.

| Area | Verdict |
|------|---------|
| Owner submit → review → counter-offer → accept | Works |
| Accepted owner deal → investable Property | **Was missing — [FIXED]** |
| Investor browse → suitability/FICA → commit | Works |
| Payment → fee capture → funded → certificate → holding | Works |
| Distributions → payouts → tax | Works |
| Secondary trades (ROFR, matching, fee) | Works |
| Seller settlement / transfer state machine | **[OPEN-P1]** |
| Cooling-off UI | **[OPEN-P1]** (procedure exists) |
| Money precision (Float vs Decimal) | **[OPEN-P0]** (known) |

---

## 1. Persona: Property Owner / Seller

### 1.1 The flow as built
1. **Submit** — `submitSaleProposal` (role `PROPERTY_OWNER`). Creates `OwnerSaleProposal` at `status=PENDING` with full disclosures (title deed, bond, rates, tenancy, condition, CoCs, images, docs, POPIA consent). Non-Seller-Pro owners are capped at one active listing.
   - *Who receives it:* all `DEVELOPMENT_MANAGER` + `PROJECT_MANAGER` users get an in-app + push notification; the owner gets a confirmation.
2. **Review queue** — `getSaleProposals` (managers only). Sorted by urgency, with Seller-Pro proposals floated to the top.
3. **Review decision** — `reviewSaleProposal` → `UNDER_REVIEW` (books the Assessment/DD-pack fee), `ACCEPTED` (books Assessment + acceptance fees), or `REJECTED`. Owner is notified each time.
4. **Negotiate** — `counterOfferSaleProposal` (manager) ⇄ `respondToCounterOffer` (owner). Accepting the counter books the seller-side fees on the agreed price.
5. **Paper** — `generateLetterOfIntent` (LOI) and an Offer-to-Purchase PDF are generated from the proposal.
6. **Recurring fees** — `bookOwnerRecurringFee` books JV-promote (% of payout) or lease-back-management (% of rent) against an occurrence-unique ledger key.

### 1.2 Gaps
- **[FIXED] Pipeline bridge missing.** An `ACCEPTED` proposal had no route into the investor-facing `Property` pipeline — the agreed deal "evaporated into email/PDF". Investors could therefore *never* see owner-sourced stock. **Fix:** added `promoteSaleProposalToProperty` (manager/admin). It creates a **draft** `Property` (`investmentStatus=PLANNING`, `isPublished=false`) pre-filled from the proposal (title, address, agreed price → `fundingGoal`, images, beds/baths/m²), links it back via new `OwnerSaleProposal.convertedToPropertyId`/`convertedAt`, writes an audit log, and notifies the owner that their property "has entered our acquisition pipeline". Idempotent (one promotion per proposal). A **"Promote to investment pipeline"** button now appears on each accepted proposal in `/sale-proposals`, which becomes a **"View pipeline property #N"** link afterwards. This mirrors the proven `promoteDistressedToProperty` pattern.
- **[OPEN-P1] No settlement / transfer state.** After `ACCEPTED`/promotion there is no `CLOSED`/`TRANSFERRED`/`SETTLED` status, no record of the seller actually being paid, and no conveyancing checklist. In practice transfer happens off-platform via a conveyancer, but the platform has no close event to (a) trigger the seller-facilitation fee *at close* (it currently books at acceptance) or (b) mark the deal done. **Recommend:** add a `SaleProposalStatus.CLOSED` + a `closeSaleProposal` procedure that records settlement date, net paid to seller, and conveyancer ref, and re-points the facilitation fee to the close event.
- **[OPEN-P2] Seller fee transparency.** The owner sees fees on the public `/sell-your-property` page but not an itemised net-proceeds estimate inside their own portal pre-acceptance.

---

## 2. Persona: Investor

### 2.1 The flow as built
1. **Browse** — `getInvestmentOpportunities` returns only `investmentStatus=RAISING_FUNDS` **and** `isPublished=true` properties; `fundingRaised` is recomputed from **PAID** contributions only (no drift), and expected return is computed live from the financial engine (never a stale stored 0).
2. **Suitability gates (hard)** — the opportunity page blocks investing until: email verified, **FAIS appropriateness questionnaire** completed, terms accepted (5 checkboxes), and **FICA** verified if the amount (or running total) ≥ R20,000.
3. **Commit** — `submitInvestmentProposal` enforces: role INVESTOR, min R10,000, **≤50 investors/SPV** (Companies Act §96(1)(b)), cannot exceed the funding goal, funding-window not closed, rate-limited. Creates an `InvestorContribution` and sets the 5-day cooling-off expiry.
4. **Pay** — Paystack or EFT proof-of-payment → `paymentStatus=PAID`.
   - On PAID: recompute `fundingRaised`; **book the 2.5% CAPITAL_RAISE fee** (idempotent); auto-flip the property to `FUNDED` + unpublish once the goal is met; notify investor; **auto-issue the share certificate**; **materialise the `ShareHolding`**; notify managers.
5. **Hold & earn** — `createDistribution` builds pro-rata payouts by shares, withholds SARS tax (20% on dividends), **books the 2% DISTRIBUTION fee**; `executeDistribution` pays out. Tax: `generateTaxCertificate` → IT3(b).
6. **Exit** — `placeShareOrder` (BUY/SELL) with KYC gate, ROFR notifications to existing holders, automatic order matching, and the **1% SECONDARY_TRADE fee** booked on each fill.
7. **Cooling-off** — `cancelContributionDuringCoolingOff` reverses within 5 days.

### 2.2 Gaps
- **[OPEN-P1] Cooling-off has no UI.** The procedure exists but there is no visible countdown/"Cancel" button on the contribution — a regulator-facing presentation gap (CPA §48).
- **[OPEN-P1] Min-investment inconsistency.** `submitInvestmentProposal` enforces **R10,000**, but `purchaseShares`/share-class minimums can derive a different floor, and some legacy copy says R1,000. Pick one canonical minimum and surface it everywhere (the memorandum and opportunity UI already say "from R10k").
- **[OPEN-P2] No "expected vs actual" tracker** on the portfolio once invested (trust/retention).
- Loan & Equity calculator previously hid the monthly repayment & total repayment — **[FIXED]** this session on both web and mobile (see §6).

---

## 3. Persona: Development / Project Manager (Operations)

### 3.1 The flow as built
- Acquisition pipeline (`acquisition.ts`, books the 1% SOURCING fee), property/SPV/share-class creation (`shares.ts`), distribution creation + execution, governance proposals + voting (`distributions.ts`), owner-proposal review & counter-offers, distressed-finder management (scrape, AI grade, dedup, promote), revenue dashboard.
- Managers are **staff** and bypass subscription paywalls.

### 3.2 Gaps
- **[FIXED] No handoff from accepted owner deal to a manageable Property** — now covered by `promoteSaleProposalToProperty` (§1.2). The draft lands in the pipeline for a manager to attach an SPV, set the funding goal, and publish.
- **[OPEN-P1] Manual SPV/share-class setup after promotion.** Promotion creates the draft Property only; the manager must still create the SPV + share class + funding goal before publishing. Acceptable for now (keeps a human in the loop for a regulated step) but a guided "structure deal" wizard would reduce error.

---

## 4. Persona: Contractor

### 4.1 The flow as built
- `submitContractorSelfProfile` (self-onboarding), `acceptWorkOrder` (digital signature, retention % computed), progress/variation submission. Work orders are issued by managers; the contractor only sees their own.

### 4.2 Gaps
- **[OPEN-P2] No payment-on-completion linkage** between an approved work order/retention release and the property budget ledger / distributions. Low priority until developments run at volume.

---

## 5. Persona: Admin

- Full user management, revenue ledger, fee-config, audit log, compliance console (FICA/KYC review), sanctions screening stub.
- **[OPEN-P1] Sanctions screening is a stub** (`screenSanctions` always PASS) — wire a vendor (World-Check/ComplyAdvantage) before processing real money at scale.
- **[OPEN-P0] Money precision.** Money fields are `Float`; SARS IT3 reconciliation needs exact pennies. Migrate money columns to `Decimal(18,2)` before processing real distributions at scale (already flagged in `AUDIT_REPORT.md`). Not a code bug today, but a correctness liability at volume.

---

## 6. "How do we get our money?" — revenue capture map (verified)

Every money-movement point books to the single `PlatformRevenue` ledger (idempotent on `feeType+sourceType+sourceId`):

| Event | Fee | Rate | Booked in |
|-------|-----|------|-----------|
| Investor contribution paid | CAPITAL_RAISE | 2.5% | `investment-payments.ts` |
| Distribution created | DISTRIBUTION | 2.0% | `distributions.ts` |
| Secondary share trade fills | SECONDARY_TRADE | 1.0% | `share-marketplace.ts` |
| Deal sourced into pipeline | SOURCING | 1.0% | `acquisition.ts` |
| Owner proposal → review | ASSESSMENT_PACK | R2,500 | `owner-proposals.ts` |
| Owner deal accepted | SELLER_FACILITATION | 2.0% (1% Seller Pro) | `owner-proposals.ts` |
| Lease-back accepted | LEASE_BACK_SETUP | R5,000 | `owner-proposals.ts` |
| Bond present at accept | BOND_REFERRAL | configurable | `owner-proposals.ts` |
| JV payout / rent (recurring) | JV_PROMOTE / LEASE_BACK_MGMT | 10% / 8% | `owner-proposals.ts` |
| Subscriptions (6 tiers) | — | R0–R2,499/mo | `subscriptions/*` |

**Verified:** all four transaction-fee types and all owner-side fees are wired and idempotent. The only timing nuance to resolve is moving SELLER_FACILITATION from *acceptance* to a *close* event (see §1.2 [OPEN-P1]).

---

## 7. Fixes shipped this session

1. **[FIXED] Owner→investor pipeline bridge** — `promoteSaleProposalToProperty` + `OwnerSaleProposal.convertedToPropertyId/convertedAt` + router registration + `/sale-proposals` UI button. Closes the core marketplace break.
2. **[FIXED] Financing calculator — Loan & Equity** now shows **Monthly loan payment** and **Total repayment** (web `financing-calculator/index.tsx` + mobile `financing_calculator_page.dart`).
3. **[FIXED] Mobile distressed finder filters** — added a full filter bottom-sheet (province, city/suburb, property type, max price, min discount) to match the web, plus an active-filter count badge.
4. **[FIXED] Mobile distressed market-analysis** — the card's error handler silently hid itself; it now surfaces a "unavailable — retry" row. (The underlying server `CONVERTED`→`SOLD` enum bug that caused it was fixed earlier this session.)

## 8. Prioritised follow-up backlog

- **P0:** Float→Decimal(18,2) money migration (correctness at scale).
- **P1:** Seller close/settlement state machine + facilitation fee at close; cooling-off UI; sanctions vendor; canonical minimum-investment everywhere.
- **P2:** Net-proceeds estimate in owner portal; expected-vs-actual portfolio tracker; contractor payment linkage; guided "structure deal" wizard after promotion.
