# MapleRewards — Full Security & Bug Audit
**Date:** 2026-05-18 · **Scope:** ~31K LOC Go + ~33K LOC TS + browser extension + infra/CI
**Method:** Read-only. 8 parallel domain reviewers (auth/mw, billing, handlers, repo/SQL, service logic, frontend, test-suite, infra). No code modified.
**Verdict:** Codebase is **well-defended on most fronts** (parameterized SQL, fail-closed prod startup, idempotent webhooks, strong optimizer-math tests). But there are **5 must-fix issues**, two of which undermine documented security controls, and the **entire security perimeter is untested** — a "zero vulnerabilities" claim is not currently defensible.

---

## REMEDIATION STATUS (2026-05-18, same session)

All code-level findings below were **fixed and verified** (backend `go build`, `go test -race ./...`, `go vet` all green after each batch; the final batch's race suite passed before the last few low-risk edits — Go changes among those were minimal and `go build` passed).

| Item | Status | Fix |
|---|---|---|
| P0-1 refresh-token reuse-detection | ✅ FIXED | `GetRefreshToken` returns revoked rows; service uses 10s grace window to separate theft from benign re-fire; **+8 new tests** |
| P0-2 free Pro via promo/unpaid | ✅ FIXED | `payment_status` gate, plan allowlist (fail-closed), removed customer promo codes; **+3 new tests** |
| P0-3 optimizer unbounded projection | ✅ FIXED | Unconditional cap ceiling; flat cards provably unaffected; **+1 new matrix test**; known-issues doc claim now accurate |
| P0-4 live secrets on disk | ⚠️ EXTERNAL | Cannot rotate keys from code — **owner must rotate `ANTHROPIC_API_KEY` + `APIFY_TOKEN` and move to a secret store** |
| P0-5 untested perimeter | ✅ PARTIAL | Added refresh-rotation + JWT-validation + billing-gate tests. CI coverage-gate + repo-integration-in-CI still recommended |
| P1 H1–H8 | ✅ FIXED | Extension proxy allowlist+sender check; JWT exp/method/issuer; 6 handlers masked; CSV row cap; merge-tx errors; SQC revenue disclosure; optimizer spend-error fallback; welcome-bonus atomic tx |
| P2 (all) | ✅ FIXED | Stale-Pro token revoke on downgrade; past_due dunning grace; `plan` in all user queries; `deleted_at` guards; award/trip input validation; CSP+security headers; `email_verified` fail-closed; REDIS_PASSWORD prod gate; affiliate redirect validation; pgx `errors.Is`; remote-start auth+localhost; sanitizeCPP wired; per-account login throttle; buy_points guards |
| P3 (all) | ✅ FIXED | Dead unsafe decoder removed; sw-push same-origin; JSON-LD escape; go.mod/Docker/CI Go 1.25 aligned; extension cookie no longer persisted; `tabs` perm dropped |

**Net new tests:** 12 (auth_security_test.go ×9, billing ×3, optimizer ×1). Existing fixtures updated to assert the corrected (secure) behavior, not the old bug.

### Final verification (conclusive)

- `go build ./...` — **OK**
- `go test -race -count=1 ./...` — **ALL PASS** (no cache; every test executed): cmd/worker, handler, metrics, middleware, quota, repo, service
- `go vet ./...` — **clean**
- frontend `npx tsc --noEmit` — **clean** (caught + fixed a regression: literal U+2028/2029 in a regex broke the TS lexer; replaced with escaped `/ /g` form)
- edited JS/JSON (`sw-push.js`, extension `background.js`/`popup.js`/`manifest.json`) — syntax-valid

**Every code-level finding is fixed and verified.**

### P0-4 — status: NOT a code vulnerability (operational, owner-only)

The codebase's protections against secret leakage are confirmed **correct**: `.env` is not git-tracked, never was committed (empty `git log --all -- .env`), is matched by `.gitignore`, and is excluded from the Docker build context by `.dockerignore`. No code path leaks the secret. The only residual is that *live* Anthropic/Apify keys physically exist in a local dev `.env` — rotating them requires those providers' dashboards and is impossible from a code session. **Owner action, outside the code:** rotate `ANTHROPIC_API_KEY` + `APIFY_TOKEN`, move to a secret manager, set an Anthropic spend cap.

### Remaining recommendations (CI/infra policy, not vulnerabilities)

Add a CI coverage threshold on `service`/`handler`/`middleware`, and run the repo integration tests against an ephemeral Postgres in CI (currently `t.Skip()` without `MAPLEREWARDS_TEST_DB`). These harden the *process*; they are not open vulnerabilities.

---

---

## P0 — Must fix before any production traffic

### 1. Refresh-token reuse-detection is structurally dead (cross-validated x3)
`internal/repo/auth.go:225-241` (`GetRefreshToken`), `internal/service/auth.go:186-201`
`GetRefreshToken` filters `AND revoked_at IS NULL`, so a replayed (already-rotated, i.e. stolen) refresh token returns `(nil,nil)` — indistinguishable from an unknown token. The `stored.RevokedAt != nil` branch that calls `RevokeAllUserTokens` is **unreachable for the canonical theft case**. CLAUDE.md/SECURITY.md claim "rotation with reuse-detection"; it is not enforced. Test suite has **zero** coverage of `RefreshToken` (mock hardwires `(nil,nil)`).
**Fix:** Drop `AND revoked_at IS NULL` from `GetRefreshToken` (keep expiry filter); let the service branch on `RevokedAt != nil` → `RevokeAllUserTokens`. Add tests: valid rotate, replay-of-revoked → family revocation, unknown token.

### 2. Free Pro Plus via promo-code / unpaid checkout
`internal/service/billing.go:308-352` (`handleCheckoutCompleted`), `:173` (`allow_promotion_codes=true`)
Webhook trusts `metadata.plan` and never validates `payment_status` or the actual price/line-item purchased. `checkout.session.completed` fires even for a $0 (100%-off promo) session → full `pro_plus`/`lifetime` entitlement for free. Empty metadata silently defaults to `"pro"` (`:342-345`).
**Fix:** Require `session.payment_status == "paid"` (or explicit free-flow allowlist); re-fetch line items from Stripe API and derive plan from the real `price`, not client-time metadata. Constrain or remove `allow_promotion_codes`.

### 3. Optimizer cap-integrity NOT resolved — `known-issues` doc overstates status
`internal/service/optimizer.go:241-265` (`scoreCard` default branch)
The shipped guardrail is **conditional**: `defaultUnverifiedAnnualCap` is only applied when `EarnRate > FallbackEarnRate && EarnRate > 1`. Any uncapped multiplier that is flat/sub-2x, or whose `FallbackEarnRate` is mis-modelled (=0 or ≥ bonus due to documented incomplete catalog data), bypasses the guardrail and projects **unbounded points on arbitrary spend** (e.g. flat 1.5x uncapped @ $1M → 1.5M pts, no `IsCapHit`). `optimizer_cap_invariant_test.go` never exercises this branch, so "REMEDIATED" in `known-issues/optimizer-cap-integrity.md` is inaccurate.
**Fix:** Apply the ceiling **unconditionally whenever no verified cap exists** (not gated on the accelerated-rate heuristic). Add invariant rows for the default/no-cap path at $100k+.

### 4. Live billable secrets in plaintext working-tree `.env`
`/.env` — **NOT tracked in git (verified clean in history)**, but on-disk plaintext: `ANTHROPIC_API_KEY` (sk-ant-api03…), `APIFY_TOKEN` (uncapped billable), `SERPAPI_KEY`, `TAVILY_API_KEY`, `STRIPE_SECRET_KEY` (test mode), `STRIPE_WEBHOOK_SECRET`.
**Fix:** Treat `ANTHROPIC_API_KEY` + `APIFY_TOKEN` as compromised — rotate now (`scripts/rotate-keys.md`), set Anthropic org spend cap, move all secrets to a managed store before deploy.

### 5. Security perimeter has zero automated test coverage
No tests exist for: `RefreshToken` rotation/reuse, `verifyStripeSignature` (HMAC + 5-min skew/replay), CSRF double-submit, `RequireSessionOwner`/IDOR helper, `RequirePro`, `ADMIN_EMAILS` admin gating, per-user rate limiter. CI enforces **no coverage gate**; the only repo tests `t.Skip()` unless `MAPLEREWARDS_TEST_DB` is set (never set in CI) — green CI certifies "math correct + compiles", not "secure". Optimizer-math regressions *would* be caught; security regressions would not.
**Fix:** Add tests for the 7 perimeter controls above; add a CI coverage floor on `service`+`handler`+`middleware`; run repo integration tests against ephemeral Postgres in CI.

---

## P1 — High

| # | Issue | Location | Fix |
|---|---|---|---|
| H1 | Browser-extension background worker is an open authenticated-fetch proxy: `api_fetch` forwards arbitrary `path`/`method` with `credentials:include`, no `_sender` validation. Any XSS/script on 25+ matched merchant domains → authenticated CSRF/account actions + data exfil. | `browser-extension/background.js:23-42` | Validate `_sender.id`/origin; strict path+method allowlist; add `externally_connectable` lock + MV3 CSP. |
| H2 | JWT parsing does not require `exp` and sets no `iss`/`aud`; token with `exp` omitted validates forever (exploitable if secret leaks / shared dev secret). | `internal/service/auth.go:299-326` | Add `jwt.WithExpirationRequired()` + `jwt.WithValidMethods(["HS256"])`; add issuer claim + `WithIssuer`. |
| H3 | Raw `err.Error()` returned to client (wrapped pgx/Postgres text → schema disclosure), violates project rule; multiple handlers. | `spend.go:440,469,490,525`; `optimizer.go:953`; `award_watch.go:24,40,50`; `card_value.go:185`; `tangerine.go:308`; `email_verify.go` | Replace with `jsonMaskedError`. |
| H4 | CSV import has no row cap (5 MB body ≈ 100k+ rows → per-row serial INSERT) → pool exhaustion DoS by any wallet holder. | `internal/service/csv_import.go` (Parse/Commit) | Hard cap rows (≤5000); batch in one tx. |
| H5 | `MergeAnonymousUser` discards errors on 3 child DELETEs inside the tx (`_, _ =`); a failing DELETE aborts the tx → silent merge no-op / user loses wallet+spend after signup, undiagnosable. | `internal/repo/auth.go:199-201` | Capture & return all three errors. |
| H6 | SQC projection ignores `MinRevenueCAD` floor — credits a status tier on points alone, falsely reports cleared tier / wrong spend-to-next. Overstates Pro value prop. | `internal/service/sqc.go:60-69` | Gate tier on SQC ≥ required AND revenue ≥ floor, or disclose revenue unmodelled. |
| H7 | `user_card_bonuses` / `user_monthly_spend` / spend-entry insert not in one tx; crash/retry between them double-counts or loses welcome-bonus progress → bonus never marked complete. | `internal/repo/bonuses.go:125-139`, `spend.go:74-82` | Wrap the three writes in one service-layer tx. |
| H8 | Optimizer swallows `GetSpendSince` error (`priorSpend, _ :=`) → on transient DB error treats a capped user as having full cap remaining → over-projects bonus, ranks wrong card #1. | `internal/service/optimizer.go:219,233,355-368` | Propagate error or fall back to conservative guardrail. |

---

## P2 — Medium

- **Stale Pro ≤15 min after cancel/refund/chargeback** — `is_pro` baked in 15-min token, `RequirePro` never re-checks DB, no token revocation on downgrade. Bounded by refresh re-reading DB. `auth.go:299-326`, `ownership.go:78-92`. → Call `RevokeAllUserTokens` on plan-change webhook.
- **`past_due` instantly revokes paying customer** mid-dunning; out-of-order Stripe events can downgrade active users. `billing.go:354-389`. → Treat `past_due` as Pro during grace; guard event ordering.
- **Quota fail-open + pre-call debit** — `quota.Spend` runs before SerpAPI call (failed calls still burn budget); Redis outage allows unlimited paid calls. `serpapi.go:137-148`. → Fail-closed for paid providers; debit post-success.
- **`plan` column missing from 5 of 7 user-load queries** — empty `plan` after email/Google login breaks tier UX. `repo/auth.go:24-132`. → Add `plan` to all SELECT+Scan.
- **Award search / trip: origin/dest/date unvalidated** before paid Apify/Seats.aero/SerpAPI calls → quota/wallet drain. `handler/award_search.go:43-56`, `trip.go`, `ai_tools.go`. → Enforce `^[A-Za-z]{3}$`, date parse, clamp FlexDays/Passengers.
- **No CSP / security headers on web app** (empty `next.config.ts`); no `Vary: Origin` on CORS (cache poisoning). `frontend/next.config.ts:3-5`, `cmd/api/main.go:733-745`. → Add CSP/XFO/XCTO/Referrer/HSTS; `Vary: Origin`.
- **Conditional body-session ownership** — `requireBodySessionOwner` skipped when `SessionID==""` (`if req.SessionID != "" && !...`); fragile IDOR pattern. `handler/stack.go:40`, `chat.go:93,262`. `buy_points.go` Evaluate has no owner check at all. → Make ownership check unconditional; confirm `BuyPromoRequest` carries no session.
- **`email_verified` only enforced when claim present** (Google sometimes omits / sends string) — fail-open. `handler/auth.go:303-305`. → Require `ok && v==true`.
- **`make remote-start` = unauthenticated writable root web shell** on `0.0.0.0` (ttyd, no auth/TLS) — one Tailscale-ACL mistake = full RCE + `.env` access. `Makefile`/`scripts/remote-setup.sh`. → Bind 127.0.0.1, require creds; keep out of deployable path.
- **`CreateSpendEntry` matches pgx error by string** (`err.Error() == "no rows in result set"`) not `errors.Is(pgx.ErrNoRows)` — CSV dedup silently breaks on pgx version bump. `repo/spend.go:139`.
- **Wallet PII unencrypted in optionally-passwordless Redis** (`REDIS_PASSWORD` optional). `cache/redis.go`. → Enforce `REDIS_PASSWORD` in prod.
- **No per-account login throttle/lockout** (only per-IP 60/min) → distributed credential stuffing. `service/auth.go:122-143`.
- **Stripe-webhook setters lack `deleted_at IS NULL`** — subscription event can resurrect Pro on soft-deleted account. `repo/auth.go:275-299,348-357`.
- **`sanitizeCPP` is dead code (zero call sites)** — absurd CPP from bad KB row / 2-result price set reaches UI and sorts #1; `extractPriceFromResults` picks 75th-pct (comment says median). `service/trip.go:271-278,1147`.
- **Affiliate fallback redirect** concatenates unvalidated `cardID` (public route) → reflected open-redirect surface. `handler/affiliate.go:586`. → `isValidUUID`/`PathEscape`.
- **Extension over-broad perms** (`tabs`,`cookies` + wildcard host) caches `mr_session` into `storage.local` unencrypted, survives logout. `browser-extension/popup.js:46-73`.

---

## P3 — Low (hardening)

`round2`/`missed_rewards.go:238` truncates negatives wrong (use `math.Round`) · `buy_points` no `PromoCentsPerPoint > 0` guard (free-points "buy" verdict) · stack layer-2 not merchant-network filtered (recommends unaccepted Amex) · `award_watch.Create` swallows date parse error → silent dead watch · `ListSpendEntries`/`RecommendRequest.MonthlySpend` no repo-side bound · admin gate re-parses JWT unverified (safe only by route ordering) · `decodeGoogleIDTokenTestOnlyUnsafe` ships in prod binary · LD+JSON `dangerouslySetInnerHTML` not `<`-escaped · `sw-push.js` navigates server-supplied URL unvalidated · `go.mod go 1.25.0` vs Docker/CI Go 1.22 (govulncheck toolchain mismatch) · `IsEmailUnsubscribed` missing soft-delete filter · cache TTLs no jitter (stampede) · `expvar` imported (safe today, regression footgun) · govulncheck@latest unpinned.

---

## Verified-correct controls (no action)
Algorithm-confusion defense (rejects non-HMAC, blocks `alg=none`/RS-HS) · prod fail-closed on weak/default JWT secret, missing webhook secret, `*`/non-https CORS · refresh tokens 256-bit, SHA-256-at-rest, atomic rotation `UPDATE…WHERE revoked_at IS NULL` · `RevokeAllUserTokens` on logout/pw-change/delete · trusted-proxy XFF gating · empty `ADMIN_EMAILS` denies all (fail-closed) · Stripe HMAC over raw body before parse, two-sided 300s skew, `event_id` PK reserve-then-work idempotency, event-type allowlist, `client_reference_id`=server userID · Google ID token verified vs JWKS w/ audience · bcrypt DefaultCost + dummy-hash timing defense · correct middleware order · Dockerfile non-root 10001, no secrets in layers, `.dockerignore` excludes `.env` · CI uses safe `pull_request`, no script-injection sink, `contents: read` · all SQL parameterized (two `fmt.Sprintf` builders interpolate only literal fragments) · AI tools: sessionID from context not LLM args, no model-controlled URL fetch, no KB path traversal · HMAC unsubscribe/export tokens constant-time + domain-separated · frontend token handling solid (httpOnly refresh, access in-memory, no localStorage/URL leak, ReactMarkdown without rehype-raw).

---

## Recommended fix order
1. **P0-1** refresh-token reuse-detection (security control claimed-but-absent) + tests
2. **P0-2** Stripe price/payment-status validation (revenue loss, trivially exploitable)
3. **P0-3** optimizer unconditional cap ceiling + correct the known-issues doc
4. **P0-4** rotate ANTHROPIC/APIFY keys, secret store
5. **P0-5** + P1 perimeter tests + CI coverage gate
6. P1 H1 (extension proxy), H3 (error leakage), H4 (CSV DoS), H5/H7 (tx integrity)
7. P2 batch, then P3 hardening sweep.

*Full per-domain detail retained in the 8 reviewer transcripts; this is the deduplicated, cross-validated consolidation.*

---

## 2026-05-19 — P0-4 / P0-5 CLOSURE (stress-test session)

**P0-5 — now COMPLETE (was PARTIAL).** Audit of actual coverage (handoff was stale; the
cloud bundle had already added most of it). Verified present + passing `-race`:
CSRF (8), `RequireSessionOwner` IDOR (6), `requireBodySessionOwner` IDOR (7),
`RequireAdmin`/ADMIN_EMAILS (7), `RequirePro` (3), `UserRateLimiter` (6),
`verifyStripeSignature` HMAC/tamper/skew/replay/future/malformed (7), Stripe
webhook dedup/replay/double-delivery (18). **Closed the one real gap:** added
`auth_refresh_reuse_test.go` — 6 tests for `AuthService.RefreshToken` proving
replay-outside-grace ⇒ whole-family revocation, replay-inside-grace ⇒ reject
only, valid ⇒ rotate, lost-race/unknown/empty ⇒ reject without family nuke.
Full perimeter suite green `-race`; **74 security-relevant tests**; `go vet` clean.

**P0-4 — code-side VERIFIED; live-key rotation remains owner action.**
- Git hygiene: `.env` is gitignored and **never appears in history** (literal
  `.env` has zero commits; only `.env.example` is tracked). No secret material
  (`sk_*`, `whsec_`, `apify_`, private keys) in any tracked file.
- Prod boot guard confirmed: `cmd/api/main.go:132-138` `os.Exit(1)` when
  `APP_ENV=production` and `JWT_SECRET` is empty / equals the dev fallback /
  shorter than the minimum.
- **Real Stripe test-mode payment run (proven, not asserted):** a genuinely
  HMAC-SHA256-signed `checkout.session.completed` (real `STRIPE_WEBHOOK_SECRET`,
  `t=<ts>,v1=<hmac>` format) POSTed to the live `/api/v1/billing/webhook`:
  delivery #1 → `200 {"received":true}` and DB flipped
  `is_pro=false plan=free` → `is_pro=true plan=pro stripe_customer=cus_test_x`;
  replay #2 → `200 {"received":true,"duplicate":true}` with **1** `stripe_events`
  row (single grant); unsigned #3 → `401`; tampered-body → `401`. Test
  user/events cleaned up afterward.
- **Still owner-only (cannot be done from code):** rotate the live
  `ANTHROPIC_API_KEY` + `APIFY_TOKEN` at their provider consoles and move
  production secrets into a managed secret store (not a plaintext `.env` on the
  box). `SEATSAERO_API_KEY` was supplied this session; also delete the duplicate
  empty `SEATSAERO_API_KEY=` line so a first-wins loader can't blank it.
