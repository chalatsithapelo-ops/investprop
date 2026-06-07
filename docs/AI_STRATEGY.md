# Investprop AI Strategy

_Last updated: 2026-06-04_

## 1. Current AI surfaces (baseline)

| Surface | Model | File |
|---|---|---|
| Qualitative property analysis | `openai/gpt-4o` via OpenRouter | `src/server/trpc/procedures/analyzeProperty.ts` |
| Listing image generation | `openai/dall-e-3` | `src/server/trpc/procedures/generatePropertyImage.ts` |
| UI surface for analysis | — | `src/components/AIAnalysisDisplay.tsx` |

This puts us ahead of EasyEquities Property, Wealth Migrate, Fedgroup IMPACT, Stake, Arrived and Lofty — none of them ship per-deal AI underwriting. But it's a thin moat: one button on one screen, generic prompt, no external grounding.

## 2. Competitive gaps AI can own

SA fractional-property competitors (Wealth Migrate, EasyProperties, Picvest, Fedgroup) compete on deal count and headline yield. None solve the four problems that scare new investors:

1. **"I don't understand what I'm buying"** — jargon (cap rate, DSCR, IRR, Sec 96 prospectus, cooling-off).
2. **"Is this deal actually good?"** — no independent second opinion to the sponsor.
3. **"How does this fit my portfolio and tax situation?"** — no personalisation.
4. **"What happens when something goes wrong?"** — opaque construction progress, no early warning.

AI is uniquely suited to all four.

## 3. Roadmap

### Tier 1 — Quick wins (high impact, low effort)

- **1.1 Conversational Deal Co-Pilot** — streaming RAG chatbot on every opportunity page. Procedure `chatAboutProperty` using property + comparables + legal docs as context.
- **1.2 Personalised Risk Match Score** — 0-100 per investor × per deal, with one-paragraph "why this fits / doesn't fit you" justification. Surfaced on `PropertyCard` and grid.
- **1.3 Plain-Language Document Summariser** — auto-summary + watch-out-for clauses + glossary for every uploaded legal doc. Cached to `LegalDocument.aiSummary`.
- **1.4 Listing Quality Coach** — inline AI critic on `properties/new` that scores the listing (photos, description completeness, financial sanity) before publish.

### Tier 2 — Defensible (medium effort)

- **2.1 Independent AI Underwriting Second Opinion** — pull comparable sales (Lightstone / Property24), cross-check sponsor ARV/rent vs. comps, stress-test IRR (vacancy +2pp, rent -10%, build-cost +15%, exit cap +50bp), output sponsor-independent **Investprop Confidence Rating (A-E)**.
- **2.2 Vision-Model Construction-Progress Verification** — vision model checks site photos vs. milestone schedule, returns green/amber/red verification badge alongside Phase 12 variation history.
- **2.3 Portfolio Advisor** — monthly AI brief per investor: concentration risk, tax timing, distribution-reinvestment, marketplace gap-fillers. Stored as `PortfolioInsight`.
- **2.4 Auto-Generated Investor Update Emails** — AI drafts per-deal monthly letter from milestones + budget + market events; dev manager reviews + 1-click sends via Resend.

### Tier 3 — Moat (3-6 months)

- **3.1 Voice-First Onboarding & FICA Walkthrough** — Whisper STT + Realtime API for voice agent through appropriateness questionnaire + KYC + first deposit.
- **3.2 Predictive Distress / Early-Warning Engine** — classifier (or LLM-as-judge) on milestone/budget/variation history predicts delays/overruns. Admin dashboard + sponsor nudge.
- **3.3 Synthetic Sponsor Track-Record Profile** — public per-sponsor page with deals delivered, on-time %, on-budget %, IRR realised vs. promised, AI-summarised investor sentiment.
- **3.4 WhatsApp AI Concierge** — _DEFERRED per product decision (2026-06-04)._

## 4. Infra & cost rules

- All Tier 1 + most Tier 2 work on existing OpenRouter setup — no new vendor.
- Route high-volume / low-stakes calls (chat, summaries) to `gpt-4o-mini`. Reserve `gpt-4o` and `claude-3.5-sonnet` for underwriting + vision.
- Add `AIUsageLog` table for per-user/per-feature token accounting (margin + premium tier gating).
- Cache aggressively in Postgres: `AIAnalysis`, `LegalDocument.aiSummary`, `PortfolioInsight`, `Property.aiSummary`/`aiConfidenceRating`/`aiRiskScore`.
- Rate-limit per user in tRPC middleware.
- Every AI output that touches investment advice renders next to `RiskDisclaimer`. Treat AI output as **research**, never **advice** (FSCA-aligned).

## 5. Implementation status

| Feature | Status |
|---|---|
| 1.1 Conversational Deal Co-Pilot | ✅ live — `AICopilotChat` on `opportunities/$opportunityId` |
| 1.2 Personalised Risk Match Score | ✅ live — `AIMatchBadge` on cards + opportunity |
| 1.3 Plain-Language Document Summariser | ✅ live — `AIDocSummary` on `legal-documents` |
| 1.4 Listing Quality Coach | ✅ live — `AIListingCoach` on `properties/$propertyId/edit` |
| 2.1 Independent AI Underwriting | ✅ live — `AIConfidenceRating` on opportunity (manager-run, investor read-only) |
| 2.2 Vision Construction Verification | ✅ live — `AIPhotoCheck` on property timeline (manager) |
| 2.3 Portfolio Advisor | ✅ live — `AIPortfolioInsight` on `/portfolio` |
| 2.4 Auto Investor Update Emails | ✅ live — `AIInvestorUpdateEditor` on property timeline (manager) |
| 3.1 Voice Onboarding | ✅ backend chat-MVP (`ai-onboarding.ts`); voice UI deferred |
| 3.2 Predictive Distress | ✅ live — `/admin/ai-distress` watchlist |
| 3.3 Sponsor Track Record | ✅ live — `/sponsors/$sponsorId` page, linked from opportunity |
| 3.4 WhatsApp Concierge | _deferred_ |

### Models

- `cheap` → `openai/gpt-4o-mini` (chat, match score, listing coach)
- `premium` → `openai/gpt-4o` (underwriting, portfolio, distress, investor updates)
- `vision` → `openai/gpt-4o` (construction photo verification)


### Shared infrastructure

- `src/server/ai/client.ts` — OpenRouter provider, model tiers (cheap / premium / vision), per-feature in-memory rate limits, `runAIWithGuard` wrapper that records every call to `AIUsageLog` with latency + token spend.
- `src/server/ai/property-context.ts` — `buildPropertyContext()` + `findComparables()` for grounding LLM calls.
- Prisma additions: `AIUsageLog`, `PropertyChatMessage`, `PortfolioInsight`, `ConstructionPhotoCheck`, `InvestorUpdateDraft`, `DistressPrediction` + AI columns on `Property` and `LegalDocument`.

### UI status

All Tier-1/2/3 backends are now surfaced in the product (voice-onboarding UI is the only deferred screen):

- `AICopilotChat` panel on `opportunities/$opportunityId` — ✅
- `AIMatchBadge` on `PropertyCard` + opportunity — ✅
- `AIDocSummary` panel on legal documents page — ✅
- `AIListingCoach` panel on `properties/$propertyId/edit` — ✅
- `AIConfidenceRating` badge on opportunity (manager-run gate, investor read-only) — ✅
- `AIPhotoCheck` panel on property timeline (manager) — ✅
- `AIPortfolioInsight` card on `/portfolio` — ✅
- `AIInvestorUpdateEditor` on property timeline (manager) — ✅
- `/admin/ai-distress` admin watchlist (+ navbar link) — ✅
- `/sponsors/$sponsorId` track-record page, linked from opportunity — ✅
- Voice-onboarding chat overlay using `startOnboardingSession` / `continueOnboardingSession` — _deferred_

#### Defensive framing (sponsor track record + underwriting confidence)

These two "judgment" surfaces are built to inform without discouraging:

- **Underwriting confidence (A–E)** is a manager-run pre-publish gate, not a public verdict. Don't publish E-rated deals. The badge always reads as **research, not advice**; a lower letter means "ask more questions", never "avoid".
- **Sponsor track record** uses `MATURITY_THRESHOLD = 3`: new sponsors show a "Building a track record" card instead of a discouraging "0% on-time", so early sponsors aren't punished for thin history.

