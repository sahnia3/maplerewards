# MapleRewards — Deployment Runbook

This document covers what's required to ship MapleRewards to production. Keep it short. If something here gets long, factor it out — the runbook should fit in one screen of a panicked engineer's monitor at 2 AM.

## 1. Topology

| Component | What it is | Where it runs |
|---|---|---|
| Go API | `cmd/api`, port 8080 | Container (Dockerfile in repo root) |
| Frontend | Next.js 16 in `frontend/` | Vercel or any Node 20+ host |
| PostgreSQL 16 | Primary store | Managed (Supabase/RDS/Cloud SQL) |
| Redis 7 | Cache + sessions | Managed (Upstash/ElastiCache) |
| Stripe | Billing + webhook source | external |
| Anthropic | Claude Sonnet 4.5 (AI chat) | external |
| SerpAPI / Apify / Seats.aero / Tavily | Travel data | external |

## 2. Required environment variables

See `.env.example` for the full list. The server **will refuse to start** if `APP_ENV=production` and `JWT_SECRET` is empty or equals the dev fallback.

Critical to set in production:
- `APP_ENV=production`
- `JWT_SECRET` — 256 bits of randomness. `openssl rand -hex 32`.
- `DATABASE_URL` — Postgres connection string with `sslmode=require`.
- `REDIS_ADDR`, `REDIS_PASSWORD`
- `FRONTEND_URL` — used in Stripe success/cancel redirect URLs.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`
- `ANTHROPIC_API_KEY`
- `RATE_LIMIT_PER_MINUTE` — defaults to 60 in production. Bump for paid tiers or load tests.

Optional but expected for full feature surface:
- `SERPAPI_KEY` — flight cash pricing
- `APIFY_TOKEN` — live award scraping
- `SEATSAERO_API_KEY` — award availability backup
- `TAVILY_API_KEY` — web search context for AI
- `ADMIN_EMAILS` — comma-separated list of admin email addresses. Required for
  the `/api/v1/admin/*` endpoints (valuation push + quota dashboard). Empty
  disables admin routes entirely.
- `KB_DIR` — absolute path to the knowledge YAML directory. Defaults to
  `./internal/knowledge`. Override when the binary runs outside the repo root.

## 3. First-deploy checklist

1. **Provision** Postgres 16 + Redis 7. Note connection strings.
2. **Set secrets** in your platform of choice (Fly, Render, Railway, Vercel envs, etc.).
3. **Run migrations** before booting the API. From the repo, with `DATABASE_URL` set:
   ```bash
   make migrate-up
   ```
   All migrations should apply cleanly. Current head is 34 (verify the latest
   number in `migrations/`). Confirm with:
   ```bash
   psql "$DATABASE_URL" -c "select max(version) from schema_migrations"
   ```
   Heads to know:
   - `000032` adds `email_verifications` table.
   - `000033` adds `point_valuation_history` for CPP refresh pipeline.
   - `000034` adds `chat_conversations` + `chat_messages` for AI history.
4. **Boot the API.** It will:
   - Fail-fast if `APP_ENV=production` and `JWT_SECRET` is empty/dev.
   - Bind to `:$PORT` (default 8080).
   - Apply 60 req/min rate limit by default.
5. **Smoke-test:**
   ```bash
   curl https://api.maplerewards.example/health   # liveness  → {"status":"ok"}
   curl https://api.maplerewards.example/ready    # readiness → {"status":"ready"} (requires DB + Redis)
   ```
6. **Configure Stripe webhook** to point at `POST https://api.maplerewards.example/api/v1/billing/webhook`. Subscribed events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
7. **Deploy frontend.** Vercel: import the GitHub repo, set root to `frontend/`, framework Next.js. Set `NEXT_PUBLIC_API_URL=https://api.maplerewards.example/api/v1`.
8. **Smoke-test the user flow:** sign up → add a card → run optimizer → start a Stripe checkout → confirm Pro flag flips after the webhook fires.

## 4. Health & readiness

- `GET /health` — process is up. Use for k8s `livenessProbe` or platform liveness checks.
- `GET /ready` — process plus its dependencies (Postgres, Redis) reachable within 2 s. Use for k8s `readinessProbe`, load-balancer health checks, and the in-tree Dockerfile `HEALTHCHECK`.

A 503 from `/ready` keeps the container in service but pulled out of the LB pool until it recovers. A 503 from `/health` should kill the container.

## 5. Migrations

- Always commit a matched `_up.sql` and `_down.sql` pair.
- Never edit a migration that has already shipped — write a new one.
- Migration history at a glance:
  - 1–19: original product (schema, seeds, auth, Stripe customer, expanded cards).
  - 20: optimizer-hot-path indexes.
  - 21–32: Stripe events, soft-delete users, welcome-offer expiry, award-watch alerts, merchant acceptance, issuer page diff, loyalty accounts, card offers, Aeroplan 2026 SQC, email verifications.
  - 33: point_valuation_history (anchors CPP freshness; `cmd/refresh-valuations` writes here).
  - 34: chat_conversations + chat_messages (server-side AI chat history).
  - New migrations should be `000035_*` and onward.
- Run with `make migrate-up` (forward) or `make migrate-down` (single rollback). Do not run `migrate-down` against production unless you understand which row-level data the down-migration will drop.

## 6. Rollback

The API container is stateless; all state lives in Postgres. To roll back:

1. Re-deploy the previous container tag.
2. If a migration broke things, the matching `_down.sql` exists — but for any migration that drops a column or table, **prefer rolling forward** (a new migration that restores) over running the down migration in production.

Stripe webhook idempotency: webhook handlers tolerate replays — re-ingesting the same event will not double-bill.

## 7. Production hardening already in place

- `JWT_SECRET` fail-fast.
- Rate limit 60 req/min (override via `RATE_LIMIT_PER_MINUTE`).
- 2 s timeout on `/ready` dependency pings.
- `HEALTHCHECK` in Dockerfile (30 s interval, 3 s timeout, 15 s start period).
- Apify polling timeout 150 s (was 90 s — actor occasionally exceeded).
- All external HTTP clients have configured timeouts (Anthropic 60 s, Apify 120 s HTTP, Stripe via internal client, etc.).
- CI: GitHub Actions runs `go vet`, `go test -race`, `tsc --noEmit`, `next lint` on every push and PR to `main`.

## 8. What's NOT in place yet

These are deliberate omissions, listed here so they're on someone's radar:

- **Metrics endpoint.** No Prometheus `/metrics`. Add when you need it; the structured slog-JSON output is enough for most platform-level dashboards.
- **Distributed tracing.** Not wired. OpenTelemetry SDK can drop in around Chi later.
- **Background workers.** All work is synchronous request-handling. Award-watch and devaluation feeds will eventually need a scheduler — defer until usage demands it.
- **Bank-sync.** Manual card-add only. Plaid Canada is patchy; revisit post-launch when product-market fit is proven.
- **Frontend tests.** The frontend ships without unit tests. The backend covers ~30% of services (optimizer, missed-rewards, SQC, billing webhook); the rest is integration-via-staging.

## 9. Incident response

- **API down.** Check `/health`. If the process is alive but `/ready` returns 503, look at the `error` field in the response — `postgres` or `redis`. If the process is dead, check container logs and platform restart count.
- **Webhook silent (Pro flag not flipping).** Verify the Stripe dashboard shows successful webhook deliveries to `/api/v1/billing/webhook`. Check the API log for `user upgraded to pro` lines. If missing, the webhook secret is likely mismatched.
- **AI chat returning rate-limit errors.** Either `RATE_LIMIT_PER_MINUTE` is too low for the load, or you're hitting Anthropic's tier rate limit. Bump per-IP in env first, then check Anthropic.
- **Optimizer slow.** Confirm migration 20 ran (`select indexname from pg_indexes where tablename='card_multipliers'` should show `idx_card_multipliers_lookup`). If yes and still slow, profile via `EXPLAIN ANALYZE` against the optimizer's hot query.
