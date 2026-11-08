"""
Investprop AI Property Office — realtime voice agent worker.

A LiveKit agent that speaks with a member and executes AI Property Office
functionality on their behalf. It is the realtime sibling of the existing
recorded voice turn: lower latency, fully conversational, and able to drive the
same office capabilities.

Security model
--------------
* The worker is dispatched explicitly into a room. The member's own office JWT
  arrives *privately* in the job metadata (never shared with other room
  participants).
* Every capability is executed through the backend action bridge
  (`POST /api/office-agent/execute`) using that JWT plus the shared
  ``AGENT_SHARED_SECRET``. The bridge re-validates the user, re-checks the
  subscription feature gate, and runs the same office domain functions the tRPC
  procedures use. The agent therefore cannot widen a user's scope or bypass the
  frozen task-digest approval.
* Tasks still go through prepare -> approve. The agent reads the frozen scope
  back to the member and only approves after an explicit verbal "yes".

Run locally:
    python voice_agent_worker.py dev
Run in production (container):
    python voice_agent_worker.py start
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
import httpx
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
    RunContext,
    function_tool,
)
from livekit.plugins import openai, silero

try:  # Optional: Google Gemini Live realtime plugin. Absent images fall back to OpenAI.
    from livekit.plugins import google  # type: ignore
except Exception:  # pragma: no cover - package may be absent in some images
    google = None  # type: ignore

try:  # Optional: LiveKit Cloud background-voice/noise cancellation. Degrade gracefully.
    from livekit.plugins import noise_cancellation  # type: ignore
except Exception:  # pragma: no cover - package may be absent in some images
    noise_cancellation = None  # type: ignore

logger = logging.getLogger("investprop-office-agent")
logging.basicConfig(level=logging.INFO)

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8010").rstrip("/")
AGENT_SHARED_SECRET = os.environ.get("AGENT_SHARED_SECRET", "")
AGENT_NAME = os.environ.get("VOICE_AGENT_NAME", "investprop-office-agent")
# Which realtime speech-to-speech provider to use: "openai" (default) or
# "gemini". OpenAI needs OPENAI_API_KEY + credits; Gemini needs GOOGLE_API_KEY
# (free tier available at https://aistudio.google.com/apikey).
VOICE_AGENT_PROVIDER = os.environ.get("VOICE_AGENT_PROVIDER", "openai").strip().lower()
# Warmer, more natural default voice for a professional "office" feel. Override
# with VOICE_AGENT_VOICE if a given realtime snapshot doesn't support it.
REALTIME_VOICE = os.environ.get("VOICE_AGENT_VOICE", "coral")
# Gemini Live uses a different voice name set than OpenAI (e.g. Puck, Charon,
# Kore, Fenrir, Aoede). Override with GEMINI_VOICE.
GEMINI_VOICE = os.environ.get("GEMINI_VOICE", "Puck")
# Use a half-cascade Live model, NOT the native-audio preview: the native-audio
# model dies mid-call with 1007 "session context exhausted / CONTENT_TYPE_AUDIO
# not supported", so the agent speaks for a while then goes silent.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-live-preview")
# The Gemini Live (bidi) endpoint only exists under v1alpha/v1beta; google-genai
# otherwise defaults to the stable v1 path and the websocket 404s. The plugin
# only forces v1alpha for affective-dialog/proactivity, so we set it ourselves.
GEMINI_API_VERSION = os.environ.get("GEMINI_API_VERSION", "v1alpha")
# Seconds of continuous member speech required before we interrupt the agent.
# Higher = the agent is not cut off by echo/brief noise (default 0.5 is too
# twitchy for speakerphone use). Override with MIN_INTERRUPTION_DURATION.
MIN_INTERRUPTION_DURATION = float(os.environ.get("MIN_INTERRUPTION_DURATION", "1.0"))
# Resilience: if the agent's own speech is cut by a *false* interruption (echo,
# a cough, background noise) resume the unfinished turn instead of going silent.
# This is the single biggest cause of "it spoke then went quiet forever".
RESUME_FALSE_INTERRUPTION = os.environ.get("RESUME_FALSE_INTERRUPTION", "true").strip().lower() != "false"
FALSE_INTERRUPTION_TIMEOUT = float(os.environ.get("FALSE_INTERRUPTION_TIMEOUT", "2.0"))


def _build_realtime_llm():
    """Return ``(model, provider_label, model_label)`` for the configured provider.

    Falls back to OpenAI if Gemini is requested but its plugin/key is missing so
    a misconfiguration never leaves the office without a voice.
    """
    if VOICE_AGENT_PROVIDER == "gemini":
        if google is None:
            logger.warning("VOICE_AGENT_PROVIDER=gemini but livekit google plugin is not installed; using OpenAI.")
        elif not os.environ.get("GOOGLE_API_KEY"):
            logger.warning("VOICE_AGENT_PROVIDER=gemini but GOOGLE_API_KEY is not set; using OpenAI.")
        else:
            logger.info("realtime provider=gemini model=%s voice=%s api_version=%s", GEMINI_MODEL, GEMINI_VOICE, GEMINI_API_VERSION)
            return (
                google.beta.realtime.RealtimeModel(
                    model=GEMINI_MODEL, voice=GEMINI_VOICE, api_version=GEMINI_API_VERSION
                ),
                "gemini",
                GEMINI_MODEL,
            )
    logger.info("realtime provider=openai voice=%s", REALTIME_VOICE)
    return openai.realtime.RealtimeModel(voice=REALTIME_VOICE), "openai", "gpt-realtime"

# How the agent presents itself and the guard rails it must honour. Mirrors the
# office policy: research + preparation, with explicit verbal approval before any
# task is executed, and no fabricated numbers.
INSTRUCTIONS = """
You are the Investprop AI Property Office — a spoken team of four specialists for
a verified member of Investprop, a South African property co-investment platform.
You act as the member's accountant, asset manager, administrator and tax adviser
in one voice. You are warm, sharp and decisive. This is a phone-style conversation,
so keep each spoken turn to one or two sentences and let the member interrupt you.

Your four lenses, each backed by real data tools AND real actions. You are FULLY
capable in every one — never tell the member a lens is "not something you can do":
  - ACCOUNTANT: payouts, distributions, ledger, reconciliation, record-keeping,
    and preparing a full ACCOUNTANT PACK for any tax year (see Taking action).
  - ASSET MANAGER: portfolio valuation, concentration, holdings, scenarios,
    opportunities and buy / hold / sell / rebalance views.
  - ADMINISTRATOR: pending payments, votes, compliance, paperwork, reminders and,
    for owners, a full OWNER CHECKLIST on their sale proposals.
  - TAX ADVISER: South African property tax, grounded in reviewed sources and the
    tax-estimate tool.

How to work (be genuinely useful, like a great human adviser):
  - ALWAYS ground answers in the tools. Pull the real numbers before you speak —
    get_briefing, get_portfolio_valuation, get_wallet, get_pending_items,
    get_opportunities, get_governance, get_compliance_status, get_marketplace,
    estimate_tax, accounting_exceptions, run_property_scenario, list_tax_sources.
  - To discuss ANY property the member is considering (not only what they own),
    use browse_listings to find it and get_listing_detail for its full investment
    case. Never say you can only see their portfolio — you can see every listing.
  - When the member asks how many shares or what percentage they'd own for a
    given amount, ALWAYS call estimate_ownership(property_id, amount). Many
    listings have a platform carry (the platform keeps a slice of equity), so a
    naive amount ÷ funding-goal is WRONG. Never do that arithmetic yourself —
    quote the ownership percentage and share count the tool returns.
  - Chain tools when a question needs it: e.g. value the portfolio, check
    concentration, then recommend a rebalance; or estimate tax, then suggest a
    provisional-tax reminder.
  - GIVE DIRECT RECOMMENDATIONS. Lead with your recommendation in plain words,
    then one line of reasoning, then the main risk or assumption. Don't hedge
    everything — the member wants a decisive adviser.
  - NEVER REFUSE OR DEFLECT. The member wants complete, specific answers. Always
    give the full information, strategy, numbers and step-by-step plan they ask
    for — including tax strategies, structuring ideas and optimisation moves
    based on their actual holdings. Do NOT say "I can't help with that, consult a
    professional" and stop. If a topic needs professional sign-off, give the
    FULL answer first and add a one-line disclaimer at the end (or start). The
    disclaimer supplements your answer; it must never replace or shorten it.
  - Use ask_specialist for nuanced written reasoning or tax-source research when
    the direct tools aren't enough. Use list_conversations and recall_conversation
    to continue or refer back to an earlier chat thread the member started.

Never leave dead air (critical — the member must never hear silence):
  - Before you call ANY tool that might take a moment (data pulls, packs, scenario
    or tax calculations, placing or preparing an action), FIRST say a short filler
    out loud so the line is never silent — e.g. "Let me pull that up.", "One
    second, checking that now.", "Give me a moment to work that out." THEN call
    the tool. When the result lands, continue speaking.
  - If a tool is slow or fails, say so and offer the next step; never just stop.
  - Keep talking in short beats. If you need to think, say a brief bridging phrase
    rather than pausing.

Show it on screen (pair every answer with the matching screen when it helps):
  - After you give figures or findings that have a screen (portfolio, wallet,
    distributions, an opportunity, the marketplace, a tax certificate), proactively
    offer to open it — "Want me to put your portfolio on screen?" — and if they say
    yes, call navigate while you summarise the numbers out loud. Summarise verbally
    AS the screen lands; don't wait in silence for it.
  - Right after you successfully prepare an ACCOUNTANT_PACK, OWNER_CHECKLIST or any
    task, open the office task inbox for them with navigate("aiOffice") so they can
    see and download the draft, and tell them it's waiting there.

Remember the member (build a lasting relationship across calls):
  - When the member tells you a durable fact about themselves — their entity type
    (personal / company / trust), marginal tax rate, investment goals, risk
    appetite, target monthly income, preferred cities or property types, or a
    deadline — call remember(note) to save a SHORT structured fact (e.g.
    "Entity: personal; marginal rate ~41%; goal: R15k/month passive by 2028; risk:
    moderate"). Save facts, not whole sentences. Never save secrets, ID, bank or
    token numbers.
  - At the start of a call you are given their saved notes and recent threads —
    use them: greet them in context and pick up where you left off instead of
    starting cold.

Say the disclaimer once, not every turn:
  - Give ONE brief spoken disclaimer early in the call (within your first couple of
    turns) that you are an information and research assistant, not a registered
    accountant, tax practitioner or financial services provider, and that material
    decisions should be confirmed with a registered professional. After you've said
    it once, do NOT repeat it every answer — a short "as I mentioned, confirm the big
    ones with your practitioner" is enough when it genuinely matters.

Taking action (you can actually DO things, not just advise):
  - You can place a real SELL order for the member's own shares. Use
    prepare_sell_order(property_id, quantity, limit_price_per_share?) — it checks
    their KYC, how many shares they can sell and the allowed price band, and
    returns a frozen scope. Read that scope back (property, quantity, price,
    estimated proceeds) and, only after a clear verbal yes, call approve_task
    with the returned task id and approvalDigest to actually place it.
  - You can set a REMINDER. You are told the current South African date and time
    at the start of the session — use it to compute dueAt as a future ISO-8601
    timestamp WITH the +02:00 offset (e.g. "2026-11-06T09:00:00+02:00"). Call
    prepare_task(kind="REMINDER", title, {"dueAt": ..., "notes": ...}), read the
    time back, then approve_task after a yes.
  - You can prepare an ACCOUNTANT_PACK and, for owners, an OWNER_CHECKLIST. These
    are REAL capabilities you fully support — NEVER say you cannot create an
    accounting/accountant pack or an owner checklist. The ONLY requirement is one
    detail each: ACCOUNTANT_PACK needs {"taxYear": int} and OWNER_CHECKLIST needs
    {"proposalId": int}. If the member hasn't given it, do NOT refuse — ask one
    short question ("Which tax year — the 2026 year that ended this past
    February?") or offer the most recently completed SA tax year, then call
    prepare_task(kind="ACCOUNTANT_PACK", title, {"taxYear": <year>}) (or
    OWNER_CHECKLIST with the member's proposalId — use get_data/list to find it if
    needed). Read the frozen scope back, then approve_task after a clear yes. The
    SA tax year ending in February of year N is "tax year N".

Driving the app screen (open pages / press buttons for the member):
  - You control the member's live app screen. When they ask to open, show, go to,
    take me to or pull up a page or screen, call navigate(page, id?) with the
    matching page name below. The screen changes instantly on their device.
  - Confirm briefly after you navigate ("Opening your wallet now."). If a page
    needs a specific property or listing, pass its numeric id.
  - "Pressing a button" that performs a real action (invest, pay, vote, buy/sell,
    withdraw, deposit, apply) is done through the guard-railed prepare -> confirm
    tools, NOT by navigate — navigate only opens the relevant screen. If the
    member says e.g. "press invest on property 12", open it with
    navigate("invest", 12) so they see the form, and offer to complete it.
  - Valid page names: dashboard, opportunities, property (needs id), invest
    (needs id), portfolio, wallet, deposit, withdraw, transactions, distributions,
    contributions, payments, marketplace, ledger, shareIntegrity, metrics,
    documents, taxCertificates, certificates, statements, trackRecord, kyc,
    distressedDeals, distressedAlerts, distressedFinder, landPartnership,
    resaleMarket, saleProposals, subscription, pricing, preferences, prequalify,
    homeLoan, services, notifications, profile, aiOffice.

Full capability toolkit (you can do almost anything the app can):
  - list_capabilities() returns the complete catalog of actions you can run, each
    with a name, whether it is a read or a write, and a description. Call it when
    you are unsure whether something is possible — the answer is usually yes.
  - get_data(name, args) runs any READ action and returns live data. Examples:
    get_data("myWallet"), get_data("myContributions"), get_data("myOrders"),
    get_data("investorPortfolio"), get_data("myHomeLoanApplications"),
    get_data("marketplaceOverview"), get_data("proposals", {"status": "OPEN"}),
    get_data("lookupInvestor", {"investorCode": "ABC123"}).
  - prepare_action(name, args) freezes any WRITE action and returns a plain-English
    summary plus a taskId and approvalDigest. Read the summary back, get a clear
    verbal yes, then call confirm_action(task_id, approval_digest) to actually do
    it. Examples of write actions: castVote, submitInvestmentProposal,
    initiateInvestmentPayment, requestRefund, placeShareOrder, cancelShareOrder,
    transferShares, initiateWalletDeposit, requestWithdrawal, expressResaleInterest,
    requestReferralIntro, submitHomeLoanApplication, acceptHomeLoanOffer,
    updateProfile, updateInvestorPreferences, setDistressedAlerts, setAiDigestOptOut,
    submitAppropriateness, submitPrequalification, markNotificationsRead.
  - For money-moving actions (invest, pay, deposit, withdraw, buy/sell/transfer
    shares, vote, accept a loan offer) be extra careful: read the full summary —
    including every amount and reference number — back slowly before confirming.
    If the member changes any detail, prepare a fresh action; never reuse an old
    taskId with new numbers.

Memory (you get smarter over time):
  - At the start you are given the member's saved notes. Use them naturally.
  - When the member states a lasting preference or fact (risk appetite, goals,
    entity type, tax rate, cities they like), call remember to save a short note.

Goals and mandate (be their long-term partner, not a one-off Q&A):
  - Treat the member as someone building towards a goal. If their saved notes hold
    a goal (e.g. "R15k/month passive by 2028", "diversify out of one city"), open
    the call against it: where they are versus that target, and the single best
    next move. If they have no goal on record, ask once for the big one — target
    monthly income, a lump sum, or a timeline — and remember(note) it.
  - Every recommendation should connect back to the goal: say how this move gets
    them closer (e.g. "this adds about R900 a month toward your R15k target").

Portfolio construction and tax-aware moves (think like a wealth manager):
  - Use get_portfolio_valuation and get_briefing to see concentration (too much in
    one property, city or sponsor), cash sitting idle in the wallet, and income
    versus growth mix. Call out concentration risk plainly and propose a concrete
    rebalance with specific listings from get_opportunities / browse_listings.
  - Make moves tax-aware: before suggesting a sell, note the CGT angle via
    estimate_tax and whether timing across a tax-year boundary helps; when they
    have idle cash, weigh deploying it versus a provisional-tax set-aside. Always
    give the full move AND its tax consequence, then the one-line disclaimer.

Deal sourcing to a member's mandate (bring them deals, don't wait to be asked):
  - If you know their mandate (preferred cities, property types, min/max ticket,
    target yield — from saved notes or get_data("investorPreferences")), proactively
    surface the best 1-2 current listings that fit it using get_data("recommendedListings")
    (or browse_listings filtered to their mandate). Lead with why each fits their
    mandate and goal, give the real numbers from get_listing_detail and
    estimate_ownership, and offer to open it with navigate("property", id).
  - If no mandate is on record, ask one or two short questions (cities, ticket
    size, income vs growth), remember it, then source against it.

First call / onboarding (get a new member to their first real step):
  - If the briefing shows they are new, unverified, or have no holdings, be a warm
    guide: explain in one or two sentences how Investprop works, then walk them to
    the single most important next step. If KYC/FICA is incomplete, offer to open
    it with navigate("kyc") and talk them through it. If they are verified but
    haven't invested, source one well-fitting opportunity and offer to open the
    invest screen. One step at a time — never dump a checklist.

Accessibility and voice-first members:
  - Some members rely on you because reading dense screens is hard for them. Make
    the voice channel self-sufficient: read the key numbers and the decision out
    loud clearly, offer to open the matching screen but never REQUIRE them to look
    at it, and pace yourself. If they ask you to slow down, repeat, or spell
    something, do it plainly and patiently.

When a human should step in (offer a handoff, don't pretend):
  - For things outside your remit — a dispute, a suspected error in their account,
    a complaint, a legal/contractual decision, or anything they explicitly want a
    person for — say so honestly and offer to have the Investprop team follow up.
    If they say yes, call request_handoff(reason, summary) to log it for the team
    (it does NOT move money or change anything), confirm you've flagged it, and
    tell them roughly when to expect contact. Keep helping with what you CAN do in
    the meantime.

Hard rules — never break these:
  1. Never invent figures. Every number you say must come from a tool result. If
     it's unknown, say so and offer to find it.
  2. CURRENCY: every amount in this app is in South African Rand (ZAR). Always
     speak amounts as rand — e.g. "R1 250" is "one thousand two hundred and fifty
     rand", "R2.5m" is "two and a half million rand". NEVER say "dollars",
     "US dollars" or "$"; the "R" prefix and ZAR both mean rand. Cents are cents.
  3. You may READ data and PREPARE tasks freely. Before you APPROVE a task you
     MUST read back its exact frozen scope and ask the member to confirm out loud.
     Only call approve_task (or confirm_action for a prepared action) after a clear
     yes. If they hesitate, do not approve.
  4. Tax: give the member the COMPLETE tax strategy or answer they ask for,
     specific to their holdings — steps, structures, allowances, timing and
     optimisation moves. Ground any figure in estimate_tax or tool results and
     call it an estimate with its assumptions. Then add a brief spoken
     disclaimer that this is general information and a registered tax
     practitioner should confirm it before they act. NEVER refuse to give a tax
     strategy or send them away to a consultant instead of answering.
  5. You give full, specific recommendations and strategies. You are not a
     licensed/registered accountant, tax practitioner or financial services
     provider, so add a short disclaimer for material decisions — but always
     provide the complete information first; never withhold or water it down.
  6. Read evidence tags like [evidence:...] silently; never speak them aloud, and
     never read account numbers or tokens aloud.

Start by greeting the member by name and proactively mentioning the one or two
most useful items from their briefing, then ask how you can help.
""".strip()


class OfficeBridge:
    """Thin authenticated relay to the backend office action bridge."""

    def __init__(self, auth_token: str) -> None:
        self._auth_token = auth_token
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(45.0))
        # Lightweight per-session telemetry counters (read at shutdown).
        self.calls = 0
        self.errors = 0

    async def execute(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not AGENT_SHARED_SECRET:
            return {"ok": False, "reason": "Agent bridge secret is not configured."}
        # Don't count the metrics post itself as a tool call.
        if payload.get("action") != "logVoiceSession":
            self.calls += 1
        try:
            response = await self._client.post(
                f"{BACKEND_URL}/api/office-agent/execute",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self._auth_token}",
                    "x-agent-secret": AGENT_SHARED_SECRET,
                    "Content-Type": "application/json",
                },
            )
        except httpx.HTTPError as exc:  # network / timeout
            logger.warning("bridge request failed: %s", exc)
            self.errors += 1
            return {"ok": False, "reason": "The office service is unreachable right now."}

        try:
            data = response.json()
        except ValueError:
            self.errors += 1
            return {"ok": False, "reason": f"Unexpected response ({response.status_code})."}

        if not isinstance(data, dict):
            self.errors += 1
            return {"ok": False, "reason": "Unexpected response from the office service."}
        if not data.get("ok", False) and payload.get("action") != "logVoiceSession":
            self.errors += 1
        return data

    async def aclose(self) -> None:
        await self._client.aclose()


def _summarise(data: dict[str, Any]) -> str:
    """Return a compact JSON string for the model to reason over."""
    if not data.get("ok", False):
        return json.dumps({"ok": False, "reason": data.get("reason", "The action could not be completed.")})
    return json.dumps({"ok": True, "result": data.get("result")}, default=str)[:6000]


# Canonical page names the agent may open on the member's live screen. The web
# and Flutter clients each map these names to their own route. Pages marked with
# True require a numeric id (property / listing).
NAV_PAGES: dict[str, bool] = {
    "dashboard": False,
    "opportunities": False,
    "property": True,
    "invest": True,
    "portfolio": False,
    "wallet": False,
    "deposit": False,
    "withdraw": False,
    "transactions": False,
    "distributions": False,
    "contributions": False,
    "payments": False,
    "marketplace": False,
    "ledger": False,
    "shareIntegrity": False,
    "metrics": False,
    "documents": False,
    "taxCertificates": False,
    "certificates": False,
    "statements": False,
    "trackRecord": False,
    "kyc": False,
    "distressedDeals": False,
    "distressedAlerts": False,
    "distressedFinder": False,
    "landPartnership": False,
    "resaleMarket": False,
    "saleProposals": False,
    "subscription": False,
    "pricing": False,
    "preferences": False,
    "prequalify": False,
    "homeLoan": False,
    "services": False,
    "notifications": False,
    "profile": False,
    "aiOffice": False,
}
# Common synonyms the model (or member) might use, mapped to a canonical name.
NAV_ALIASES: dict[str, str] = {
    "home": "dashboard",
    "overview": "dashboard",
    "invest-page": "invest",
    "deals": "opportunities",
    "listings": "opportunities",
    "opportunity": "property",
    "market": "marketplace",
    "shares": "marketplace",
    "share-marketplace": "marketplace",
    "sharemarketplace": "marketplace",
    "voting": "distributions",
    "votes": "distributions",
    "distribution": "distributions",
    "my-documents": "documents",
    "document-vault": "documents",
    "documentvault": "documents",
    "tax-certificates": "taxCertificates",
    "tax": "taxCertificates",
    "share-ledger": "ledger",
    "share-integrity": "shareIntegrity",
    "track-record": "trackRecord",
    "distressed": "distressedDeals",
    "distressed-deals": "distressedDeals",
    "deal-alerts": "distressedAlerts",
    "dealalerts": "distressedAlerts",
    "land": "landPartnership",
    "land-partnership": "landPartnership",
    "resale": "resaleMarket",
    "resale-market": "resaleMarket",
    "sale-proposals": "saleProposals",
    "billing": "subscription",
    "plan": "subscription",
    "plans": "pricing",
    "home-loan": "homeLoan",
    "homeloan": "homeLoan",
    "bond": "homeLoan",
    "referrals": "services",
    "referral": "services",
    "notification": "notifications",
    "account": "profile",
    "settings": "profile",
    "ai-office": "aiOffice",
    "office": "aiOffice",
    "contribution": "contributions",
    "my-contributions": "contributions",
}


def _canonical_page(name: str) -> str | None:
    key = (name or "").strip()
    if key in NAV_PAGES:
        return key
    lowered = key.lower()
    if lowered in NAV_ALIASES:
        return NAV_ALIASES[lowered]
    # Try case-insensitive match against canonical names.
    for canonical in NAV_PAGES:
        if canonical.lower() == lowered:
            return canonical
    return None



class OfficeAgent(Agent):
    def __init__(self, bridge: OfficeBridge, member_name: str | None, member_context: str | None = None) -> None:
        greeting_name = member_name or "there"
        context_block = f"\n\n{member_context}" if member_context else ""
        super().__init__(instructions=f"{INSTRUCTIONS}\n\nThe member's name is {greeting_name}.{context_block}")
        self._bridge = bridge
        self._room: rtc.Room | None = None

    def set_room(self, room: rtc.Room) -> None:
        """Attach the live LiveKit room so UI-control tools can push data packets
        to the member's client (web or Flutter)."""
        self._room = room

    async def _publish_ui(self, payload: dict[str, Any]) -> bool:
        """Send a UI-control packet to the member's app over the room data channel."""
        room = self._room
        participant = getattr(room, "local_participant", None) if room is not None else None
        if participant is None:
            return False
        try:
            await participant.publish_data(
                json.dumps(payload).encode("utf-8"),
                reliable=True,
                topic="office-agent-ui",
            )
            return True
        except Exception as exc:  # pragma: no cover - transport best-effort
            logger.warning("publish_ui failed: %s", exc)
            return False

    async def publish_transcript(self, role: str, text: str, final: bool = True) -> None:
        """Stream a transcript line to the member's app over the room data channel.

        Published on a distinct topic ("office-agent-transcript") so the web and
        Flutter clients can render a live, cited transcript without interfering
        with the UI-control ("office-agent-ui") packets. Best-effort only — a
        failure here must never disturb the conversation.
        """
        room = self._room
        participant = getattr(room, "local_participant", None) if room is not None else None
        if participant is None:
            return
        cleaned = (text or "").strip()
        if not cleaned:
            return
        try:
            await participant.publish_data(
                json.dumps(
                    {
                        "v": 1,
                        "type": "transcript",
                        "role": "assistant" if role in ("assistant", "agent") else "user",
                        "text": cleaned,
                        "final": bool(final),
                        "ts": datetime.now(timezone.utc).isoformat(),
                    }
                ).encode("utf-8"),
                reliable=True,
                topic="office-agent-transcript",
            )
        except Exception as exc:  # pragma: no cover - transport best-effort
            logger.debug("publish_transcript failed: %s", exc)

    # --- Screen control (open pages on the member's device) ----------------

    @function_tool
    async def navigate(
        self,
        _context: RunContext,
        page: str,
        id: int | None = None,
    ) -> str:
        """Open a page on the member's live app screen (web or mobile). Use this
        whenever the member asks to open, show, go to or pull up a screen.

        Args:
            page: A page name, e.g. "wallet", "portfolio", "opportunities",
                "distributions", "marketplace", "kyc", "taxCertificates",
                "homeLoan", "property" (needs id), "invest" (needs id). Call
                list_capabilities-style wording loosely; synonyms are accepted.
            id: The numeric property or listing id, required only for pages like
                "property", "invest" and other id-scoped screens.
        """
        canonical = _canonical_page(page)
        if canonical is None:
            return json.dumps({
                "ok": False,
                "reason": f"'{page}' is not a page I can open.",
                "validPages": sorted(NAV_PAGES.keys()),
            })
        if NAV_PAGES[canonical] and id is None:
            return json.dumps({
                "ok": False,
                "reason": f"The '{canonical}' page needs a property or listing id. Ask the member which one.",
            })
        payload: dict[str, Any] = {"v": 1, "type": "navigate", "page": canonical}
        if id is not None:
            payload["id"] = id
        delivered = await self._publish_ui(payload)
        logger.info("navigate page=%s id=%s delivered=%s", canonical, id, delivered)
        if not delivered:
            return json.dumps({
                "ok": False,
                "reason": "I couldn't reach the app screen just now — the member can open it from the menu.",
            })
        return json.dumps({"ok": True, "opened": canonical, "id": id})

    # --- Read capabilities -------------------------------------------------


    @function_tool
    async def get_overview(self, _context: RunContext) -> str:
        """Get a snapshot of the member's portfolio and office context."""
        return _summarise(await self._bridge.execute({"action": "overview"}))

    @function_tool
    async def ask_specialist(
        self,
        _context: RunContext,
        persona: str,
        message: str,
        conversation_id: str | None = None,
    ) -> str:
        """Ask one of the office specialists a question.

        Args:
            persona: One of ACCOUNTANT, TAX, ASSET or ADMIN.
            message: The member's question in natural language.
            conversation_id: Optional id of a prior conversation to continue so the
                thread keeps its context. Omit to start a fresh thread.
        """
        persona = persona.strip().upper()
        if persona not in {"ACCOUNTANT", "TAX", "ASSET", "ADMIN"}:
            return json.dumps({"ok": False, "reason": "Persona must be ACCOUNTANT, TAX, ASSET or ADMIN."})
        payload: dict[str, Any] = {"action": "chat", "persona": persona, "message": message}
        if conversation_id:
            payload["conversationId"] = conversation_id
        return _summarise(await self._bridge.execute(payload))

    @function_tool
    async def list_conversations(self, _context: RunContext) -> str:
        """List the member's recent AI Property Office chat conversations with their
        titles and ids, so you can continue or refer back to an earlier thread."""
        return _summarise(await self._bridge.execute({"action": "listConversations"}))

    @function_tool
    async def recall_conversation(self, _context: RunContext, conversation_id: str) -> str:
        """Read back the messages of one of the member's earlier chat conversations
        so you have its full context before continuing it by voice.

        Args:
            conversation_id: The id from list_conversations.
        """
        return _summarise(
            await self._bridge.execute({"action": "getConversation", "conversationId": conversation_id})
        )

    @function_tool
    async def run_property_scenario(
        self,
        _context: RunContext,
        property_id: int,
        rent_change_pct: float,
        vacancy_rate_pct: float,
        operating_cost_change_pct: float,
        interest_rate_change_pp: float,
    ) -> str:
        """Run a one-year rental stress scenario for a property the member can access.

        Args:
            property_id: The numeric property id.
            rent_change_pct: Percentage change to rent (-100 to 100).
            vacancy_rate_pct: Assumed vacancy rate (0 to 100).
            operating_cost_change_pct: Percentage change to operating costs (-100 to 200).
            interest_rate_change_pp: Interest-rate change in percentage points (-20 to 20).
        """
        return _summarise(
            await self._bridge.execute(
                {
                    "action": "propertyScenario",
                    "propertyId": property_id,
                    "assumptions": {
                        "rentChangePct": rent_change_pct,
                        "vacancyRatePct": vacancy_rate_pct,
                        "operatingCostChangePct": operating_cost_change_pct,
                        "interestRateChangePp": interest_rate_change_pp,
                    },
                }
            )
        )

    @function_tool
    async def list_tasks(self, _context: RunContext) -> str:
        """List the member's office tasks and their statuses."""
        return _summarise(await self._bridge.execute({"action": "listTasks"}))

    @function_tool
    async def accounting_exceptions(self, _context: RunContext) -> str:
        """List reconciliation observations across the member's records."""
        return _summarise(await self._bridge.execute({"action": "accountingExceptions"}))

    @function_tool
    async def list_tax_sources(self, _context: RunContext) -> str:
        """List the reviewed South African tax sources available to the member."""
        return _summarise(await self._bridge.execute({"action": "taxSources"}))

    @function_tool
    async def get_briefing(self, _context: RunContext) -> str:
        """Get a proactive briefing: portfolio value, wallet, pending payments,
        open votes, open opportunities and whether FICA needs attention."""
        return _summarise(await self._bridge.execute({"action": "briefing"}))

    @function_tool
    async def get_portfolio_valuation(self, _context: RunContext) -> str:
        """Get the live portfolio valuation: current reference value, cost basis,
        unrealised gain and concentration by city, type and risk."""
        return _summarise(await self._bridge.execute({"action": "portfolioValuation"}))

    @function_tool
    async def get_wallet(self, _context: RunContext) -> str:
        """Get the member's wallet balance and most recent transactions (ZAR)."""
        return _summarise(await self._bridge.execute({"action": "wallet"}))

    @function_tool
    async def get_pending_items(self, _context: RunContext) -> str:
        """List the member's contributions that are awaiting payment or review."""
        return _summarise(await self._bridge.execute({"action": "pendingItems"}))

    @function_tool
    async def get_opportunities(self, _context: RunContext) -> str:
        """List open investment opportunities with their live expected returns."""
        return _summarise(await self._bridge.execute({"action": "opportunities"}))

    @function_tool
    async def get_governance(self, _context: RunContext) -> str:
        """List open shareholder proposals on the member's properties and how they voted."""
        return _summarise(await self._bridge.execute({"action": "governance"}))

    @function_tool
    async def get_compliance_status(self, _context: RunContext) -> str:
        """Get the member's FICA / KYC compliance status and any action needed."""
        return _summarise(await self._bridge.execute({"action": "complianceStatus"}))

    @function_tool
    async def get_marketplace(self, _context: RunContext) -> str:
        """List the member's open secondary-market share orders."""
        return _summarise(await self._bridge.execute({"action": "marketplace"}))

    @function_tool
    async def browse_listings(
        self,
        _context: RunContext,
        query: str | None = None,
        property_type: str | None = None,
        city: str | None = None,
        open_for_investment_only: bool = False,
    ) -> str:
        """Browse ANY published property listing on the platform — not just the
        member's own holdings. Use this to discuss a property the member is
        looking at or to find investments matching what they want.

        Args:
            query: Free-text search over title, description, city or address.
            property_type: Optional filter: flip, rental or development.
            city: Optional city to narrow to.
            open_for_investment_only: If true, only listings currently raising funds.
        """
        payload: dict[str, Any] = {"action": "browseListings"}
        if query:
            payload["query"] = query
        if property_type and property_type.strip().lower() in {"flip", "rental", "development"}:
            payload["propertyType"] = property_type.strip().lower()
        if city:
            payload["city"] = city
        if open_for_investment_only:
            payload["investmentStatus"] = "RAISING_FUNDS"
        return _summarise(await self._bridge.execute(payload))

    @function_tool
    async def get_listing_detail(self, _context: RunContext, property_id: int) -> str:
        """Get the full investment case for one published listing: price, minimum,
        funding progress, expected return, risk, AI confidence, share classes and
        type-specific figures. Use this before advising on whether to invest.

        Args:
            property_id: The numeric id from browse_listings or get_opportunities.
        """
        return _summarise(await self._bridge.execute({"action": "listingDetail", "propertyId": property_id}))

    @function_tool
    async def estimate_ownership(
        self,
        _context: RunContext,
        property_id: int,
        amount: float,
    ) -> str:
        """Estimate how many shares and what percentage of a listing the member
        would own for a given cash amount. This already accounts for any platform
        carry and the listing's share class, so ALWAYS use it for ownership /
        share questions — never divide the amount by the funding goal yourself.

        Args:
            property_id: The numeric id from browse_listings or get_listing_detail.
            amount: The cash the member would invest, in Rand.
        """
        return _summarise(
            await self._bridge.execute(
                {"action": "estimateOwnership", "propertyId": property_id, "amount": amount}
            )
        )

    @function_tool
    async def prepare_sell_order(
        self,
        _context: RunContext,
        property_id: int,
        quantity: int,
        limit_price_per_share: float | None = None,
        notes: str = "",
    ) -> str:
        """Prepare (but do NOT place) a limit SELL order for the member's own shares
        in a property on the secondary market. This is a REAL financial action, so
        it returns a frozen scope and an approvalDigest — you MUST read the scope
        back (property, quantity, price per share, estimated proceeds and the
        allowed price band) and get an explicit verbal "yes" before calling
        approve_task. Only then does the order actually get placed.

        Args:
            property_id: The numeric property id the member holds shares in (from
                get_portfolio_valuation or get_marketplace).
            quantity: How many shares to sell. Must not exceed what they can sell.
            limit_price_per_share: Optional asking price per share in Rand. If
                omitted, the current reference price is used. It must fall inside
                the share class's price band, which the preview states.
            notes: Optional short note to attach to the order.
        """
        parameters: dict[str, Any] = {"propertyId": property_id, "quantity": quantity}
        if limit_price_per_share is not None:
            parameters["limitPricePerShare"] = limit_price_per_share
        if notes.strip():
            parameters["notes"] = notes.strip()[:4000]
        return _summarise(
            await self._bridge.execute(
                {
                    "action": "prepareTask",
                    "kind": "SELL_SHARES",
                    "title": f"Sell {quantity} shares in property {property_id}",
                    "parameters": parameters,
                }
            )
        )

    @function_tool
    async def estimate_tax(
        self,
        _context: RunContext,
        tax_year: int,
        marginal_rate_pct: float | None = None,
        age_under_65: bool | None = None,
    ) -> str:
        """Estimate the member's South African tax from their platform distribution
        records for a tax year. Always present the result as an estimate with its
        assumptions, never as a filing.

        Args:
            tax_year: SA assessment year, e.g. 2027 covers 1 Mar 2026 to 28 Feb 2027.
            marginal_rate_pct: The member's marginal income-tax rate (0-45). Ask
                for it if unknown; otherwise a default is assumed and stated.
            age_under_65: Whether the member is under 65 (affects interest exemption).
        """
        payload: dict[str, Any] = {"action": "taxEstimate", "taxYear": tax_year}
        if marginal_rate_pct is not None:
            payload["marginalRatePct"] = marginal_rate_pct
        if age_under_65 is not None:
            payload["ageUnder65"] = age_under_65
        return _summarise(await self._bridge.execute(payload))

    @function_tool
    async def recall_memory(self, _context: RunContext) -> str:
        """Recall the member's saved cross-session notes and preferences."""
        return _summarise(await self._bridge.execute({"action": "getMemory"}))

    @function_tool
    async def remember(self, _context: RunContext, note: str) -> str:
        """Save a short, lasting note about the member for future sessions, e.g. a
        stated preference, goal, entity type or tax rate. Keep it under 280
        characters and only save things the member actually told you.

        Args:
            note: The fact or preference to remember, in the member's own terms.
        """
        return _summarise(await self._bridge.execute({"action": "saveMemory", "text": note}))

    @function_tool
    async def request_handoff(
        self,
        _context: RunContext,
        reason: str,
        summary: str,
    ) -> str:
        """Flag that a human from the Investprop team should follow up with the
        member. Use this for disputes, suspected account errors, complaints,
        legal/contractual decisions, or anything the member explicitly wants a
        person for. This only LOGS a follow-up request for the team — it never
        moves money or changes the member's account. Tell the member you've
        flagged it and roughly when to expect contact.

        Args:
            reason: A short category/reason, e.g. "account dispute",
                "suspected error", "complaint", "legal question",
                "requested a person".
            summary: One or two sentences capturing what the member needs, in
                plain language, so the team can act without re-asking.
        """
        return _summarise(
            await self._bridge.execute(
                {
                    "action": "requestHandoff",
                    "reason": (reason or "").strip()[:120],
                    "summary": (summary or "").strip()[:1500],
                }
            )
        )

    # --- Prepare / approve (guard-railed) ----------------------------------

    @function_tool
    async def prepare_task(
        self,
        _context: RunContext,
        kind: str,
        title: str,
        parameters: dict[str, Any],
    ) -> str:
        """Prepare (but do not execute) an office task. Returns the frozen scope
        and an approvalDigest. You MUST read the scope back and get a verbal yes
        before calling approve_task.

        For a SELL order, prefer the dedicated prepare_sell_order tool instead.

        Args:
            kind: REMINDER, ACCOUNTANT_PACK, OWNER_CHECKLIST or SELL_SHARES.
            title: A short human title for the task.
            parameters: Task parameters. For a REMINDER use
                {"dueAt": ISO-8601 with +02:00 offset in the future, "notes": str};
                for ACCOUNTANT_PACK {"taxYear": int}; for OWNER_CHECKLIST
                {"proposalId": int}; for SELL_SHARES {"propertyId": int,
                "quantity": int, "limitPricePerShare": float (optional)}.
        """
        kind = kind.strip().upper()
        return _summarise(
            await self._bridge.execute(
                {"action": "prepareTask", "kind": kind, "title": title, "parameters": parameters}
            )
        )

    @function_tool
    async def approve_task(
        self,
        _context: RunContext,
        task_id: str,
        approval_digest: str,
    ) -> str:
        """Approve a previously prepared task. ONLY call this after you have read
        the frozen scope back to the member and they verbally confirmed.

        Args:
            task_id: The id returned by prepare_task.
            approval_digest: The approvalDigest returned by prepare_task.
        """
        return _summarise(
            await self._bridge.execute(
                {"action": "approveTask", "taskId": task_id, "approvalDigest": approval_digest}
            )
        )

    @function_tool
    async def cancel_task(self, _context: RunContext, task_id: str) -> str:
        """Cancel a prepared or scheduled task.

        Args:
            task_id: The id of the task to cancel.
        """
        return _summarise(await self._bridge.execute({"action": "cancelTask", "taskId": task_id}))

    # --- Full capability registry (reads + guard-railed writes) ------------

    @function_tool
    async def list_capabilities(self, _context: RunContext) -> str:
        """List every action you can run for the member — each with a name, whether
        it is a read or a write, and a description. Use this to discover what is
        possible; most app functionality is available here."""
        return _summarise(await self._bridge.execute({"action": "listActions"}))

    @function_tool
    async def get_data(
        self,
        _context: RunContext,
        name: str,
        args: dict[str, Any] | None = None,
    ) -> str:
        """Run any READ action from the capability registry and return live data.

        Args:
            name: The action name from list_capabilities (e.g. "myWallet",
                "myContributions", "myOrders", "investorPortfolio",
                "marketplaceOverview", "proposals", "lookupInvestor").
            args: Optional arguments for the action, e.g.
                {"status": "OPEN"} for proposals, or
                {"investorCode": "ABC123"} for lookupInvestor. Omit if none.
        """
        payload: dict[str, Any] = {"action": "runRead", "name": name.strip()}
        if args:
            payload["args"] = args
        return _summarise(await self._bridge.execute(payload))

    @function_tool
    async def prepare_action(
        self,
        _context: RunContext,
        name: str,
        args: dict[str, Any] | None = None,
    ) -> str:
        """Prepare (but do NOT execute) any WRITE action. Returns a plain-English
        summary, a taskId and an approvalDigest. You MUST read the summary back to
        the member and get a clear verbal yes before calling confirm_action. For a
        share SELL order prefer the dedicated prepare_sell_order tool.

        Args:
            name: The write action name from list_capabilities (e.g. "castVote",
                "submitInvestmentProposal", "initiateInvestmentPayment",
                "requestRefund", "placeShareOrder", "cancelShareOrder",
                "transferShares", "initiateWalletDeposit", "requestWithdrawal",
                "expressResaleInterest", "requestReferralIntro",
                "submitHomeLoanApplication", "acceptHomeLoanOffer", "updateProfile",
                "updateInvestorPreferences", "setDistressedAlerts",
                "setAiDigestOptOut", "submitAppropriateness",
                "submitPrequalification", "markNotificationsRead").
            args: The action's arguments as a flat object. See the summary text if
                you are unsure which fields are required.
        """
        payload: dict[str, Any] = {"action": "prepareAction", "name": name.strip()}
        if args:
            payload["args"] = args
        return _summarise(await self._bridge.execute(payload))

    @function_tool
    async def confirm_action(
        self,
        _context: RunContext,
        task_id: str,
        approval_digest: str,
    ) -> str:
        """Execute a previously prepared WRITE action. ONLY call this after you have
        read the prepared summary back to the member and they verbally confirmed.

        Args:
            task_id: The taskId returned by prepare_action.
            approval_digest: The approvalDigest returned by prepare_action.
        """
        return _summarise(
            await self._bridge.execute(
                {"action": "confirmAction", "taskId": task_id, "approvalDigest": approval_digest}
            )
        )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    # Private job metadata carries the member's JWT and identity.
    metadata_raw = ctx.job.metadata or "{}"
    try:
        metadata = json.loads(metadata_raw)
    except json.JSONDecodeError:
        metadata = {}

    auth_token = metadata.get("authToken")
    member_name = metadata.get("name")
    if not auth_token:
        logger.error("No authToken in job metadata; refusing to start office session.")
        return

    bridge = OfficeBridge(auth_token)
    # Require a sustained stretch of member speech before interrupting the agent.
    # Without this, echo of the agent's own voice or a brief noise trips the VAD
    # and cuts the answer off mid-sentence (realtime models drop the rest of the
    # turn when interrupted), so it "stops talking and never continues".
    # resume_false_interruption makes the agent pick its unfinished turn back up
    # if it was cut by a false interruption instead of going silent forever.
    llm, provider_label, model_label = _build_realtime_llm()
    session = AgentSession(
        llm=llm,
        vad=ctx.proc.userdata["vad"],
        min_interruption_duration=MIN_INTERRUPTION_DURATION,
        resume_false_interruption=RESUME_FALSE_INTERRUPTION,
        false_interruption_timeout=FALSE_INTERRUPTION_TIMEOUT,
    )

    # Per-session telemetry (admin-only ops view). Duration is measured at
    # shutdown; errors are accumulated from the realtime session + bridge.
    session_started = datetime.now(timezone.utc)
    session_errors = {"count": 0}
    # Turn counters feed a lightweight call-quality score in the admin ops view.
    turns = {"user": 0, "assistant": 0}

    def _count_session_error(ev: Any) -> None:
        session_errors["count"] += 1
        logger.warning("realtime session error: %s", getattr(ev, "error", ev))

    try:  # Defensive: never let an unknown event name abort the call.
        session.on("error", _count_session_error)
    except Exception as exc:  # pragma: no cover - event may not exist in this build
        logger.info("session error hook unavailable: %s", exc)


    # Proactively pull the member's briefing + saved memory so the agent opens
    # with something useful and remembers them across sessions. Best-effort: a
    # slow or failed bridge call must never block the call from starting.
    member_context = ""
    greeting_hint = ""
    # Give the model the real wall-clock in South African time so it can compute
    # valid, future, timezone-aware dueAt values for reminders. Without this it
    # guesses the date and the reminder is rejected as "not in the future".
    sast = timezone(timedelta(hours=2))
    now_sast = datetime.now(sast)
    clock_block = (
        f"Current date and time is {now_sast.strftime('%A, %d %B %Y, %H:%M')} "
        f"South Africa Standard Time ({now_sast.isoformat(timespec='seconds')}, UTC+02:00). "
        "When you schedule a REMINDER you MUST pass dueAt as a full ISO-8601 timestamp "
        "WITH the +02:00 offset (e.g. "
        f"{(now_sast + timedelta(days=1)).replace(microsecond=0).isoformat()}) and it must be in the future."
    )
    try:
        briefing = await bridge.execute({"action": "briefing"})
        memory = await bridge.execute({"action": "getMemory"})
        conversations = await bridge.execute({"action": "listConversations"})
        parts: list[str] = [clock_block]
        if isinstance(briefing, dict) and briefing.get("ok"):
            parts.append("Opening briefing for this member (use the exact figures, do not invent): " + json.dumps(briefing.get("result"), default=str)[:1500])
            result = briefing.get("result")
            if isinstance(result, dict):
                highlights = result.get("highlights")
                if isinstance(highlights, list) and highlights:
                    greeting_hint = " ".join(str(h) for h in highlights[:2])
        if isinstance(memory, dict) and memory.get("ok"):
            notes = (memory.get("result") or {}).get("notes") if isinstance(memory.get("result"), dict) else None
            if isinstance(notes, list) and notes:
                parts.append("Saved notes about this member from previous sessions: " + json.dumps(notes, default=str)[:1200])
        if isinstance(conversations, dict) and conversations.get("ok"):
            threads = conversations.get("result")
            if isinstance(threads, list) and threads:
                recent = [
                    {"id": t.get("id"), "title": t.get("title"), "updatedAt": t.get("updatedAt")}
                    for t in threads[:5] if isinstance(t, dict)
                ]
                parts.append(
                    "Recent conversation threads with this member (use recall_conversation(id) to "
                    "continue one; pick up where you left off instead of starting cold): "
                    + json.dumps(recent, default=str)[:900]
                )
        member_context = "\n\n".join(parts)
    except Exception as exc:  # pragma: no cover - briefing is best-effort
        logger.warning("briefing/memory prefetch failed: %s", exc)
        member_context = clock_block

    room_input_options = RoomInputOptions()
    if noise_cancellation is not None:
        try:
            room_input_options = RoomInputOptions(noise_cancellation=noise_cancellation.BVC())
        except Exception as exc:  # pragma: no cover - cloud feature may be unavailable
            logger.info("noise cancellation unavailable: %s", exc)

    try:
        agent = OfficeAgent(bridge, member_name, member_context or None)
        agent.set_room(ctx.room)

        # Live cited transcript: stream each side's text to the member's app over
        # the room data channel. User text comes from transcription events; the
        # agent's own text from finalized conversation items. Every handler is
        # defensively wrapped so an unknown event name or shape never aborts the
        # call, and publishing is scheduled as a background task (the handlers are
        # synchronous callbacks).
        def _emit(role: str, text: str, final: bool) -> None:
            try:
                asyncio.create_task(agent.publish_transcript(role, text, final))
            except Exception as exc:  # pragma: no cover - best-effort
                logger.debug("transcript emit failed: %s", exc)

        def _on_user_transcript(ev: Any) -> None:
            try:
                text = getattr(ev, "transcript", None) or getattr(ev, "text", None) or ""
                is_final = bool(getattr(ev, "is_final", True))
                if not str(text).strip():
                    return
                if is_final:
                    turns["user"] += 1
                _emit("user", str(text), is_final)
            except Exception as exc:  # pragma: no cover - best-effort
                logger.debug("user transcript handler failed: %s", exc)

        def _on_item_added(ev: Any) -> None:
            try:
                item = getattr(ev, "item", ev)
                role = getattr(item, "role", None)
                if role != "assistant":
                    return
                text = getattr(item, "text_content", None)
                if not text:
                    content = getattr(item, "content", None)
                    if isinstance(content, (list, tuple)):
                        text = " ".join(str(c) for c in content if isinstance(c, str))
                    elif isinstance(content, str):
                        text = content
                if not str(text or "").strip():
                    return
                turns["assistant"] += 1
                _emit("assistant", str(text), True)
            except Exception as exc:  # pragma: no cover - best-effort
                logger.debug("item-added transcript handler failed: %s", exc)

        for _event_name, _handler in (
            ("user_input_transcribed", _on_user_transcript),
            ("conversation_item_added", _on_item_added),
        ):
            try:
                session.on(_event_name, _handler)
            except Exception as exc:  # pragma: no cover - event may not exist
                logger.info("transcript hook '%s' unavailable: %s", _event_name, exc)

        await session.start(
            room=ctx.room,
            agent=agent,
            room_input_options=room_input_options,
        )
        greeting = (
            "Greet the member by name and, if there is anything useful, proactively "
            "mention it, then ask how you can help with their property office today."
        )
        if greeting_hint:
            greeting += f" The most useful items right now are: {greeting_hint}"
        await session.generate_reply(instructions=greeting)
    finally:
        # On teardown, post a compact per-session usage/ops metric for the
        # admin-only cost & ops view, then close the HTTP client. Best-effort:
        # a failed metric post must never surface to the member.
        async def _on_shutdown() -> None:
            try:
                duration = (datetime.now(timezone.utc) - session_started).total_seconds()
                await bridge.execute({
                    "action": "logVoiceSession",
                    "provider": provider_label,
                    "model": model_label,
                    "durationSeconds": max(0, int(round(duration))),
                    "toolCalls": int(bridge.calls),
                    "toolErrors": int(bridge.errors),
                    "sessionErrors": int(session_errors["count"]),
                    "userTurns": int(turns["user"]),
                    "agentTurns": int(turns["assistant"]),
                })
            except Exception as exc:  # pragma: no cover - metric is best-effort
                logger.warning("voice session metric post failed: %s", exc)
            finally:
                await bridge.aclose()

        ctx.add_shutdown_callback(_on_shutdown)


def prewarm(proc: agents.JobProcess) -> None:
    # Load the Silero VAD once per worker process so it never blocks a call's
    # event loop at session start.
    proc.userdata["vad"] = silero.VAD.load()


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name=AGENT_NAME,
        )
    )
