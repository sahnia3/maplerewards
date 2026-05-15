# Key Rotation Runbook

Defense-in-depth: rotate every API key before opening to paid traffic, even though
no secret was ever committed to git (`git log --all -- .env` is empty — the
`.env` file lived only locally). This catches accidental leaks via screenshots,
logs, or future foot-guns.

Rotate quarterly. Rotate immediately on any of: laptop loss, suspected leak,
employee departure (when you grow past solo), or a security advisory.

## Order of operations

Rotate one provider at a time. Verify staging works between each rotation
before doing prod. Never rotate everything at once — if one rotation fails
you want to know which.

## 1. Anthropic

1. https://console.anthropic.com/settings/keys → "Create key" → name it
   `maplerewards-prod-<YYYY-MM-DD>` or `maplerewards-dev-<YYYY-MM-DD>`.
2. Copy the new key (only shown once — `sk-ant-api03-...`).
3. Update `.env` locally:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-<new>
   ```
4. Update the deployment secret store (Fly secrets / Railway / Vercel env).
5. Re-deploy / restart workers + API.
6. Smoke test: `curl -s -X POST <host>/api/v1/chat -d '{"message":"hello"}'`
   — confirm 200 with a real reply.
7. Revoke the old key from the Anthropic dashboard (button next to the old row).

## 2. Apify

1. https://console.apify.com/account/integrations → "Personal API tokens"
   → "Add new token", name `maplerewards-<YYYY-MM-DD>`.
2. Copy the new token (`apify_api_...`).
3. Update `.env`:
   ```
   APIFY_TOKEN=apify_api_<new>
   ```
4. Update deployment secrets, re-deploy.
5. Smoke test: hit `/api/v1/award-search` with a known route — confirm Apify
   logs in the worker stdout.
6. Delete the old token from the Apify dashboard.

## 3. Tavily

1. https://app.tavily.com/account/api-keys → "Generate new key".
2. Copy the new key (`tvly-dev-...` or `tvly-prod-...`).
3. Update `.env`:
   ```
   TAVILY_API_KEY=tvly-<new>
   ```
4. Update deployment secrets, re-deploy.
5. Smoke test: trigger the worker's promo-sentinel tick (or wait 12h).
6. Revoke the old key.

## 4. SerpAPI

1. https://serpapi.com/manage-api-key → rotate.
2. Update `.env` (`SERPAPI_KEY`), redeploy.
3. Smoke test: `/api/v1/trip-planner/flights?origin=YYZ&dest=NRT&date=2026-08-01`.
4. Revoke old.

## 5. Stripe (live + webhook secret)

Stripe rotation is more involved because changing `STRIPE_WEBHOOK_SECRET` requires
re-installing the webhook endpoint.

1. https://dashboard.stripe.com/apikeys → "Roll" on the live secret key.
2. Update `.env` (`STRIPE_SECRET_KEY`), redeploy.
3. https://dashboard.stripe.com/webhooks → click your webhook endpoint →
   "Roll secret".
4. Update `.env` (`STRIPE_WEBHOOK_SECRET`), redeploy.
5. Smoke test: trigger a test event from the Stripe dashboard
   ("Send test webhook" → `checkout.session.completed`) — confirm the API
   logs a successful event handling within 5s.
6. Old keys auto-expire after the roll grace period (24h).

## 6. JWT secret

1. Generate: `openssl rand -hex 32` (gives a 64-char string — way above the
   32-char floor that `cmd/api/main.go` will enforce after task 1.6).
2. Update `.env` (`JWT_SECRET`).
3. Update deployment secrets.
4. Re-deploy. **All existing user sessions will be invalidated** — users will
   need to log in again. Plan this for a low-traffic window.

## 7. VAPID push keys

Only rotate when you suspect compromise. Rotating invalidates every existing
push subscription — users must re-subscribe.

1. `go run ./cmd/keygen -vapid` (if implemented) OR
   https://vapidkeys.com/ → generate fresh pair.
2. Update `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
3. Migration: `DELETE FROM push_subscriptions;` (they're all dead with the
   old keys anyway).

## What to do if a key leaks

1. **Revoke first, ask questions later.** Go to the provider dashboard,
   revoke the leaked key BEFORE generating a replacement. A short outage is
   better than an open bill.
2. Roll new key (steps above).
3. Audit the provider's usage logs for the leaked key — anything unusual?
4. Audit the maplerewards repo: `git log -p | grep -E "sk-|api_key=|secret="`
   to confirm nothing else is exposed.
5. If Anthropic — set the org-level monthly spend cap as a backstop.

## Production deployment secret stores

Pick one (no decision made yet — flagged in plan open-dependencies):

- **Fly.io**: `fly secrets set ANTHROPIC_API_KEY=...` per app.
- **Railway**: dashboard env vars per service.
- **Vercel (frontend) + Render (backend)**: dashboard env vars per
  service. Vercel auto-redeploys on env-change.

Whichever is chosen, **never commit `.env` to git**. `.gitignore` already
excludes it (verified 2026-05-15).
