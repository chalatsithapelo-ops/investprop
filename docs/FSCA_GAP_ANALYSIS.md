# FSCA Accreditation — Gap Analysis & Implementation Report

**Platform:** Investprop (pooled property investment)
**Prepared:** 7 June 2026
**Status:** Internal working document — *not legal advice*

> ⚠️ **Important:** This report is a technical + regulatory readiness assessment based on the current codebase and publicly known FSCA/FAIS/CISCA/FICA requirements. It is **not legal advice**. Before submitting any FSCA application you must engage an admitted FSP attorney / FAIS compliance practitioner to confirm the licensing route and sign off the application. The single largest gaps below are legal-structural and cannot be closed in code alone.

---

## 1. Executive Summary

Investprop pools money from members of the public into property-owning SPVs and pays them a share of rental income / sale proceeds. In South African law that activity sits squarely inside the financial-sector regulatory net. **You cannot lawfully solicit the general public to invest until you hold the correct authorisation.** Today the platform has strong *operational* compliance scaffolding (FICA workflow, appropriateness gate, audit trail, share register, cooling-off) but is **missing the licence itself and several statutory controls** that an FSCA assessor will require as conditions of authorisation.

**The decision that drives everything else: which regulatory route?**

| Route | What it allows | Bar to clear | Best when |
|---|---|---|---|
| **A. FAIS FSP licence + s96 private placement** (recommended starting point) | Market & intermediate the SPV shares to a **restricted** audience (qualifying investors, or ≤ the s96 public-offer thresholds, no general public solicitation) | FSP licence (Cat I), Key Individual with RE1/RE5 + experience, fit-&-proper, PI cover, FIC registration | You want to launch fastest and can accept marketing restrictions |
| **B. Collective Investment Scheme (CISCA) registration** | Openly offer participatory interests to the **general public** | Register the *scheme* + be a registered *CIS manager*: trustee/custodian (a registered bank), independent auditor, capital adequacy, FSCA-approved deed | You want true public crowdfunding at scale; much heavier and slower |
| **C. Stay outside both** (pure private, ≤50 investors/SPV, no public marketing) | Friends-and-family / club deals | Minimal | Not viable for a public-facing platform like this |

The existing code (`getFSCAReadiness` in [src/server/trpc/procedures/compliance.ts](src/server/trpc/procedures/compliance.ts#L250)) is written against **CISCA (Route B)**. If you actually intend Route A, the readiness checklist and several user-facing claims need re-framing. **Resolving this ambiguity is gap #1.**

**Overall platform readiness for the *supporting controls*: ~65%.** The remaining 35% plus the licence itself is what this report addresses.

---

## 2. What Is Already In Place (credit where due)

These are genuinely implemented and will support whichever route you choose:

- **FICA/KYC workflow** — `KYCDocument` model, document upload, admin review/approve/reject, FICA badges, exemption handling. ([src/routes/kyc-compliance](src/routes/kyc-compliance/index.tsx), [src/routes/admin/fica-verification](src/routes/admin/fica-verification/index.tsx))
- **FAIS appropriateness/suitability gate** — questionnaire (experience, income, net worth, loss tolerance, risk acknowledgements) is a **hard server-side gate** before any investment. ([src/components/AppropriatenessQuestionnaireModal.tsx](src/components/AppropriatenessQuestionnaireModal.tsx), gate in [submitInvestmentProposal.ts](src/server/trpc/procedures/submitInvestmentProposal.ts))
- **5-day cooling-off** — `coolingOffExpiresAt`, cancel procedure, investor-facing banner. ([src/components/CoolingOffBanner.tsx](src/components/CoolingOffBanner.tsx))
- **Risk disclosure** — risk badges + disclaimers, "returns not guaranteed" language, mandatory T&C checkboxes before investing.
- **Share register** — `ShareClass`, `ShareHolding`, `ShareLedger` (immutable transaction history), tamper-evident share certificates with validation hash + revocation.
- **Audit trail** — comprehensive `AuditLog` (actor, action, entity, old/new value, IP, UA), 5-year-retention-capable.
- **POPIA** — subject-access export ([/admin/popia-sar](src/routes/admin/popia-sar/index.tsx)), consent capture.
- **SPV structure** — CIPC reg no, SARS tax no, bank account, director, max-50-investor cap.
- **Compliance officer role** — `complianceOfficer` flag + RE licence field + `appointComplianceOfficer` procedure.

---

## 3. Gap Register

Legend: 🔴 Blocker (FSCA will refuse without it) · 🟠 Material (will be raised as a condition) · 🟡 Recommended (TCF / best practice)

### 3.1 Licensing & Legal Structure

| # | Gap | Sev | What FSCA requires | How to implement |
|---|---|---|---|---|
| L1 | **No FSP / CIS licence** | 🔴 | An authorisation to render financial services or operate a CIS. SPV shares are "securities"/a financial product under FAIS. | Engage FAIS attorney → choose Route A or B → file application. Route A (Cat I FSP) is the pragmatic start. Budget 4–9 months. |
| L2 | **Licensing route ambiguity in product & code** | 🔴 | Consistency between how you market, how you onboard, and what you're licensed for. | Decide A vs B. If A: re-label "CISCA readiness" → "FAIS + private-placement readiness"; enforce qualifying-investor / no-public-solicitation rules in onboarding. |
| L3 | **No Key Individual (KI) appointed** | 🔴 | A KI who is *fit & proper*: RE1 (KI) + RE5 (reps), relevant experience, honesty/integrity, financial soundness. | Appoint/hire a qualifying KI. Capture their RE numbers in the existing `complianceOfficerLicense` field; add a KI/representative register. |
| L4 | **Operating company fit-&-proper & capital adequacy not evidenced** | 🔴 | Minimum capital/liquidity, clean directors, operational ability. | Corporate/financial work outside the platform; keep evidence (CIPC, financials, org chart) in a document vault. |
| L5 | **Professional Indemnity (PI) cover** | 🟠 | FSPs must hold guarantees/PI cover appropriate to the business. | Procure PI cover; surface policy number in statutory disclosures (see D-series). |

### 3.2 AML / CFT (FICA) — *applies under both routes*

| # | Gap | Sev | What FSCA/FIC requires | How to implement |
|---|---|---|---|---|
| F1 | **Sanctions / PEP / TFS screening is a stub** | 🔴 | Screen every client against the FIC Targeted Financial Sanctions list + UN lists; identify Domestic/Foreign PEPs; ongoing re-screening. Currently `screenSanctions()` always returns PASS. ([investor-compliance.ts](src/server/trpc/procedures/investor-compliance.ts)) | Integrate a screening provider (e.g. an SA-aware vendor or the FIC TFS list feed). Store match results + disposition on the user; block onboarding on a hit pending manual clearance; log every check (already logged via `SCREEN_SANCTIONS`). |
| F2 | **No registration as an Accountable Institution / no RMCP** | 🔴 | Register with the FIC (goAML); adopt a board-approved **Risk Management & Compliance Programme**; appoint AML compliance officer. | Process + document task; reference the RMCP from a compliance page; store the goAML org ID. |
| F3 | **No STR/CTR/TFS reporting workflow** | 🟠 | File Suspicious Transaction Reports, Cash Threshold Reports (≥R49,999.99), and TFS property reports via goAML. | Add an internal "regulatory report" workflow + register (even if filing is manual to goAML initially). |
| F4 | **No risk-based customer due-diligence tiers** | 🟠 | CDD must be risk-rated (simplified vs enhanced due diligence for high-risk/PEP/high-value). | Add a `riskRating` + `cddTier` to the KYC flow; require source-of-funds evidence above thresholds and for PEPs. |
| F5 | **Source-of-funds / source-of-wealth not captured** | 🟠 | Required for EDD and large investments. | Add fields + document upload to KYC for investments above a configurable threshold. |

### 3.3 Investor Protection & Market Conduct (FAIS General Code / TCF / COFI)

| # | Gap | Sev | What's required | How to implement |
|---|---|---|---|---|
| C1 | **No statutory FAIS disclosures** | 🔴 | s4/5 General Code: disclose FSP name & licence no., categories, contact, compliance officer & FIC details, PI cover, complaints route, that the client may receive a record of advice. | Add a persistent **statutory disclosure footer** + a `/legal/disclosures` page rendered from config so the licence number is single-sourced. |
| C2 | **No conflicts-of-interest (COI) management policy** | 🔴 | General Code s3A: a **published, board-approved COI policy**; disclose actual/potential conflicts, fees, and any third-party benefits. | Create `/legal/conflicts-of-interest` page + capture investor acknowledgement (you already collect a `conflictOfInterestAck` checkbox — back it with a real published policy). |
| C3 | **No complaints-management framework** | 🔴 | FAIS + Conduct Standard: documented internal complaints procedure, complaints register, TCF categorisation, escalation to the **FAIS Ombud**, response timelines. | Build a `Complaint` model + `/complaints` submission page + admin queue + register export; publish the procedure and Ombud contact details. |
| C4 | **Advice vs execution-only not declared** | 🟠 | If no advice is given, you must say so; if advice is given, a **Record of Advice** must be generated. | Add an explicit "no advice / execution-only" declaration at the investment step, **or** generate a Record of Advice document. Keep the appropriateness result attached to each contribution. |
| C5 | **Financial-promotion / advertising controls** | 🟠 | Conduct Standard on advertising: fair, balanced, not misleading; prominent risk warnings; no implied guarantees; past-performance caveats. | Add a reusable, mandatory risk-warning block to *all* marketing/opportunity surfaces (partly done) + an internal advertising sign-off checklist. |
| C6 | **Client-money segregation not evidenced/reconciled** | 🟠 | Client funds must be separated from operating funds and reconciled. | Add a funds-reconciliation view matching investor payments → SPV/trust bank account; surface unreconciled items. (SPV bank fields already exist.) |
| C7 | **Investor categorisation (retail vs qualifying) not enforced** | 🟠 (🔴 under Route A) | s96 private-placement exemption depends on offerees being qualifying investors or within thresholds, with **no general public solicitation**. | Add an investor-category determination to onboarding (min R1m single investment / net-worth test) and gate "public" opportunities accordingly; log the basis of the s96 exemption per offer. |

### 3.4 Offer & Reporting Documents

| # | Gap | Sev | What's required | How to implement |
|---|---|---|---|---|
| D1 | **No registered prospectus / compliant offer document** | 🔴 | A public offer of shares needs a registered prospectus **unless** it qualifies as an exempt s96 private placement. | Either rely on the s96 exemption (C7) **or** produce a prospectus. Generate a per-SPV **offer document / placement memorandum** (risk factors, fees, conflicts, financials, exit) from the existing `legalDocument` generator. |
| D2 | **Investor tax certificates (IT3 series) are a stub** | 🟠 | Investors need IT3(b)/IT3(c) and dividends-tax certificates to file returns; you must submit IT3 data + dividends-tax returns to SARS. | Complete real PDF generation in the tax-certificate procedure using exact cents + correct SARS source codes; add the SARS IT3 data submission/export. |
| D3 | **MOI / shareholder agreement / cession are stubs** | 🟠 | Constitutive & rights documents per investor/SPV. | Complete the generators behind the existing `LegalDocument` types; require a signed shareholder agreement before shares are issued. |
| D4 | **No periodic investor reporting** | 🟡 | CISCA/TCF expect regular statements (holdings, valuations, distributions, fees). | Schedule quarterly/annual investor statements from existing distribution + ledger data. |

### 3.5 Data, Records & Governance

| # | Gap | Sev | What's required | How to implement |
|---|---|---|---|---|
| G1 | **Privacy policy / PAIA manual not confirmed as published** | 🟠 | POPIA + PAIA: published privacy notice, information-officer registration, PAIA manual. | Add `/legal/privacy` and `/legal/paia` pages; register the Information Officer with the Information Regulator. |
| G2 | **5-year retention not formalised** | 🟡 | FAIS/FICA: retain records 5 years. | Add a documented retention policy + ensure soft-delete (no hard purge) on KYC, contributions, audit, documents. |
| G3 | **No board/compliance reporting cadence** | 🟡 | Compliance officer must report to the FSCA (annual compliance report) and to the board. | Use the existing compliance dashboard to generate the periodic compliance report; store submissions. |

---

## 4. Recommended Implementation Roadmap

### Phase 0 — Decide the route (Weeks 0–2) · *gating, off-platform*
- Engage FAIS attorney / compliance house. Confirm **Route A (FAIS Cat I + s96 private placement)** vs **Route B (CISCA)**.
- Appoint Key Individual (RE1/RE5 + experience) and AML compliance officer.
- Start FSP application + FIC (goAML) registration + PI cover.
- **Deliverable:** signed-off licensing strategy. *Everything below assumes Route A unless told otherwise.*

### Phase 1 — FICA hardening (Weeks 2–5) · *platform*
1. Replace the sanctions stub (F1) with real TFS/PEP screening + block-on-hit + manual clearance queue.
2. Add risk-based CDD tiers + source-of-funds capture (F4, F5).
3. Add internal STR/CTR/TFS regulatory-report register (F3).

### Phase 2 — Market-conduct controls (Weeks 4–8) · *platform*
4. Statutory disclosure footer + `/legal/disclosures` (single-sourced licence number) (C1).
5. `/legal/conflicts-of-interest` policy + acknowledgement (C2).
6. Complaints framework: `Complaint` model, `/complaints` page, admin queue, register, Ombud details (C3).
7. Execution-only declaration **or** Record-of-Advice generation (C4).
8. Investor categorisation + s96 gating per offer (C7).

### Phase 3 — Documents & reporting (Weeks 6–10) · *platform*
9. Per-SPV offer document / placement memorandum generator (D1).
10. Real IT3 / dividends-tax certificate generation + SARS export (D2).
11. Complete MOI / shareholder agreement / cession generators; require signed shareholder agreement pre-issuance (D3).
12. Funds-reconciliation view (C6) + periodic investor statements (D4).

### Phase 4 — Data & governance (Weeks 8–11) · *mixed*
13. `/legal/privacy`, `/legal/paia`, Information Officer registration (G1).
14. Formal retention policy + verify no hard-deletes (G2).
15. Periodic compliance-report generation from the dashboard (G3).

### Phase 5 — Pre-submission dry run (Weeks 10–12)
16. Re-frame `getFSCAReadiness` to the chosen route; aim for 100% on supporting controls.
17. Independent compliance review / mock FSCA assessment.
18. Compile the application bundle (licence forms, KI CVs/RE certs, RMCP, COI policy, complaints policy, PI cover, financials, sample offer doc, privacy/PAIA).

---

## 5. Off-Platform Checklist (cannot be built in code)

These are the items an FSCA assessor cares most about and that **no amount of code will satisfy** — track them in a document vault:

- ✅ FSP / CIS licence application + fee
- ✅ Key Individual(s) — RE1/RE5 certificates, CVs, fit-&-proper evidence
- ✅ Representatives register + their RE5 / supervision arrangements
- ✅ Risk Management & Compliance Programme (RMCP) — board-approved
- ✅ FIC (goAML) registration as accountable institution
- ✅ Conflicts-of-interest management policy — board-approved & published
- ✅ Complaints-management policy + FAIS Ombud reference
- ✅ Professional Indemnity / fidelity cover
- ✅ Operating company financials + capital-adequacy evidence
- ✅ Information Officer registration (POPIA) + PAIA manual
- ✅ Auditor appointment (mandatory under CISCA; recommended under FAIS)
- ✅ Trustee / custodian arrangement (mandatory under Route B / CISCA)

---

## 6. Priority Call-Outs (start here)

1. **🔴 Resolve the licensing route (Route A vs B).** Nothing else can be finalised until this is decided — it changes your marketing, onboarding gates, and the readiness checklist itself.
2. **🔴 Replace the sanctions/PEP screening stub.** It currently always passes — this is both a FICA breach risk and the easiest "hard fail" for an assessor to spot. It is also fully buildable now.
3. **🔴 Add the statutory disclosure footer, conflicts policy, and complaints framework.** These three are squarely buildable on-platform and are standard FSCA conditions.
4. **🟠 Enforce investor categorisation + s96 gating** if you go Route A, so your marketing stays inside the private-placement exemption.

---

*End of report. Recommend circulating to your appointed FAIS compliance practitioner for validation before acting on the licensing route.*
