# Affiliate Outreach Playbook — How to Apply & What to Send

_Companion to `docs/AFFILIATE-RESEARCH-CANADA.md`. This is the do-it list: exact steps, where to apply, and copy-paste application text._

You are not negotiating custom deals yet. You are **applying as a publisher** to three places, in order. Each has a web form with a few free-text fields. The copy below is written to pass those forms. Do not invent traffic numbers — the copy is deliberately framed around product depth and Canadian-market fit, which is what finance networks actually screen for in a new publisher.

---

## STEP 0 — Prerequisites (do before any application)

Networks load your site and check these. Missing items = auto-reject.

- [x] **Affiliate disclosure** — DONE. Added as §9 of `/terms` ("Affiliate disclosure"), linked from the Terms page which is in the footer. This is the single most-checked item.
- [ ] **Privacy policy** — exists at `/privacy`. Confirm it's reachable from the homepage footer (it is).
- [ ] **Site is live on a real domain** with HTTPS (maplerewards.app or your production domain). Localhost/staging will fail review.
- [ ] **Contact email that matches the domain** — use `hello@maplerewards.app` (already your support address). Networks distrust gmail/outlook applicants for finance.
- [ ] **A few content pages that aren't behind login** — your `/cards`, `/compare`, `/loyalty`, `/feed`, `/tools` pages are public and content-rich. Good. Reviewers need to see real content without signing up.
- [ ] **Tax/payment identity** — have a SIN (sole proprietor) or business number ready. Not required to *apply*, required to *get paid*. An incorporated entity or registered sole proprietorship strengthens the application; not a hard blocker for CJ/Fintel intake.
- [ ] **Basic analytics installed** (so you can answer "how do you drive traffic" honestly later).

---

## REUSABLE COPY BLOCKS

Paste these into the relevant form fields. Adjust the one bracketed traffic line honestly.

### Site / business description (long)
> Maple Rewards (maplerewards.app) is a Canadian-built credit-card rewards optimization platform for Canadian residents. It covers 90+ Canadian credit cards across 17 loyalty programs (Aeroplan, Amex Membership Rewards, RBC Avion, Scene+, BMO Rewards, CIBC Aventura, and more). Core features: a points optimizer that recommends the best card for any purchase, an AI rewards assistant, an award-flight and trip planner, devaluation and transfer-bonus alerts, and Pro analytics tools (missed-rewards reports, Aeroplan status projection, portfolio valuation). The product is software-only and editorially independent — recommendations are driven by the underlying earn-rate and redemption math, with a clear affiliate disclosure published in our Terms. Our audience is Canadian rewards-maximizers and credit-card optimizers actively comparing cards and ready to apply.

### Site description (short, ≤160 chars)
> Canadian credit-card rewards optimizer — 90+ cards, 17 loyalty programs, AI assistant, award/trip planner. Editorially independent, disclosed affiliate model.

### Audience / niche
> Canadian residents (18+) optimizing credit-card rewards and travel points. High purchase intent — users reach card-application decisions through our optimizer, comparison, and trip-planning tools.

### How you promote / drive traffic
> Card recommendations and comparisons surfaced contextually inside an optimizer and a points/trip planner; editorial content and a weekly rewards feed; SEO on card-comparison and loyalty-program pages. Affiliate links appear only as clearly-disclosed "Apply" actions on individual card and comparison pages — never injected into recommendations, which are ranked by math independent of commission.

### Monthly traffic / volume (be honest)
> [Choose the true one: "Pre-launch / early stage — building publisher relationships ahead of public launch" OR "Early traffic, <X,000 monthly visitors, growing." Do NOT inflate — finance networks verify and a false number is a permanent blacklist.]

### Why approve us (the pitch — for free-text "anything else" fields and the Fintel/issuer email)
> Maple Rewards is the only Canada-native personalized rewards optimizer at this depth — incumbents in the space are content/affiliate media sites, not software. We send pre-qualified, decision-stage Canadian applicants: a user only sees an "Apply" link after the optimizer has matched a card to their actual spending, so click-to-approval quality is high. We maintain a published affiliate disclosure, do not down-rank non-commissioned cards, and follow FCAC accuracy and Competition Act requirements on all rate and offer claims.

---

## STEP 1 — American Express Canada via CJ Affiliate (lowest barrier — do first)

**Why first:** highest payout (~CA$200/approved card), public network, fastest approval (days), no per-bank gatekeeping.

1. Go to **https://www.cj.com/** → "Publishers" → Sign Up. Create a CJ Publisher account.
2. Fill the **Network Profile** with the long site description + audience + promotion blocks above. Add `maplerewards.app`, the contact email on the domain, and your payment/tax identity.
3. Once the account is live, go to **Advertisers** and search **"American Express"** / **"American Express Canada"**. Apply to the **American Express Canada** program (and any "Amex Canada Cards" sub-programs).
4. In the application's free-text/notes field, paste the **"Why approve us"** block.
5. After approval: CJ gives you a tracking link per card/offer. That link is what goes into `cards.affiliate_url` (see Step 4).

Expect: CJ account approval first, then per-advertiser (Amex) approval separately. Amex Canada cookie window is short (~7 days) — fine, you attribute on click and they pay on approval.

---

## STEP 2 — Fintel Connect (the big one — most Canadian bank inventory)

**Why:** one publisher application → access (with per-bank approval) to **RBC, Scotiabank, Tangerine, National Bank** and ~100 Canadian FIs. There is no public "RBC affiliate signup" — Fintel *is* the path.

1. Go to **https://www.fintelconnect.com/** → "For Publishers" / "Become a Partner" / "Affiliates" → publisher application form.
2. Complete it with the long site description, audience, promotion-method, and traffic blocks. Use the domain email.
3. Submit. Fintel runs a **content-compliance review** (they use automated + manual review on finance claims) before activating you, and again before each program goes live.
4. Once you're an approved Fintel publisher, inside their dashboard **apply to individual programs**: RBC, Scotiabank, Tangerine, National Bank credit-card programs. Each is approved separately by the bank.
5. For each approved program, Fintel issues tracking links per card → `cards.affiliate_url`.

If the public form is thin or you want to accelerate, send the email in **Appendix A** to their partnerships/publisher contact (found on the same page or via their "Contact" / LinkedIn).

Expect: longer than CJ. Publisher approval, then per-bank approval. Payment ~12th business day monthly, only after the bank funds Fintel.

---

## STEP 3 — Ratehub Partner / Affiliate Program (aggregator fallback for gap cards)

**Why:** lets you monetize card inventory you don't have a direct/Fintel deal for, via quick links / embeddable widgets / white-label, with no per-issuer negotiation. Good for filling coverage while Fintel approvals trickle in.

1. Go to **https://www.ratehub.ca/affiliate-program** (or search "Ratehub affiliate / partner program").
2. Apply with the same copy blocks. Emphasize the comparison/optimizer use-case — that's exactly their publisher product.
3. On approval you get either tracking links or embeddable units. For our model, take the **per-card tracking links** and use them as `cards.affiliate_url` for any card not covered by Step 1/2.

---

## STEP 4 — Wire approved links into the product (per program that goes live)

The code is already built. For each approved card you only do data entry:

1. Get the network's tracking URL for that specific card.
2. Create a new migration `migrations/0000NN_affiliate_links_seed.up.sql` (never edit existing migrations) that runs:
   ```sql
   UPDATE cards SET affiliate_url = '<network-tracking-url>',
                    affiliate_payout_cad = <expected-cad-payout>
   WHERE id = '<card-uuid>';
   ```
   (One block per approved card. `affiliate_payout_cad` is your own internal estimate for analytics — not billed by it.)
3. The frontend `ApplyButton` auto-reveals once `affiliate_url` is set (it hides itself when empty — confirmed in `components/cards/ApplyButton.tsx`). The `/api/v1/affiliate/click/{cardId}` endpoint already 302-redirects and logs the click. Nothing else to build.
4. Verify one card end-to-end: click "Apply", confirm the redirect lands on the network's tracking URL and a row appears in `affiliate_clicks`.

Start wiring as soon as **one** program (Amex) is approved — don't wait for all three.

---

## Order & realistic expectation

1. **Today:** finish Step 0 checklist, submit **CJ** (Step 1) and the **Fintel** publisher form (Step 2) — both can be in flight simultaneously.
2. **This week:** submit **Ratehub** (Step 3).
3. **On first approval (likely CJ/Amex):** do Step 4 for Amex cards, ship it.
4. **As Fintel per-bank approvals land:** add each via a new seed migration.
5. **TD / CIBC / BMO:** no public publisher path — revisit directly only once you have traffic to show. Skip for now.

Compliance reminder for every application and every card page: keep rate/APR/welcome-offer figures accurate (FCAC), make no misleading "best/guaranteed" claims (Competition Act), keep the disclosure visible (now live in `/terms` §9).

---

## Appendix A — Email template (Fintel Connect / direct issuer partnerships)

> **Subject:** Publisher partnership — Maple Rewards (Canadian credit-card optimizer)
>
> Hi [name / Partnerships team],
>
> I run Maple Rewards (maplerewards.app), a Canada-native credit-card rewards optimization platform — 90+ Canadian cards across 17 loyalty programs, with a points optimizer, AI rewards assistant, and an award/trip planner. We're an editorially independent software product (recommendations ranked by earn-rate and redemption math, with a published affiliate disclosure), not a content/affiliate media site.
>
> I'd like to join Fintel Connect as a publisher and apply to your Canadian credit-card issuer programs [or: "to the American Express Canada program"]. Our users reach card decisions through the optimizer, so traffic we'd send is decision-stage and pre-qualified. We comply with FCAC accuracy and Competition Act requirements on all rate/offer claims and keep our affiliate disclosure visible site-wide.
>
> [One honest line on stage/traffic.] Could you point me to the right application path, or let me know what you need from us to proceed?
>
> Thanks,
> [Your name] — Maple Rewards — hello@maplerewards.app — maplerewards.app

---

## Appendix B — Field cheat-sheet (what the forms ask → which block to paste)

| Form field | Paste |
|---|---|
| Website URL | maplerewards.app |
| Site/business description | "Site / business description (long)" |
| Short tagline / category | "Site description (short)" + category: Personal Finance / Credit Cards |
| Audience / target market | "Audience / niche" |
| How do you promote offers? | "How you promote / drive traffic" |
| Monthly traffic / impressions | the one honest traffic line |
| Promotional methods (checkboxes) | Content / SEO / Comparison tools / Email newsletter |
| Anything else / notes to advertiser | "Why approve us" block |
| Contact email | hello@maplerewards.app (domain-matched) |
| Payment / tax info | SIN (sole prop) or business number |
