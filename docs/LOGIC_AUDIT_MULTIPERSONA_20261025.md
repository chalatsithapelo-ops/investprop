# Investprop — Multi-Persona End-to-End Logic Audit

**Date:** 2026-10-25
**Scope:** Full cross-persona logic audit (Property Owner, Investor, Contractor, Development/Project Manager, Admin) across the web app and Flutter mobile app, validated against live production data on `178.105.120.112`.
**Method:** Traced every persona's workflow procedure-by-procedure (tRPC `src/server/trpc/procedures/**`), cross-checked against the web routes (`src/routes/**`) and mobile features (`mobile/lib/features/**`), and confirmed each suspected gap against the live production database before fixing.

This audit extends the earlier owner-only audit (`docs/LOGIC_AUDIT_20261025.md`) to all user types, focusing on handoffs **between** personas.

---

## 1. Executive summary

| Area | Severity | Status |
|------|----------|--------|
| Broken access control on money-movement procedures | **Critical** | Fixed |
| Contractor never notified of manager actions | High | Fixed |
| Dual work-order accept bypassing signature + retention | High | Fixed |
| Publish-for-funding form broken against server schema | High | Fixed |
| Stale demo revenue (seed data, not a code bug) | Low | Documented |
| Contractors have no mobile UI | Low | Documented (by design) |

All fixes compile cleanly, pass the full test suite (107/107), and build successfully.

---

## 2. Critical — Broken access control (OWASP A01)

Five money-movement procedures ran on `baseProcedure` and called only `getAuthenticatedUser(authToken)` with **no role check**. Any authenticated user — including an ordinary `INVESTOR` — could invoke them directly via the tRPC endpoint, regardless of what the web UI exposes.

| Procedure | File | Risk |
|-----------|------|------|
| `createDistribution` | `src/server/trpc/procedures/distributions.ts` | Any user could raise a distribution against any property |
| `executeDistribution` | `src/server/trpc/procedures/distributions.ts` | Any user could mark payouts **PAID** and book distribution fees |
| `createShareClass` | `src/server/trpc/procedures/shares.ts` | Any user could define share price / caps |
| `createSPV` / `updateSPV` / `assignPropertyToSPV` / `removePropertyFromSPV` | `src/server/trpc/procedures/spv.ts` | Any user could create/alter SPVs and re-assign properties |
| `createAcquisition` / `updateAcquisitionStatus` | `src/server/trpc/procedures/acquisition.ts` | Any user could create acquisitions, trigger sourcing-fee booking, and notify all shareholders |

**Fix:** Added `requireRole(user, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"], …)` after authentication on every one of these procedures. `requireRole` already auto-allows `ADMIN` as a super-role, so admins retain access. The read-only list/get procedures (`getSPVs`, `getAcquisitions`, `getMyDistributions`) were intentionally left open to authenticated users.

---

## 3. High — Contractor persona handoffs (missing notifications)

The contractor workflow is driven entirely by managers, but several manager actions updated the database **without notifying the contractor**, leaving contractors with no signal to act. All in `src/server/trpc/procedures/contractor-management.ts`.

| Manager action | Before | After |
|----------------|--------|-------|
| `createRFQ` | Contractors only discovered tenders by manually browsing OPEN RFQs | Notifies all **APPROVED** contractors: "New Tender Available" |
| `reviewQuotation` | Accepting/rejecting a quote silently updated status | Notifies the reviewed contractor (accepted/rejected) **and** the non-selected bidders |
| `createWorkOrder` | Work order created silently | Notifies the contractor: "New Work Order Issued" with amount |
| `reviewContractorInvoice` | Invoice approved / rejected / **paid** silently | Notifies the contractor for every state change, including payment reference |

These close the loop so a contractor's dashboard and push notifications reflect every manager decision.

---

## 4. High — Dual work-order accept path (signature + retention bypass)

`acceptWorkOrder` (in `extended-workflows.ts`) is the intended accept path: it captures the contractor's **signature** and computes the **retention amount** (`agreedAmount × retentionPercent / 100`) and sets `acceptedAt`.

However, `updateWorkOrderStatus` also allowed a `CONTRACTOR` to set `status = "ACCEPTED"` directly — skipping the signature and retention logic entirely. This was confirmed in production: **WorkOrder #2 was `ACCEPTED` with `acceptedAt = NULL`** and no retention computed.

**Fix:** `updateWorkOrderStatus` now rejects `ACCEPTED` from contractors with a clear message directing them to the Accept & Sign action. Contractors may still use it to move a work order to `IN_PROGRESS` or `COMPLETED`; managers are unaffected.

---

## 5. High — Publish-for-funding form broken against server schema

`publishPropertyForFunding` requires `fundingClosingDate` and a `fundingBreakdown` array (min 1 item, amounts must sum to the funding goal). The only UI that calls it — `src/routes/funding-campaigns/index.tsx` — was sending `minimumInvestment`, `maximumInvestors`, and `expectedReturnRate` instead, so every publish attempt failed Zod validation. This blocks the core owner → investor pipeline (a property cannot start raising funds).

**Fix:** Replaced the three unsupported fields with a **funding closing-date picker** and a **funding-breakdown builder** (add/remove category + description + amount rows), added client-side validation mirroring the server (breakdown total must equal the funding goal), and updated `handlePublish` to send the correct payload.

---

## 6. Low — Stale demo revenue (not a code bug)

Production shows only one `PlatformRevenue` row (`SUBSCRIPTION / R299`). The existing **PAID** R25,000 contribution and the **DISTRIBUTED** distribution booked no capital-raise or distribution fee. Root cause: these records were written directly by `scripts/seed-demo.mjs`, which bypasses the fee-booking procedures.

The **live** paths are correct and were verified:
- `confirmPaymentAndUpdateFunding` (reached via Paystack verification and EFT proof-of-payment approval) books the `CAPITAL_RAISE` fee idempotently.
- `executeDistribution` books the `DISTRIBUTION` fee.
- `updateInvestorContribution` cannot set `paymentStatus = PAID`, so there is no fee-bypass path.

No code change required. Optionally, the two demo records can be backfilled for ledger consistency.

---

## 7. Low — Contractor mobile parity (by design)

The Flutter app (`mobile/lib/features/`) implements the investor and owner journeys with strong parity: appropriateness/suitability questionnaire (FAIS gate), KYC/FICA submission, cooling-off banner + cancellation, proof-of-payment upload, share certificates, distributions, tax certificate, and owner sale-proposal + counter-offer response. There is **no** contractor feature module on mobile. Contractors operate on the web only; this is acceptable for the current product scope and is documented rather than built out.

---

## 8. Validation

- `pnpm test:run` — **107/107 passing**
- `pnpm build` — **succeeds**
- `pnpm prisma generate` — clean
- Type/lint diagnostics on all six edited files — **no errors**

## 9. Files changed

- `src/server/trpc/procedures/distributions.ts`
- `src/server/trpc/procedures/shares.ts`
- `src/server/trpc/procedures/spv.ts`
- `src/server/trpc/procedures/acquisition.ts`
- `src/server/trpc/procedures/contractor-management.ts`
- `src/routes/funding-campaigns/index.tsx`
