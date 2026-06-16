# MapleRewards — Affiliate Action Plan (June 2026)

Current, verified "what do I actually do" plan to start earning credit-card affiliate
commission. Companion to `docs/AFFILIATE-OUTREACH-PLAYBOOK.md` (May 22) which holds the
reusable application copy blocks + outreach email (Appendix A). This doc supersedes its
network/ladder sections with verified June-2026 research.

---

## TL;DR

You don't "buy" affiliate links. You **apply as a publisher** to the networks that hold the
issuers' programs; on approval they give you a **tracking URL per card**. Three doorways:

1. **American Express Canada → via CJ Affiliate** (cj.com) — lowest barrier, approves in days.
2. **Canadian banks (RBC, Scotiabank, Tangerine, Neo, National Bank) → via Fintel Connect** (fintelconnect.com) — one publisher application, then per-bank approval.
3. **Ratehub publisher program** (ratehub.ca/affiliate-program) — aggregator fallback for cards with no direct deal.
   Plus self-serve fintech: **KOHO** (→ impact.com) and **Wealthsimple**.

**Best first move:** submit the **CJ** (Amex) and **Fintel** publisher applications today, in parallel.

## ⚠️ The thing that makes this urgent

Your Apply buttons already work — but they earn **$0**. Verified in code:
- Migration `000100_seed_card_application_urls` set `cards.affiliate_url` to **official issuer pages**
  (e.g. `americanexpress.com/en-ca/credit-cards/gold-rewards-card/`), **not tracking links**.
- `affiliate_payout_cad` is **set nowhere** in any migration.

So clicks send users to the real card page and Amex/the bank pays you nothing, because those
aren't your tracked URLs. The infra is 100% built (migration `000019`, `internal/handler/affiliate.go`,
redirect route `cmd/api/main.go:512`, `ApplyButton.tsx` reveals when `affiliate_url` is set) — **only
the data is a placeholder.** Real money starts the moment you replace one card's URL with a real
tracking link.

---

## Reality check (zero-traffic, pre-launch)

You can create network accounts and apply now. But **per-bank approvals are unlikely until you show
content + traffic** — RBC's Fintel listing wants publishers "with the ability to drive high quality
applicants." Winnable now: **Amex via CJ, KOHO, Wealthsimple, Ratehub.** Defer: **TD, CIBC, BMO, Brim**
— no self-serve path; those are earned at scale (as Ratehub / CreditCardGenius did).

---

## The ladder

| Stage | Do | Why |
|---|---|---|
| **0 — Prereqs (today)** | Confirm the checklist below: disclosure live, privacy in footer, site on real HTTPS domain, domain email, analytics, SIN ready. | Networks auto-load your site and reject on missing disclosure/privacy/live-domain. |
| **1 — Amex + Fintel (today, parallel)** | Create CJ publisher account, fill Network Profile (copy blocks in the May 22 doc), apply to American Express Canada. Simultaneously submit Fintel Connect publisher application. | CJ/Amex approves in days; Fintel review is slower, so start both now. |
| **2 — Fintech + Ratehub (this week)** | Apply to KOHO (koho.ca/affiliate → impact.com), Wealthsimple referral program, and Ratehub publisher Google Form. | Least traffic-gated real programs → most likely additional approvals; fill catalog coverage. |
| **3 — Wire first approval (on approval)** | New migration: `UPDATE cards SET affiliate_url='<tracking-url>', affiliate_payout_cad=<est> WHERE id='<uuid>'`. Verify one card end-to-end. **Ship when ONE program lands — don't wait for all.** | Code is built; only data entry remains. |
| **4 — Per-bank Fintel (weeks)** | In Fintel dashboard, apply per program: Scotiabank, RBC, Tangerine, Neo, National Bank. Add each via a new seed migration as it goes live. | Scotiabank publishes the highest concrete CPA ($110–175/approved card); these are the revenue core but approval-gated. |
| **5 — Big banks + scale (after traffic)** | Revisit TD/CIBC/BMO/Brim via direct BD outreach. Reapply to anything that rejected you after its window. | Direct big-bank deals are earned at scale, not day one. |

---

## Apply now (specific programs)

| Program | Where | Odds (new site) | Notes |
|---|---|---|---|
| **Amex Canada via CJ Affiliate** | https://signup.cj.com/member/signup/publisher/ | Moderate | Lowest-barrier major card program. ~CA$200/approved card, 7-day cookie reported but **UNVERIFIED (secondary directories only)** — confirm inside CJ after approval. |
| **Fintel Connect (publisher)** | https://www.fintelconnect.com/publishers/ | Account: plausible · per-bank: low until traffic | The **only** door to big-bank inventory (RBC/Scotia/Tangerine/Neo/National). No public "RBC affiliate signup" exists — Fintel is it. |
| **KOHO** | https://www.koho.ca/affiliate/ | Higher | Verified open, routes to impact.com; pays per new approved customer. |
| **Wealthsimple** | https://promotions.wealthsimple.com/hc/en-ca/articles/29448182409499 | Higher | Verified program; payout on a new account funded $1+ in 30 days. Adjacent inventory, not a card. |
| **Ratehub publisher** | https://www.ratehub.ca/affiliate-program | Moderate | Aggregator fallback (links/widgets/white-label) for cards with no direct deal. Audience-assessed Google Form. |

---

## Prereqs before applying

- [ ] Affiliate **disclosure** visible near links — already live as `/terms` §9 (most-checked item).
- [ ] **Privacy policy** reachable from the homepage footer — exists at `/privacy`; confirm the link.
- [ ] Site **live on a real HTTPS production domain** (not localhost/staging) with public content (`/cards`, `/compare`, `/loyalty` qualify).
- [ ] **Domain-matched email** (e.g. `hello@maplerewards.app`) — finance networks distrust gmail/outlook.
- [ ] **Analytics** installed (so you can honestly answer "how do you drive traffic").
- [ ] **SIN** (sole proprietor) or business number ready — to GET PAID, not to apply.
- [ ] **W-8BEN** for CJ (US network): individual W-8BEN, SIN as Foreign TIN; US–Canada treaty reduces the default 30% US withholding — **confirm exact rate with an accountant.** Income is still taxable in Canada.
- [ ] Reusable copy blocks ready — in `docs/AFFILIATE-OUTREACH-PLAYBOOK.md`.

---

## Compliance (keep the trust moat intact)

- Keep the affiliate disclosure visible near links — required in Canada (Competition Act + Ad Standards). Already live.
- FCAC accuracy: every rate/APR/welcome-offer figure must stay correct per card.
- No misleading "best/guaranteed" claims; rankings must be honest.
- CASL: get consent before any promo email containing affiliate links.
- **Rank by math, never by commission.** `affiliate_payout_cad` is internal analytics only — NOT a ranking input. This is your documented positioning; protect it.
- Never inflate traffic on an application — finance networks verify; a false number = permanent blacklist. Sell product depth + Canadian-market fit instead.

---

## Honest expectations

CPA model: paid **only when a user is APPROVED** — clicks and declined apps pay $0. Verified rate:
**Scotiabank $110–175 per approved card** (Fintel). Amex ~$200 unverified. Blended realistic
**~$80–150 per approved card.** CJ/Amex approves in days; Fintel pays only after the bank funds Fintel
(weeks). **At zero traffic, expect near-zero revenue** — it scales with approved-applicant volume, not clicks.
Translation: the affiliate plumbing is a launch-day nice-to-have, but real revenue follows real traffic.

---

## Decisions only you can make

1. **Is the site live on a production HTTPS domain right now?** This gates every application.
2. Apply as registered **sole proprietor vs incorporated**? Not a hard blocker, but strengthens finance apps.
3. Confirm the **W-8BEN treaty withholding rate** with an accountant before CJ payout setup.
4. Verify Amex's **CA$200 / 7-day** terms inside CJ once approved (only secondary sources claim them).
5. **Cashback portals** (Rakuten/GCR/TopCashback) are scaffolded in code (migration `000015 portal_rates`) but have no join research yet — pursue or not?
6. **Refer-a-friend bridge** (Frugal Flyer model): Amex CA refer-a-friend T&Cs restrict referrals to people you know — likely non-compliant as a publisher channel. Confirm before using.

---

*Sources: CJ, Fintel Connect, Impact, KOHO, Wealthsimple, Ratehub pages + Canadian comparison-site
advertiser-disclosure pages (June 2026). Per-program commission terms marked unverified must be
confirmed inside each network — do not treat them as contractual.*
