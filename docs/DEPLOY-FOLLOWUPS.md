# Deploy follow-ups (2026-05-29)

Operational tasks to finish the production deployment. Code is done + pushed;
these are dashboard/infra steps. Ordered by priority.

## 🔴 Required for paying customers

### 1. Stripe webhook (the live blocker)
- Stripe Dashboard → Developers → Webhooks → your endpoint
  (`https://maplerewards-production.up.railway.app/api/v1/billing/webhook`).
- Copy its **Signing secret** (`whsec_…`) → Railway `maplerewards` service →
  Variables → set `STRIPE_WEBHOOK_SECRET` to it.
- Subscribe the endpoint to these events:
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, **`charge.refunded`** (new — drives the
  refund→revoke handler added this session).
- Test: one checkout with card `4242 4242 4242 4242` → the delivery must show
  **200** in Stripe. If it shows **401**, the secret doesn't match — re-copy.

### 2. Run the background worker as its own Railway service
The image now builds `./worker` (Dockerfile), but Railway only runs `./api`.
Without a worker, these silently never run: saved-trip alerts, issuer +
missed-rewards digests, promo sentinel, **account hard-delete (PIPEDA purge)**,
and CPP valuation refresh.
- Railway → New Service → Deploy from the same repo/image →
  set the start command / `Custom Start Command` to `./worker`.
- Give it the same env vars as the API (DATABASE_URL, REDIS_ADDR/REDIS_URL,
  APIFY_TOKEN, SERPAPI_KEY, SEATSAERO_API_KEY, TAVILY_API_KEY, ANTHROPIC_API_KEY,
  RESEND_API_KEY, VAPID keys). It shares the same Postgres + Redis.
- The worker now reserves 30% of the Apify monthly quota for interactive users
  and skips its sweep if it can't read the quota — no extra config needed.

### 3. Flush the prod cache after migrations
So corrected card data shows immediately (multipliers cache 24h):
```
railway run --service Redis bash -lc 'REDIS_URL="$REDIS_URL" bash' < scripts/flush-prod-cache.sh
# or, with the public Redis URL:
scripts/flush-prod-cache.sh "redis://default:…@…proxy.rlwy.net:PORT"
```

## 🟠 Strongly recommended

### 4. Database backups
Railway → Postgres → enable automated backups + a sane retention. Do ONE manual
restore to a scratch DB to confirm it actually works. Non-negotiable for a
payments app.

### 5. Error monitoring (Sentry)
The API already initializes Sentry when `SENTRY_DSN` is set (cmd/api/main.go).
Create a Sentry project, set `SENTRY_DSN` on both Railway services. Add an
uptime monitor pinging `/ready` (200 = healthy; 503 = a dependency is down).

### 6. Safari / cross-domain logins → custom domain
Code now supports `COOKIE_DOMAIN`. Today app (`*.vercel.app`) and API
(`*.railway.app`) are different registrable domains, so auth/CSRF cookies are
`SameSite=None` — which Safari + privacy browsers may block, breaking login for
those users. Fix when you have a domain:
- Point `app.maplerewards.ca` → Vercel, `api.maplerewards.ca` → Railway.
- Set `COOKIE_DOMAIN=.maplerewards.ca` and `CORS_ORIGIN=https://app.maplerewards.ca`
  on Railway; `NEXT_PUBLIC_API_URL=https://api.maplerewards.ca/api/v1` on Vercel.
- Cookies become same-site Lax + Domain — robust everywhere. (Unset =
  unchanged behavior, so this is safe to defer.)

## 🟢 Nice to have

### 7. Google sign-in (code is ready; needs config only)
The button + GIS flow + backend `/auth/google` are complete. To enable:
- Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID
  (Web). Authorized JavaScript origins = your frontend URL(s)
  (`https://maplerewards.vercel.app`, later `https://app.maplerewards.ca`).
- Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client-id>` on Vercel → redeploy.
  The "NOT CONFIGURED" button becomes the real Google button automatically.

### 8. Owner admin account (created — needs 2 steps from you)
A `lifetime`/Pro owner account was created on the prod API. To finish:
- Confirm the email + run the elevation (privilege change kept in your hands):
  ```
  railway run --service Postgres bash -lc \
   'psql "$DATABASE_PUBLIC_URL" -c "UPDATE users SET plan='"'"'lifetime'"'"', is_pro=true WHERE email='"'"'<your-email>'"'"';"'
  ```
- Add the email to `ADMIN_EMAILS` (comma-separated) on the Railway `maplerewards`
  service → this unlocks `/api/v1/admin/*` (quota, metrics, valuations) for that
  logged-in account. Admin is matched against the JWT email, so re-login after.
