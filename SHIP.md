# SHIP — Production deployment checklist

Single-page runbook for taking MapleRewards from green CI to live traffic. Keep this short. If something feels longer than 5 minutes, factor it out into `docs/`.

## Pre-flight — verify locally first

```bash
# from repo root
go build ./...
go vet ./...
go test -count=1 -race ./...
cd frontend && npx tsc --noEmit && npm run build && cd -
```

All four must pass. CI runs the same gates plus `golangci-lint`, `govulncheck`, `npm audit --omit=dev --audit-level=high`, and a Docker build verification that confirms the image runs as `USER 10001:10001`.

## 1. Provision infrastructure

| Component | What | Notes |
|---|---|---|
| Postgres 16 | Primary store | Supabase / RDS / Cloud SQL. `sslmode=require` in the URL. |
| Redis 7 | Cache + sessions + rate-limit + quota counters | Upstash / ElastiCache. Set `REDIS_PASSWORD` if managed. |
| Image registry | Docker image host | GHCR / ECR / Fly's registry. |
| Cron platform | One scheduled task — see step 6 | Fly Machines schedule / GitHub Actions cron / Upstash QStash. |

## 2. Configure secrets

Required (server refuses to start without them in production):
- `APP_ENV=production`
- `JWT_SECRET` — `openssl rand -hex 32`
- `DATABASE_URL` — `postgres://...?sslmode=require`
- `REDIS_URL` **or** `REDIS_ADDR` + `REDIS_PASSWORD`. Managed Redis (Railway,
  Upstash, Render, Heroku) hands you a single `REDIS_URL`
  (`redis://default:pass@host:port`, or `rediss://` for TLS) — set that and
  the discrete vars are unnecessary. In production the server refuses to boot
  unless Redis auth is present (a password in either the URL or `REDIS_PASSWORD`).
- `FRONTEND_URL` — exact https URL of the Vercel deploy
- `CORS_ORIGIN` — exact match for the SPA host. Server refuses `*`, empty, or non-`https://` in production.
- `COOKIE_DOMAIN` — **set this when the SPA and API share a parent domain**
  (e.g. `.maplerewards.ca` with the app on `app.` and the API on `api.`).
  Without it, the app (Vercel) and API (Railway) are different registrable
  domains, so the auth/session/CSRF cookies are third-party `SameSite=None`
  cookies that **Safari/iOS and any "block third-party cookies" setting drop**
  — login silently fails for a large share of users. With `COOKIE_DOMAIN` the
  server emits `SameSite=Lax; Domain=<value>` first-party cookies. Put the app
  and API on one parent domain before charging customers.

Billing (Stripe):
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Current tiers (these are what live checkout actually uses):**
  `STRIPE_PRICE_ID_PRO_ANNUAL`, `STRIPE_PRICE_ID_PROPLUS_ANNUAL`, `STRIPE_PRICE_ID_LIFETIME`.
  If these are unset, the default "Pro" checkout fails with
  `stripe price ID not configured`. Set test price IDs in sandbox, live IDs at cutover.
- `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL` — **legacy only** (kept for
  backward compat with old subscriptions; not used by current checkout). Safe to leave unset.

Optional but expected:
- `ANTHROPIC_API_KEY` — Claude Sonnet 4.5 chat
- `SERPAPI_KEY` — Google Flights cash prices (free tier 250/mo, tracked via `internal/quota`)
- `APIFY_TOKEN` — live award scraping
- `SEATSAERO_API_KEY` — award availability backup
- `TAVILY_API_KEY` — web-search context for AI chat
- `ADMIN_EMAILS` — comma-separated list. Gates `/api/v1/admin/*`. Empty list = admin routes deny every request.
- `KB_DIR` — defaults to `./internal/knowledge`. Override when the binary runs outside the repo root (the Dockerfile copies the YAML in, so the default works inside the image).
- `RATE_LIMIT_PER_MINUTE`, `FREE_USER_RPM`, `PRO_USER_RPM` — overrides for load tests.

## 3. Apply database migrations

From the repo with `DATABASE_URL` set:

```bash
make migrate-up
psql "$DATABASE_URL" -c "select max(version) from schema_migrations"  # expect 34
```

Heads to know:
- `000033` — `point_valuation_history` (CPP freshness anchor)
- `000034` — `chat_conversations` + `chat_messages` (server-side AI history)

If any migration fails, `migrate-up` halts and reports the version. Fix the offending SQL, write a forward fix-migration, never edit a shipped migration.

## 4. Build and push the API image

```bash
docker build -t YOUR_REGISTRY/maplerewards-api:$(git rev-parse --short HEAD) .
docker push YOUR_REGISTRY/maplerewards-api:$(git rev-parse --short HEAD)
```

The Dockerfile:
- Multi-stage (alpine builder → alpine runtime)
- Copies the knowledge YAML into the image at `/app/internal/knowledge`
- Runs as non-root `USER 10001:10001`
- HEALTHCHECK polls `/ready` every 30s

## 5. Deploy

Boot the API container with the env vars from step 2.

Smoke-test:

```bash
curl https://api.maplerewards.example/health   # → {"status":"ok"}
curl https://api.maplerewards.example/ready    # → {"status":"ready"}
```

`/ready` 503 means a dependency is down — check the `error` field in the body for `postgres` or `redis`.

Configure the Stripe webhook to `POST https://api.maplerewards.example/api/v1/billing/webhook` subscribed to:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded` — **required** so a refunded one-time (Lifetime) buyer
  loses Pro; Lifetime has no subscription, so `subscription.deleted` never
  fires for it. The handler already exists; you just need to subscribe the event.

Deploy the frontend to Vercel:
- Root: `frontend/`
- Framework: Next.js (auto-detect)
- `NEXT_PUBLIC_API_URL=https://api.maplerewards.example/api/v1`

## 6. Schedule the valuation refresher

The CPP table goes stale fast. Run `cmd/refresh-valuations` weekly to re-anchor `recorded_at` and append a history row per active valuation.

GitHub Actions example (`.github/workflows/refresh-valuations.yml`):

```yaml
on:
  schedule: [{ cron: "0 9 * * 1" }]      # Mondays 09:00 UTC
  workflow_dispatch:
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22' }
      - run: go run ./cmd/refresh-valuations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          REDIS_ADDR:   ${{ secrets.REDIS_ADDR }}
```

Fly Machines: `fly machine run --schedule "weekly" --command refresh-valuations`.

### 6b. Run the background worker (award-watch + issuer-watch sweeps)

`cmd/worker` is a long-running daemon (NOT a one-shot cron). It loops over `award_watch` rows every `AWARD_WATCH_TICK_HOURS` (default 4) and re-probes Apify, then stamps alerts when point thresholds are met. Without it, Pro users' saved trips never get refreshed and the "Save trip" feature is decorative.

Deploy as a separate process (not a scheduled job). Two options:

**Fly Machines** — second app, same image:
```bash
fly apps create maplerewards-worker
fly secrets set --app maplerewards-worker \
  DATABASE_URL=... REDIS_ADDR=... APIFY_TOKEN=... \
  SEATSAERO_API_KEY=... SERPAPI_KEY=...
fly deploy --app maplerewards-worker \
  --image YOUR_REGISTRY/maplerewards-api:TAG \
  --override-cmd "./worker"
```
(Requires building both binaries in the Dockerfile — append `RUN CGO_ENABLED=0 go build -o bin/worker ./cmd/worker` and copy it into the runtime stage.)

**Single-container with supervisord / systemd** — run `./worker &` after `./api &` inside a managed runtime.

Tune via env:
- `AWARD_WATCH_TICK_HOURS=4` — sweep interval
- `AWARD_WATCH_BATCH_SIZE=50` — watches per sweep (keeps Apify costs bounded)
- `AWARD_WATCH_GAP_THRESHOLD=5000` — only alert when last_min_points drops by ≥N points

## 7. End-to-end smoke

Stand in front of `https://app.maplerewards.example` and do:

1. Sign up → confirm email arrives → click verify link.
2. Add 3 cards via the wallet.
3. Run the optimizer with a $1200 spend mix → confirm the recommended card matches expectations.
4. Open `/trip-planner`, search `YYZ → LHR` business, today + 90 days → confirm live results show "Priced X min ago" badges, estimated rows show the amber "estimate" badge, taxes render correctly.
5. Open the AI chat → ask "What's the best way to fly YYZ to HND in business?" → confirm tool-pill progression, response references Aeroplan + ANA from the knowledge base.
6. Start a Stripe checkout → use a test card → confirm:
   - Webhook delivery shows 200 in Stripe dashboard.
   - API log emits `user upgraded to pro` line.
   - `/api/v1/auth/me` flips `is_pro: true`.
   - `/pro-tools` now renders the 14 tiles + personalized strip.

## 8. Post-deploy verification

```bash
# Admin quota check
curl -H "Authorization: Bearer $ADMIN_JWT" \
     -H "X-CSRF-Token: $CSRF" --cookie "mr_csrf=$CSRF" \
     https://api.maplerewards.example/api/v1/admin/quota
# → [{"provider":"serpapi","remaining":250},{"provider":"apify","remaining":-1},{"provider":"tavily","remaining":1000}]

# Optimizer hot-path index check
psql "$DATABASE_URL" -c "select indexname from pg_indexes where tablename='card_multipliers'"
# → expect idx_card_multipliers_lookup
```

## 9. Rollback

The API container is stateless; all state lives in Postgres + Redis.

1. Re-deploy the previous image tag.
2. If a migration broke things and a `_down.sql` exists, **prefer rolling forward** (a new migration that restores) over running the down migration in production.
3. The Stripe webhook handler is idempotent — retries are safe.

## 10. Incident response

- **API down**: hit `/health`. If alive but `/ready` 503s, read the `error` field — `postgres` or `redis`. If `/health` is dead, check container logs + platform restart count.
- **Webhook silent / Pro flag not flipping**: Stripe dashboard → confirm webhook delivery success. Look for `user upgraded to pro` in the API log. If missing, the webhook secret is mismatched.
- **AI chat returning rate-limit errors**: check Anthropic dashboard for tier rate-limit. Bump `PRO_USER_RPM`. Last resort, raise the global per-IP `RATE_LIMIT_PER_MINUTE`.
- **Trip planner showing only estimate badges, no live**: check `/admin/quota` — SerpAPI free tier (250) may be exhausted for the month. Either bump to paid or wait for the 1st.
- **Optimizer slow**: confirm migration 20 ran (`select indexname from pg_indexes where tablename='card_multipliers'`).
