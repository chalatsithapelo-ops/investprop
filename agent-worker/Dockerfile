# Investprop realtime office voice agent worker.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# System deps occasionally needed by audio/VAD wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY voice_agent_worker.py ./

# Pre-download the Silero VAD + any model files so the first session is fast.
RUN python voice_agent_worker.py download-files || true

# `start` connects to LiveKit Cloud and waits for explicit dispatch jobs.
CMD ["python", "voice_agent_worker.py", "start"]
