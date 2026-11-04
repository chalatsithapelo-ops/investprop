# Investprop AI Property Office — Realtime Voice Agent

A LiveKit voice agent that talks with a member and executes the AI Property
Office capabilities by voice. It is the realtime sibling of the existing
recorded voice turn (`officeVoiceTurn`): lower latency, fully conversational,
and able to drive overview, specialist chat, property scenarios, task
prepare/approve, accounting exceptions and tax sources.

## Architecture

```
Browser / Flutter
   │  (1) officeVoiceAgentSession  → short-lived LiveKit token + agent dispatch
   ▼
Investprop server (TanStack Start)
   │  mints token (livekit-server-sdk AccessToken)
   │  dispatches worker with PRIVATE metadata { authToken, name, role }
   ▼
LiveKit Cloud room  ◄── member audio ──►  Agent worker (this folder)
                                             │  OpenAI Realtime (STT+LLM+TTS)
                                             │  function tools
                                             ▼
                              POST /api/office-agent/execute
                              headers: Authorization: Bearer <member JWT>
                                       x-agent-secret: AGENT_SHARED_SECRET
                                             │
                                             ▼
                              Same office domain functions the tRPC
                              procedures use (scoped, feature-gated,
                              frozen task-digest approval preserved).
```

The member's JWT only ever reaches the agent job (via private dispatch
metadata), never other room participants. The worker cannot widen a user's
scope: the bridge re-validates the user and re-checks the subscription gate on
every call.

## Guard rails

* The agent may READ data and PREPARE tasks freely.
* Before APPROVING a task it must read the frozen scope back and get a verbal
  "yes". Approval still uses the exact `approvalDigest`, so the server-side
  integrity check is unchanged.
* Tax answers come only from reviewed tax sources; no numbers are invented.

## Local development

1. Create a LiveKit Cloud project and copy the `wss://…` URL, API key and secret.
2. `cp .env.example .env` and fill in `LIVEKIT_*`, `OPENAI_API_KEY`,
   `AGENT_SHARED_SECRET` (any strong random string — must match the server
   `.env`), and `BACKEND_URL` (your running server, e.g. `http://localhost:8010`).
3. Install deps and run:

   ```bash
   cd agent-worker
   python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   python voice_agent_worker.py download-files
   python voice_agent_worker.py dev
   ```

4. On the web app or Flutter app, press the floating voice button while signed
   in as an office-eligible member.

## Production (Hetzner docker-compose)

The worker runs as the `agent-worker` service in `docker-compose.prod.yaml`.
Set these in the server `/opt/investprop/.env`:

```
VOICE_AGENT_ENABLED=true
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...        # keep secret
AGENT_SHARED_SECRET=...       # strong random; keep secret
VOICE_AGENT_NAME=investprop-office-agent
OPENAI_API_KEY=...            # already set for recorded voice
```

Then:

```bash
docker compose -f docker-compose.prod.yaml --env-file .env up -d --build agent-worker
```
