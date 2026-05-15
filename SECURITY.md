# Security posture

What the application defends against, by layer. Update this when a real layer changes — not for every commit.

## Reporting

Email **security@maplerewards.example** (replace with the real address before launch). Please include reproduction steps and the impact you observed. We do not currently run a paid bug-bounty program; we will publicly credit reporters who request it.

## Threat model in one paragraph

MapleRewards is a Canadian credit-card rewards optimizer. The valuable data is each user's wallet (cards owned + balances + spend history). The actively defended categories: (1) IDOR on wallet endpoints, (2) AI-budget exhaustion (Anthropic, Apify, SerpAPI quota), (3) Stripe webhook spoofing, (4) cross-site forgery on auth/billing/data-import. Less actively defended (because the impact is bounded): credential stuffing on email/password login (rate-limited but no captcha yet), and bulk export by a real authenticated user (we offer it as a PIPEDA feature).

## Defenses in depth

### Authentication
- `JWT_SECRET` is required in production; the server refuses to boot otherwise (`cmd/api/main.go`).
- JWT HS256, 15-min access tokens, 30-day refresh tokens hashed with SHA-256 before storage (`internal/service/auth.go`).
- Refresh rotation with **reuse-detection** — presenting an already-revoked token triggers `RevokeAllUserTokens` on the affected user. Stolen tokens cause one bad request, not weeks of free access.
- Password hashing via `bcrypt.DefaultCost`. Minimum 8 characters at registration and password-change.
- Google OAuth verified through Google's tokeninfo endpoint (`verifyGoogleIDToken`). The unverified decoder is renamed `decodeGoogleIDTokenTestOnlyUnsafe` so a grep for "unsafe" finds any accidental production call.
- Session-id bearer tokens for anonymous wallets are 128-bit random hex.

### Authorization
- `RequireSessionOwner` middleware enforces ownership on URL-param wallet routes.
- `requireBodySessionOwner` helper enforces it on body-param routes (chat, optimizer, trip planner, stack recommender).
- `RequirePro` middleware gates Pro-tier endpoints; free users receive `402 Payment Required`.
- `RequireAdmin([]string)` middleware reads JWT email claims and checks against the `ADMIN_EMAILS` env list. Empty list = admin routes deny every request.

### Cross-origin
- `CORS_ORIGIN` must be set to an exact `https://` URL in production. The server's `init()` refuses to start if the value is empty, `*`, or non-`https://`. No reflection middleware echoes arbitrary origins.
- CSRF: double-submit cookie (`mr_csrf`, SameSite=Lax) plus `X-CSRF-Token` header check on every state-changing route grouped under `mw.CSRFProtect`. Token-rotation helper `RotateCSRFCookie` available for post-auth-state-change calls.

### Request integrity
- Body size limits via `mw.BodyLimit`: 1 MB on JSON routes, 5 MB on CSV import. Larger bodies fail with `http: request body too large` before reaching the JSON decoder.
- Per-IP rate limiter: token bucket, 60 req/min in production (300 in dev). Override via `RATE_LIMIT_PER_MINUTE`.
- Per-user rate limiter: 60 RPM free, 240 RPM Pro. Anonymous requests bypass this layer (the per-IP limit still applies).
- Anonymous chat quota: 5 messages per IP per day, stored in Redis. Closes the open-faucet on Anthropic spend.
- Authenticated free-tier chat quota: 5 messages per user per month, stored in Redis.

### Billing
- Stripe webhook signature verified via HMAC-SHA256 + 5-minute timestamp tolerance + constant-time compare (`internal/handler/billing.go`).
- Webhook body read raw before JSON parse (signature is over raw bytes).
- Event deduplication via the `stripe_events` table. `IsEventProcessed` short-circuits before any side-effect; `RecordStripeEvent` writes the dedup row only on success so transient failures retry cleanly.
- Stripe checkout form params built via `url.Values{}` (NOT string concatenation). User-controlled email is properly URL-encoded — no parameter smuggling.

### External provider quotas
- `internal/quota` tracks monthly SerpAPI (250 free) and Tavily (1000 free) calls in Redis. Apify is unlimited at the call level (per-run pricing).
- `SearchFlights` returns `ErrQuotaExhausted` when the bucket is empty, refusing to burn paid credits silently.
- Admin dashboard at `GET /api/v1/admin/quota` reports remaining budget per provider.

### Logging
- Structured slog JSON output. `mw.HTTPRequestLogger` emits one record per request tagged with `request_id`, `method`, `path`, `status`, `bytes_written`, `user_id`, and `is_pro`.
- `mw.SlogContext(ctx)` is the handler-side helper for threading request + user IDs.
- Handler error responses use `jsonMaskedError` or `jsonInternalError` — raw service errors never reach clients. Anthropic/SerpAPI/Apify error bodies stay in server logs.

### Data
- PIPEDA-aligned: spend history CSV export at `GET /wallet/{sessionID}/spend/export`. Account delete at `DELETE /auth/me` performs soft-delete (migration 22) with FK cascade.
- No card numbers stored — only catalog/wallet IDs.
- No raw passwords logged anywhere.
- Refresh tokens are stored as `sha256(token)` — leaking the row does not leak the bearer.

### Frontend
- No `dangerouslySetInnerHTML`.
- `react-markdown` rendered AI output without `rehypeRaw`, so HTML strings are escaped.
- `__Host-` cookie prefix not currently used (deferred; `Secure` + `HttpOnly` set in production).

### Infrastructure
- Docker image runs as `USER 10001:10001`. The runtime needs read access to `/app` and write access to nothing — state lives in Postgres + Redis.
- CI runs `govulncheck` against the Go module graph and `npm audit --omit=dev --audit-level=high` against frontend production deps on every PR + main push.
- CI verifies the Docker image's `Config.User` field is `10001:10001`. A regression that drops root would fail the build.

## What we explicitly do not do

- No metrics endpoint yet (`/metrics`). Structured slog covers the platform-level dashboards most teams need first.
- No distributed tracing. OpenTelemetry can drop in around chi later.
- No background workers besides the Apify smoke checker and the standalone `cmd/refresh-valuations`. Award-watch alerting is a deferred follow-up.
- No bank sync. CSV statement import is the manual substitute until Plaid Canada / Flinks contracts are in place.
- No CAPTCHA on login. Failed-login rate-limit is the only protection today; revisit after the first credential-stuffing incident or before publicly opening signup.
- No `__Host-` cookie prefix. Considered, deferred — the SameSite + Secure + HttpOnly combination matches industry posture for our subdomain layout.
- No automatic dependency upgrades. `Dependabot` config can be added when the manual cadence becomes painful.

## Known gaps (tracked elsewhere)

- The body-param session-owner check is currently positional-with-fallback (a variadic argument that no-ops if nil). A refactor to make it strictly required is on the security backlog so a future constructor caller can't silently bypass the IDOR check.
- WriteTimeout is 5 minutes globally to support SSE chat streaming. A per-route timeout middleware would tighten the non-SSE surface; deferred until SSE stops being the bottleneck.
- `next-themes` listed in `frontend/package.json` is currently unused. Prune in a routine dep-bump pass.
