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

import json
import logging
import os
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

logger = logging.getLogger("investprop-office-agent")
logging.basicConfig(level=logging.INFO)

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8010").rstrip("/")
AGENT_SHARED_SECRET = os.environ.get("AGENT_SHARED_SECRET", "")
AGENT_NAME = os.environ.get("VOICE_AGENT_NAME", "investprop-office-agent")
REALTIME_VOICE = os.environ.get("VOICE_AGENT_VOICE", "alloy")

# How the agent presents itself and the guard rails it must honour. Mirrors the
# office policy: research + preparation, with explicit verbal approval before any
# task is executed, and no fabricated numbers.
INSTRUCTIONS = """
You are the Investprop AI Property Office voice assistant. You speak with a
verified member of Investprop, a South African property co-investment platform.
You are warm, concise and precise. Keep spoken replies short — a sentence or
two — because this is a voice conversation.

You have four specialist lenses you can consult through the ask_specialist tool:
  - ACCOUNTANT: payouts, distributions, ledger and accounting questions.
  - TAX: South African tax questions, grounded only in reviewed tax sources.
  - ASSET: property performance, rentals, holdings and scenarios.
  - ADMIN: general platform and account questions.

Capabilities you can perform for the member:
  - get_overview: a snapshot of their portfolio and office context.
  - ask_specialist: ask one of the four specialists a question in words.
  - run_property_scenario: a one-year rental stress scenario for a property.
  - list_tasks / list_tax_sources / accounting_exceptions: read their records.
  - prepare_task then approve_task: schedule a reminder, build an accountant
    pack, or build an owner document checklist.

Hard rules — never break these:
  1. Never invent figures. If a number is unknown, say it is not available.
  2. You may READ data and PREPARE tasks freely. Before you APPROVE a task you
     MUST read back the task's exact frozen scope and the specific details, then
     ask the member to confirm out loud. Only call approve_task after they
     clearly say yes. If they hesitate or say no, do not approve.
  3. Tax answers come only from reviewed tax sources returned by the tools. Never
     give tax advice from your own knowledge — recommend a professional.
  4. You are not a financial, legal or tax adviser. Encourage professional review
     for anything consequential.
  5. Read evidence tags like [evidence:...] silently; never speak them aloud.
Greet the member briefly by name when the session starts and ask how you can help.
""".strip()


class OfficeBridge:
    """Thin authenticated relay to the backend office action bridge."""

    def __init__(self, auth_token: str) -> None:
        self._auth_token = auth_token
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(45.0))

    async def execute(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not AGENT_SHARED_SECRET:
            return {"ok": False, "reason": "Agent bridge secret is not configured."}
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
            return {"ok": False, "reason": "The office service is unreachable right now."}

        try:
            data = response.json()
        except ValueError:
            return {"ok": False, "reason": f"Unexpected response ({response.status_code})."}

        if not isinstance(data, dict):
            return {"ok": False, "reason": "Unexpected response from the office service."}
        return data

    async def aclose(self) -> None:
        await self._client.aclose()


def _summarise(data: dict[str, Any]) -> str:
    """Return a compact JSON string for the model to reason over."""
    if not data.get("ok", False):
        return json.dumps({"ok": False, "reason": data.get("reason", "The action could not be completed.")})
    return json.dumps({"ok": True, "result": data.get("result")}, default=str)[:6000]


class OfficeAgent(Agent):
    def __init__(self, bridge: OfficeBridge, member_name: str | None) -> None:
        greeting_name = member_name or "there"
        super().__init__(instructions=f"{INSTRUCTIONS}\n\nThe member's name is {greeting_name}.")
        self._bridge = bridge

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
    ) -> str:
        """Ask one of the office specialists a question.

        Args:
            persona: One of ACCOUNTANT, TAX, ASSET or ADMIN.
            message: The member's question in natural language.
        """
        persona = persona.strip().upper()
        if persona not in {"ACCOUNTANT", "TAX", "ASSET", "ADMIN"}:
            return json.dumps({"ok": False, "reason": "Persona must be ACCOUNTANT, TAX, ASSET or ADMIN."})
        return _summarise(
            await self._bridge.execute({"action": "chat", "persona": persona, "message": message})
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

        Args:
            kind: REMINDER, ACCOUNTANT_PACK or OWNER_CHECKLIST.
            title: A short human title for the task.
            parameters: Task parameters, e.g. {"dueAt": ISO, "notes": str} for a
                REMINDER, {"taxYear": int} for ACCOUNTANT_PACK, or
                {"proposalId": int} for OWNER_CHECKLIST.
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
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(voice=REALTIME_VOICE),
        vad=silero.VAD.load(),
    )

    try:
        await session.start(
            room=ctx.room,
            agent=OfficeAgent(bridge, member_name),
            room_input_options=RoomInputOptions(),
        )
        await session.generate_reply(
            instructions="Greet the member briefly by name and ask how you can help with their property office today."
        )
    finally:
        # Session lifetime is tied to the room; close the HTTP client on teardown.
        ctx.add_shutdown_callback(bridge.aclose)


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=AGENT_NAME,
        )
    )
