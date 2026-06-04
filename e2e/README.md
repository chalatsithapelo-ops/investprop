# Playwright E2E

Smoke tests for Investprop.

## Setup

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

## Run locally

```bash
pnpm test:e2e           # headless
pnpm test:e2e:ui        # interactive
```

By default the config will start `pnpm dev` on http://localhost:8010 and wait for it.
Set `E2E_BASE_URL` to point at a different (e.g. staging) instance:

```bash
$env:E2E_BASE_URL = "https://investprop.io"
pnpm test:e2e
```
