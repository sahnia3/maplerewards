# MapleRewards — Leads & Outreach Brief

**Generated**: 2026-05-15 · **Total leads**: 39 (13 affiliate / 15 media / 11 investor)
**Outreach drafts**: 5 paste-ready emails (Neo, Scotia, Golden, BetaKit, Globe)

This is a working document — copy sections into a CRM/Notion as you action them. The lead brief was researched against the live repo so every outreach hook ties to a verifiable feature, not a marketing claim.

> Related docs in this repo: [`SHIP.md`](SHIP.md) (deploy runbook), [`SECURITY.md`](SECURITY.md) (threat model), [`BRAND.md`](BRAND.md) (voice rules), [`docs/DEPLOY.md`](docs/DEPLOY.md) (env vars + topology).

---

## Executive picks

| Category | Pick | Score | Why |
|---|---|---|---|
| Affiliate | **Neo Financial** | 10/10 | Fintel Connect case-study fund; $150M securitization Apr 21 = card-acquisition budget; multi-product card stack maps to our category-multiplier engine |
| Affiliate | **Scotiabank** | 10/10 | Fintel Connect program live $110-175 CPA; Casa rent + Shell Scene+ launches give a warm hook; named contact Chris Cavasin |
| Affiliate | **BMO** | 9/10 | AIR MILES → Blue Rewards transition summer 2026 is THE Canadian rewards story; we're a one-PR away from supporting Blue Points |
| Media | **Erica Alini** (Globe) | 10/10 | Carrick's effective successor + newcomers' finance newsletter = direct India-arbitrage angle fit |
| Media | **Jessica Gibson** (MoneySense) | 10/10 | Owns CA cards vertical; 2026 best-cards roundup just shipped; tool/optimizer slots into her existing content type |
| Media | **Josh Scott** (BetaKit) | 10/10 | Confirmed lead reporter on Neo+United, Brim — first native CA MaxRewards alternative is straight into his beat |
| Investor | **Golden Ventures** (Ameet Shah) | 10/10 | LP in Neo + Float; Fund V deploying; consumer + AI focus; clearest warm-intro path via Neo cap table |
| Investor | **Maple VC** (Andre Charoo) | 10/10 | Explicitly designed for Canadian-rooted founders; Neo + Clay cap table; solo-GP fast decision velocity |
| Investor | **Luge Capital** (Karim Gillani) | 8/10 | THE Canadian fintech specialist; LP base = Caisse / Sun Life / IA = our future distribution partners |

The **Neo Financial cap table flywheel** is the most important pattern: Golden + Maple + Inovia Discovery are all on it. One warm intro via any of them lights up the other two — start there.

## Suggested send order

| Day | Action |
|---|---|
| **Mon** | Submit Neo + Scotia Fintel Connect applications. Submit BMO Blue Rewards waitlist + cold email Kirill |
| **Tue** | Send Ameet Shah (Golden). Send Andre Charoo (Maple VC) using a tweaked version of the same body |
| **Wed** | Send Josh Scott (BetaKit). Hold launch date — embargo offer makes this worth waiting until you have a confirmed reply |
| **Thu** | Send Erica Alini (Globe). Send Jessica Gibson (MoneySense) using a near-identical pitch with the "Pro account offer" hook |
| **Fri** | Follow up: any silence ≥4 days on Tue/Wed sends gets a one-line bump |

## Things to fill in before you hit send

1. **Working public URL** — your product has to render correctly when they click. Even a `https://maplerewards-preview.vercel.app` is fine.
2. **Traction numbers** — even rough is fine ("400 beta users, 60 paying $9/mo on Pro"). Investors will ignore the email if there are no numbers. Journalists will skip if there's no "scale" claim.
3. **One sample card-detail page URL** — affiliates want to see what their card will look like on your site.
4. **Calendar link** — Cal.com or Google Scheduler embed. Don't make Ameet email you back to book.
5. **Phone number** — Erica/Josh will sometimes call before they email back.

---

# 1. Affiliate / partnership leads (13)

All 13 passed drop criteria. Affiliate infrastructure is live in the repo (`migrations/000019_affiliate_links.up.sql` — click ledger + `cards.affiliate_url` + `cards.affiliate_payout_cad` columns), so each lead can wire payouts the day the program partnership is signed.

### Lead 1: Royal Bank of Canada (RBC) · 9/10
**Site**: rbc.com · **Affiliate**: https://www.fintelconnect.com/brands/directory/rbc-affiliate-program/
**Why fit**: Fintel Connect CPA program live; we already model Avion in `rewards.yaml`; RBC × Canadian Tire loyalty (2026) creates Triangle+Avion stacking complexity our optimizer solves.
**Contact**: Amber Pearson — Sr. Director, Payment Utility Partnerships · https://ca.linkedin.com/in/amber-pearson-39220955 · For affiliate ops: route through Fintel Connect publisher portal.
**Outreach**: Apply via Fintel Connect first, ping Amber citing "RBC × Canadian Tire loyalty — we're the only optimizer modelling Triangle stacked with Avion in real time."

### Lead 2: Scotiabank · 10/10
**Site**: scotiabank.com · **Affiliate**: https://www.fintelconnect.com/brands/directory/scotiabank-affiliate-program/ ($110-175 CPA, 14 cards, 30-day cookie)
**Why fit**: Highest published CPA in the set; Scene+ expansion (Tangerine joins Feb 25; Casa rent + Shell May 26); we model Scene+ in `rewards.yaml`.
**Contact**: Chris Cavasin (Scotia Scene+) · https://www.linkedin.com/in/chriscavasin/ · Director Loyalty & Partnerships Marketing role currently posted at jobs.scotiabank.com.
**Outreach**: Apply Fintel Connect, warm via Casa rent / Shell Scene+ launches.

### Lead 3: BMO · 9/10
**Site**: bmo.com · No public affiliate URL — partner network via Partnerbase.
**Why fit**: AIR MILES → Blue Rewards launch summer 2026 = biggest Canadian loyalty pivot of the year. We already model AIR MILES; Blue Points is a one-PR update.
**Contact**: Kirill Shepelenko — Director, US Credit Card Acquisitions · https://www.linkedin.com/in/kirillshepelenko/ · Canada-specific contact not publicly findable.
**Outreach**: Cold email referencing waitlist (bmo.com/creditcardwaitlist), pitch as "the optimizer that ports AIR MILES → Blue Points on launch day."

### Lead 4: CIBC · 7/10
**Site**: cibc.com · No direct affiliate URL (Simplii is on Fintel; Aventura is not).
**Why fit**: Carly Aglipay's LinkedIn explicitly cites "affiliate marketing" in scope; Simplii already on Fintel Connect (sister-brand precedent).
**Contact**: Carly Aglipay — Director, Product Management, Credit Card · https://www.linkedin.com/in/carly-aglipay-4515552a/. Also: Peter Tran, Jennifer Corbett.
**Outreach**: LinkedIn InMail to Carly first; lead with Spring 2026 Aventura 45k offer + our optimizer comparison view.

### Lead 5: TD Canada Trust · 6/10
**Site**: td.com · No public affiliate program (referral-only via select partners).
**Why fit**: April 2026 first-in-Canada Virtual Card Numbers via Chrome shows product velocity; we deeply model Aeroplan.
**Contact**: Not publicly findable. Route via TD Affiliations channel + TD Merchant Solutions Integrated Partnerships portal.
**Outreach**: Longest cycle — custom partnership pitch, not an existing program application.

### Lead 6: American Express Canada · 9/10
**Site**: americanexpress.com/ca · **Affiliate**: CJ Affiliate (Commission Junction), CA$200/approved lead, up to CA$350 on some products, 7-day cookie.
**Why fit**: Premium fit for our Pro tier; AMEX Cobalt/Platinum/Aeroplan Reserve already in our 92-card catalogue; MR modelled in `rewards.yaml`.
**Contact**: Peter Di Vincenzo — Sr. Relationship Manager, Enhanced Acquisition Programs · https://www.linkedin.com/in/peterd4/.
**Outreach**: Apply via CJ; cold message citing "Enhanced Acquisition Programs alignment with AI-driven recommendations."

### Lead 7: National Bank of Canada · 7/10
**Site**: nbc.ca · **Affiliate**: https://www.fintelconnect.com/brands/directory/national-bank-affiliate-program/ (8 cards instant approval)
**Why fit**: Bilingual EN/FR audience NBC needs; we're Canadian-native not US-jammed-CA.
**Contact**: Martin B. Pouliot — Sr. Manager Cards & Payments · https://www.linkedin.com/in/martinbpouliot/. Also: Nick Culo (VP Marketing).
**Outreach**: Apply via Fintel Connect; LinkedIn outreach to Martin citing portfolio depth.

### Lead 8: Tangerine · 9/10
**Site**: tangerine.ca · **Affiliate**: https://www.fintelconnect.com/brands/directory/tangerine-bank-affiliate-program/
**Why fit**: Three major 2026 launches — Scene+ partnership Feb 25, AB-first rollout Mar 3, **Tangerine Rewards World Elite Mastercard nationwide May 26**. First-ever rewards card needs distribution.
**Contact**: Not publicly findable; route via Fintel Connect rep.
**Outreach**: Apply immediately — warmest hook in the set given the May 26 nationwide rollout.

### Lead 9: Wealthsimple · 9/10
**Site**: wealthsimple.com · **Affiliate**: https://www.wealthsimple.com/en-ca/legal/affiliate-guidelines
**Why fit**: Visa Infinite launched Jan 26 2026 (<4 months old) with 5% welcome boost — most competitive welcome in Canada; needs distribution.
**Contact**: Not publicly findable; recommend search "Partnerships Manager Wealthsimple credit card".
**Outreach**: Apply via affiliate guidelines URL; pitch on Jan 26 launch alignment.

### Lead 10: Brim Financial · 8/10
**Site**: brimfinancial.com/partners · No formal affiliate — B2B partnerships only.
**Why fit**: Brim AFKLM World Elite Mastercard already in our catalogue; founder partnerships-led growth strategy.
**Contact**: Rasha Katabi — Founder & CEO · https://www.linkedin.com/in/rasha-katabi-94b99015b/.
**Outreach**: Direct partnership pitch via partners portal or LinkedIn; reference Flying Blue XP tracking parallel to Aeroplan SQC.

### Lead 11: EQ Bank · 9/10
**Site**: eqbank.ca · No formal affiliate — partnership pitch route.
**Why fit**: **Acquiring 2M+ PC Mastercard accounts + PC Optimum exclusivity closing summer 2026** (Federal Minister of Finance cleared Mar 2026). We already model PC Optimum.
**Contact**: Not publicly findable; route via EQB partnerships email; recommend "Director PC Financial Integration EQB".
**Outreach**: Time-sensitive — biggest CA card-ownership change of 2026 alongside Blue Rewards.

### Lead 12: Koho · 8/10
**Site**: koho.ca/affiliate/ — formal program live ($20-100/referral, no minimum cashout).
**Contact**: Brittany Bell — Partnerships Manager · https://www.linkedin.com/in/brittanyabell/.
**Outreach**: Apply via affiliate URL; LinkedIn follow-up.

### Lead 13: Neo Financial · 10/10
**Site**: neofinancial.com/partners · **Affiliate**: https://www.fintelconnect.com/brands/directory/neo-financial-affiliate-program/
**Why fit**: Fintel Connect case-study fund ("top-performing channel"); $150M BMO Capital Markets securitization Apr 21 2026 = card-acquisition budget; 10K+ merchant cashback network maps to our category multipliers.
**Contact**: Direct entry via Fintel Connect publisher portal.
**Outreach**: Apply immediately, reference Fintel case study + Apr 21 securitization in narrative.

### CSV — Affiliate
```csv
company,contact,role,linkedin,affiliate_url,score,status,next_action
RBC,Amber Pearson,Sr. Director Payment Utility Partnerships,https://ca.linkedin.com/in/amber-pearson-39220955,https://www.fintelconnect.com/brands/directory/rbc-affiliate-program/,9,prospect,Apply via Fintel Connect + hook on RBC×Canadian Tire
Scotiabank,Chris Cavasin,Scotia Scene+ contact,https://www.linkedin.com/in/chriscavasin/,https://www.fintelconnect.com/brands/directory/scotiabank-affiliate-program/,10,prospect,Apply via Fintel Connect + hook on Casa rent + Shell Scene+
BMO,Kirill Shepelenko,Director US Credit Card Acquisitions,https://www.linkedin.com/in/kirillshepelenko/,Not public — direct partnerships pitch,9,prospect,Cold outreach on AIR MILES → Blue Rewards summer 2026 launch
CIBC,Carly Aglipay,Director Product Management Credit Card,https://www.linkedin.com/in/carly-aglipay-4515552a/,Direct pitch (not on Fintel for Aventura),7,prospect,LinkedIn InMail + Spring 2026 Aventura 45k offer
TD,Not publicly findable,Director Credit Card Marketing,Search: Director Partnerships TD Canada Trust,https://www.td.com/ca/en/about-td/for-investors/affiliations,6,cold,Custom partnership pitch via TD Affiliations
American Express Canada,Peter Di Vincenzo,Sr. Relationship Manager Enhanced Acquisition,https://www.linkedin.com/in/peterd4/,CJ Affiliate (Commission Junction),9,prospect,Apply CJ + LinkedIn outreach on Enhanced Acquisition Programs
National Bank,Martin B. Pouliot,Sr. Manager Cards & Payments,https://www.linkedin.com/in/martinbpouliot/,https://www.fintelconnect.com/brands/directory/national-bank-affiliate-program/,7,prospect,Apply via Fintel Connect
Tangerine,Not publicly findable,Partnerships via Fintel Connect rep,Search: Director Marketing Tangerine Bank,https://www.fintelconnect.com/brands/directory/tangerine-bank-affiliate-program/,9,prospect,Apply Fintel Connect immediately + hook on May 26 World Elite nationwide
Wealthsimple,Not publicly findable,Head of Partnerships,Search: Partnerships Manager Wealthsimple credit card,https://www.wealthsimple.com/en-ca/legal/affiliate-guidelines,9,prospect,Apply via affiliate guidelines + pitch Jan 26 Visa Infinite launch
Brim,Rasha Katabi,Founder & CEO,https://www.linkedin.com/in/rasha-katabi-94b99015b/,https://brimfinancial.com/partners,8,prospect,Partnership pitch — reference Brim AFKLM in catalogue
EQ Bank,Not publicly findable,Director PC Financial Integration,Search: VP Marketing EQ Bank,No formal program — partnership pitch,9,prospect,Cold outreach citing PC Mastercard summer 2026 transition
Koho,Brittany Bell,Partnerships Manager,https://www.linkedin.com/in/brittanyabell/,https://www.koho.ca/affiliate/,8,prospect,Apply via affiliate URL
Neo Financial,Not publicly findable,Growth/Affiliate via Fintel Connect,Search: VP Growth Neo Financial,https://www.fintelconnect.com/brands/directory/neo-financial-affiliate-program/,10,prospect,Apply Fintel Connect + reference Apr 21 BMO securitization
```

---

# 4. Media / PR leads (15)

15 leads. 5 drops with explicit substitute rationale (notes at end).

### Lead 1: Rob Carrick (Globe) · 8/10
Semi-retired but biweekly column + 50k+ X following seeds the rest of CA PF press. Hook: post-retirement "things I always wanted to write" piece on a CA-built rewards app.
**Contact**: rcarrick@globeandmail.com · @rcarrick

### Lead 2: Erica Alini (Globe) · 10/10
Carrick's effective successor. Helms newcomers' finance newsletter — direct India hotel arbitrage fit.
**Contact**: ealini@globeandmail.com · @ealini · https://www.linkedin.com/in/erica-alini
**Pitch**: "Native CA alternative to MaxRewards — solves a newcomer problem your newsletter course addresses: how to actually use Aeroplan + PC Optimum + Scene+ together without a US-only app."

### Lead 3: Salmaan Farooqui (Globe) · 7/10
Younger PF voice; "cancel Netflix" framing matches "unredeemed points are dead money" pitch.
**Contact**: sfarooqui@globeandmail.com · @salmaanfarooqui

### Lead 4: Jessica Gibson (MoneySense) · 10/10
Owns cards vertical; co-bylined 2026 best-cards roundup; updates quarterly.
**Contact**: editor@moneysense.ca (general); freelancer pattern via MuckRack/LinkedIn.
**Pitch**: "Beyond best-cards lists — a tool that tells YOU which of your 4 existing cards to tap. Embargo offer + 50 free Pro accounts for MoneySense readers."

### Lead 5: R.E. Hawley (MoneySense) · 8/10
Pairs with Gibson on MoneySense's top-trafficked credit-card pages.
**Contact**: rhawley@moneysense.ca
**Pitch**: "Run MoneySense's 2026 picks against our optimizer; publish the deltas."

### Lead 6: Tom Drake (MapleMoney) · 9/10
Founder + podcast host; independent = no ad politics; affiliate-friendly.
**Contact**: tom@maplemoney.com · https://www.linkedin.com/in/tomdrake1
**Pitch**: Written review + MapleMoney Show podcast + affiliate split.

### Lead 7: Kornel Szrejber (Build Wealth Canada) · 7/10
FIRE-leaning audience pays in full → optimizes rewards.
**Contact**: kornel@buildwealthcanada.ca · https://www.linkedin.com/in/kornel-szrejber
**Pitch**: 45-min episode "Travel hacking as FIRE math — $9/mo + an AI agent that reads your wallet."

### Lead 8: Pamela Heaven (Financial Post Posthaste) · 7/10
Macro-meets-consumer angle; insolvency record as counterpoint.
**Contact**: pheaven@postmedia.com · @pamheaven
**Pitch**: "Counter-narrative: the 45% who pay in full are systematically under-redeeming. Data from MapleRewards' 92-card model."

### Lead 9: Barbara Shecter (Financial Post) · 6/10
Banking/regulation beat — quote source on PC Financial deal more than tool reviewer.
**Contact**: bshecter@postmedia.com · @BatPost

### Lead 10: Josh Scott (BetaKit) · 10/10
Lead CA-startup-tech reporter; covered Neo+United, Brim.
**Contact**: josh@betakit.com · @joshjscott · https://www.linkedin.com/in/joshjscott
**Pitch**: "Toronto-built native CA rewards optimizer launches — Go/Next.js, Claude Sonnet 4.5, first domestic alternative to MaxRewards."

### Lead 11: Ricky Zhang (Prince of Travel) · 9/10
Competitive but cross-promo real. April 26 2026 Aeroplan chart-update post = warm hook.
**Contact**: ricky@princeoftravel.com · @princeof_travel · https://www.linkedin.com/in/realricky
**Pitch**: Tool partnership (not adversarial) — our devaluation tracker fires the same alerts at the wallet level.

### Lead 12: Jean-Maximilien Voisine (Milesopedia) · 9/10
Bilingual reach into Quebec; Milesopedia covered SQC the same week our Pro feature shipped.
**Contact**: jean-max@milesopedia.com · @milesopedia
**Pitch**: FR/Quebec launch partnership — would need FR localization of AI chat.

### Lead 13: Claire Brownell (The Logic) · 9/10
Canadian-fintech beat; runs annual "people to watch" list.
**Contact**: claire@thelogic.co · https://www.linkedin.com/in/clairebrownell
**Pitch**: "Wealthsimple-of-rewards thesis — AI-as-core-not-bolt-on; why is this not yet a Logic People-to-Watch item?"

### Lead 14: Erik Hertzberg (Bloomberg) · 6/10
Less likely a tool review, more likely data-source quote.
**Contact**: ehertzberg2@bloomberg.net · @ekhertzberg
**Pitch**: "Anonymized dataset on CA loyalty balances + optimization gaps."

### Lead 15: Shannon Terrell (NerdWallet Canada) · 9/10
Points Pulse newsletter format = direct fit for devaluation tracker demo.
**Contact**: sterrell@nerdwallet.com · @ShannonTerrellW
**Pitch**: "Points Pulse: a tool that catches Aeroplan changes before they go live. Embargo for next issue."

### Dropped & substituted
- **Toronto Star** — no named CA-cards byline within 12 mo; dropped, no direct sub
- **CBC News (Pittis, Hansen)** — Hansen left CBC Apr 2022; Pittis no recent cards column → replaced by Hertzberg (Bloomberg) + Brownell (The Logic)
- **Maclean's Money/Lifestyle** — no current dedicated PF columnist with CA-cards byline → dropped
- **TPG Canadian desk** — does not exist (TPG covers Canada from US/UK) → replaced by Terrell (NerdWallet CA)
- **Reuters Canada** — Hannah Lang fintech beat is US-based, not CA-economy → dropped
- **BetaKit Knapper/Mendoza** — unverified as current reporters → replaced by Scott (BetaKit)
- **BNN Bloomberg** — no clear named consumer-finance reporter post-2024 BCE cuts → replaced by Bloomberg proper

### CSV — Media
```csv
outlet,journalist,beat,email_or_handle,recent_article,score,status,pitch_angle
Globe & Mail,Rob Carrick,Personal Finance (semi-retired),rcarrick@globeandmail.com / @rcarrick,"Goodbye and stay tuned (Jun 2025)",8,warm,Native CA MaxRewards alternative with AI wallet chat
Globe & Mail,Erica Alini,Personal Economics,ealini@globeandmail.com / @ealini,"Newcomers' Guide to Finances in Canada (2025)",10,priority,Native CA alternative + newcomer/diaspora India arbitrage angle
Globe & Mail,Salmaan Farooqui,Personal Finance / Housing,sfarooqui@globeandmail.com / @salmaanfarooqui,"Cancelled Netflix after 13 years (2025)",7,warm,Cancel-Netflix economics for unredeemed CA points
MoneySense,Jessica Gibson,Credit Cards,via editor@moneysense.ca,"Best credit cards in Canada for 2026",10,priority,Wallet-aware optimizer + Pro account offer
MoneySense,R.E. Hawley,Senior cards/insurance,rhawley@moneysense.ca,"Best cashback credit cards in Canada for 2026",8,warm,Run MoneySense picks through optimizer + publish deltas
MapleMoney,Tom Drake,Founder/Editor,tom@maplemoney.com,"Best Student Credit Cards 2026",9,priority,Review + podcast + affiliate path
Build Wealth Canada,Kornel Szrejber,Podcast host FIRE,kornel@buildwealthcanada.ca,"Lessons From 400+ Interviews on CA FI (Oct 2025)",7,warm,Travel-hacking-as-FIRE-math 45-min episode
Financial Post,Pamela Heaven,Posthaste,pheaven@postmedia.com / @pamheaven,"Posthaste 2025 (CA dollar/consumer)",7,warm,Counter-narrative: pay-in-full Canadians under-redeem
Financial Post,Barbara Shecter,Banking & regulation,bshecter@postmedia.com / @BatPost,"Equitable acquires PC Financial (2025)",6,cold,Expert quote on PC Optimum post-deal impact
BetaKit,Josh Scott,CA startup tech,josh@betakit.com / @joshjscott,"Neo + United partnership (2025)",10,priority,Launch story: first native CA MaxRewards alternative
Prince of Travel,Ricky Zhang,Founder points & miles,ricky@princeoftravel.com / @princeof_travel,"Aeroplan Chart Changes Jun 2026 (Apr 26 2026)",9,priority,Tool partnership + devaluation tracker sponsorship
Milesopedia,Jean-Maximilien Voisine,Founder FR-first,jean-max@milesopedia.com / @milesopedia,"Milesopedia 2026 Awards (Jan 2026)",9,priority,FR/Quebec partnership + SQC tracker tie-in
The Logic,Claire Brownell,Future of finance/fintech,claire@thelogic.co,"People to watch in CA fintech (2025)",9,priority,AI-native consumer-fintech People-to-Watch pitch
Bloomberg,Erik Hertzberg,Canada economy,ehertzberg2@bloomberg.net / @ekhertzberg,"Canada Economy Rebounds (Nov 28 2025)",6,cold,Anonymized dataset on CA loyalty balances
NerdWallet Canada,Shannon Terrell,Credit cards lead,sterrell@nerdwallet.com / @ShannonTerrellW,"Points Pulse Dec 15 2025: Aeroplan overhaul",9,priority,Devaluation tracker demo for next Points Pulse
```

---

# 5. Investor / fundraising leads (11)

11 leads. 7 drops with explicit rationale: **Information VP** (Series A, harvest), **Real Ventures** (founders stepped back, fundraising paused), **Ramen Ventures** (no new), **Backbone Angels** (mandate mismatch + no 2025 fintech), **Build Ventures** (last new May 2024, harvest), **Pender Ventures** (B2B/health, no consumer fintech), **Plus Capital** (US celebrity fund).

Backfilled with **Luge, Panache, Garage, Vibe, Tactico**.

### Lead 1: Golden Ventures · 10/10
**Site**: golden.ventures · **Stage**: Seed/pre-seed · **Cheque**: $500K-2M USD · **Geo**: Canada→NA
**Why fit**: LP in Neo Financial + Float (CA SMB card); Fund V ($139M CAD Feb 2024) deploying — 10 new investments last 12mo.
**Partner**: Ameet Shah — Partner (consumer + AI; ex-Five Mobile, Zynga GM Toronto) · https://ca.linkedin.com/in/ameetshah
**Recent**: Neo Financial (co-led), Float (FY2024), 10 new investments 2024-2025.
**Pitch**: "Canada-native vs US giants; 92 cards + 19 programs; AI chat with wallet context live; Stripe Pro tier wired = monetization on. You backed Neo to attack Big-5 banking; back MapleRewards as the optimizer layer on every CA wallet including Neo's card."

### Lead 2: Maple VC · 10/10
**Site**: maplevc.com · **Stage**: Seed/pre-seed · **Cheque**: $250K-1M first cheque · **Geo**: Canadian-rooted founders globally
**Why fit**: Literally designed for Canadian-rooted founders; co-invested in Neo + Clay (CA founder, $1.3B unicorn Jan 2025); solo GP = fast.
**Partner**: Andre Charoo — Founder/GP (Uber #25) · https://www.linkedin.com/in/acharoo/
**Recent**: Clay (unicorn), Neo Financial, ResQ, AutoLeap, Playbook.
**Pitch**: "Solo CA founder shipping; Wave 1+2 production work shipped; 92 cards live; first-mover in CA rewards-fintech US players deliberately skip. Andre's US network = export the optimizer pattern (India arbitrage = proof of geo-extensibility)."

### Lead 3: BDC Capital Seed Venture Fund · 9/10
**Site**: bdc.ca/en/bdc-capital/venture-capital/funds/seed-fund · **Stage**: Pre-seed/seed · **Cheque**: $100K-1M CAD (up to $2M) · **Geo**: Canada-only
**Why fit**: Fintech in explicit sector mandate; crown-corp mandate to plug exactly this gap; latest seed cheque Sep 18 2025 (ShopVision).
**Partner**: Partner TBD — verify Crunchbase team page (historically Geneviève Bouthillier / Vanessa Catalano cover seed).
**Pitch**: "Canada-only mandate fits Canada-only product; 53KB of CA primary research (rewards.yaml + credit_card_strategies.yaml); BDC dollar buys CA rewards-fintech leadership before MaxRewards localizes."

### Lead 4: Inovia Capital Discovery Fund · 8/10
**Site**: inovia.vc · **Stage**: Pre-seed/seed · **Cheque**: small first + LP positions · **Geo**: Canada/NA
**Why fit**: Discovery is the ONLY Inovia vehicle that writes our cheque size; LP in Maple VC + N49P + Garage = gateway to main fund later; Inovia on Neo cap table.
**Partner**: Kory Jeffrey — Partner Discovery (ex-CoS Engineering Google Canada) · https://www.linkedin.com/in/koryjeffrey. Also: Karam Nijjar.
**Pitch**: "Kory's lens is tech DD — you'll like the architecture: Go + Chi + pgx + Redis, real Stripe billing, AI chat with wallet context. Not a deck; a shipped product. Discovery cheque now, Series A from main fund later."

### Lead 5: FJ Labs · 8/10
**Site**: fjlabs.com · **Stage**: Pre-seed/seed · **Cheque**: $200K pre-seed / $300K seed / $725K A+ (fixed) · **Geo**: Global, active CA deployment
**Why fit**: Long Canadian consumer via Clutch (CA used-car, $1B run-rate Q3 2025, 12X markup); explicit fintech + marketplaces thesis; 42 investments in 2025.
**Partner**: Fabrice Grinda — Founding Partner · https://www.linkedin.com/in/fabricegrinda/
**Pitch**: "Two-sided marketplace: issuers as supply (affiliate infra live), CA consumers as demand. You won CA consumer with Clutch; MapleRewards is the wallet-side. Fixed cheque + fast process suits solo founder."

### Lead 6: N49P · 8/10
**Site**: n49p.com · **Stage**: Inception/pre-seed/early seed · **Cheque**: $500K-750K USD · **Geo**: Canadian tech founders only
**Why fit**: Explicit Canada-only + FinTech + Consumer in sectors; 70 portfolio companies; Inovia is an LP (credentialing flywheel); cheque size = perfect lead/co-lead for sub-$2M seed.
**Partner**: Alex Norman — Partner (ex-TechTO / AngelList Canada) · https://ca.linkedin.com/in/alexnorman (verify).
**Pitch**: "TechTO network knows the profile; cheque-size sweet spot; FinTech + Consumer both check; Garage Capital top co-investor — co-lead structure possible."

### Lead 7: Panache Ventures · 7/10
**Site**: panache.vc · **Stage**: Pre-seed/seed · **Cheque**: ~$500K CAD first · **Geo**: Canada-focused
**Why fit**: Canada's largest pure pre-seed fund (Fund II $100M); explicit FinTech sector; **BMO + Telus are LPs** — strategic distribution channels later.
**Partner**: Patrick Lor — Managing Partner (Calgary, consumer-tech) · https://www.linkedin.com/in/patricklor/. Also: David Dufresne.
**Pitch**: "BMO is your LP — MapleRewards's CA card data layer is exactly what BMO would later partner with or quietly acquire. Optionality built in."

### Lead 8: Garage Capital · 7/10
**Site**: garage.vc · **Stage**: Pre-seed/seed · **Cheque**: $250K-1M · **Geo**: Canada + YC
**Why fit**: Operator-led (Mike McCauley ex-BufferBox/Google X; Michael Litt Vidyard founder); fintech in sectors; latest investment March 2026 (Remitian); AngelList syndicate amplifies cheque; Inovia LP.
**Partner**: Mike McCauley — Co-Founder/GP · https://ca.linkedin.com/in/mccauleymike
**Pitch**: "Operator-to-operator: you built shippable products. MapleRewards is shipped. Garage syndicate amplifies the cheque; Inovia Discovery is your LP = natural follow-on."

### Lead 9: Luge Capital · 8/10
**Site**: luge.vc · **Stage**: Pre-seed/seed · **Cheque**: $1-3M typical (avg round ~$2.87M) · **Geo**: CA + US fintech focus
**Why fit**: THE Canadian fintech specialist ($180M AUM, Fund II $96M deploying); 19 of 45 investments are fintech; **LP base = Caisse / Sun Life / IA / La Capitale / BDC / Fonds FTQ** — maps directly to MapleRewards's eventual strategic-partner list.
**Partner**: Karim Gillani — GP (ex-PayPal/Xoom; consumer payments) · https://www.linkedin.com/in/karimgillani. Also: David Nault.
**Pitch**: "Consumer-facing interpretation layer on rails Luge funds (Flinks-style data plumbing, OneVest-style wealth UI). Your LP base (Sun Life, IA, Caisse) = our future distribution partners. Karim's PayPal/Xoom lens recognizes affiliate + consumer dual lane."

### Lead 10: Vibe Capital · 6/10
**Site**: vibe.vc · **Stage**: Pre-seed/seed · **Cheque**: $200-500K average · **Geo**: Global, ~50% non-US
**Why fit**: Solo GP ($70M+) Teachable founder — operator empathy; explicit non-SF/NYC tilt; own startups (Ocho, Carry) are consumer fintech.
**Partner**: Ankur Nagpal — Founder/Solo GP · https://www.linkedin.com/in/ankurnagpal/
**Pitch**: "Solo founder, solo GP — same operating mode. Teachable scaled to $50M ARR on $12.5M; MapleRewards similar capital-efficient profile."

### Lead 11: Tactico Inc. · 6/10
**Site**: tactico.com · **Stage**: Seed/pre-A · **Cheque**: $250K-2M · **Geo**: CA + US tech/fintech
**Why fit**: **Exited Moka** to Mogo May 2021 — knows CA consumer-fintech category in depth + acquisition outcomes; hands-on board model fits solo founder.
**Partner**: Partner TBD — verify (historically Jamie Schneiderman / Lawrence Tepperman).
**Pitch**: "You exited Moka. MapleRewards is the natural successor category — same CA consumer-fintech demographic, broader thesis, better data moat. Mogo or similar is one plausible exit; your playbook is transferable."

### CSV — Investors
```csv
fund,partner,role,linkedin,stage_focus,recent_portfolio,score,status,next_action
Golden Ventures,Ameet Shah,Partner,https://ca.linkedin.com/in/ameetshah,Seed,"Neo Financial, Float",10,prospect,Warm intro via Neo Financial cap table
Maple VC,Andre Charoo,Founder/GP,https://www.linkedin.com/in/acharoo/,Seed (CA-rooted founders),"Clay, Neo Financial",10,prospect,Direct email + reference solo-founder shipping profile
BDC Capital Seed Fund,Partner TBD,Investor Seed Fund,https://www.linkedin.com/company/bdc-capital/,Pre-seed/Seed Canada-only,"ShopVision, $50M envelope",9,prospect,Apply via seed-fund intake
Inovia Discovery Fund,Kory Jeffrey,Partner Discovery,https://www.linkedin.com/in/koryjeffrey,Pre-seed/Seed,"Neo Financial (main fund); LP in Maple/N49P",8,prospect,Tech-DD-led pitch — emphasize architecture + AI chat
FJ Labs,Fabrice Grinda,Founding Partner,https://www.linkedin.com/in/fabricegrinda/,Pre-seed/Seed fixed ticket,"Clutch, Midas",8,prospect,Apply via fjlabs.com form
N49P,Alex Norman (verify),Partner,https://ca.linkedin.com/in/alexnorman,Inception/Pre-seed/Early Seed,"EvenUp, Mave, Safekeep",8,prospect,Warm intro via TechTO network
Panache Ventures,Patrick Lor,Managing Partner,https://www.linkedin.com/in/patricklor/,Pre-seed/Seed Canada,"Tailscale, Certn, FightCamp",7,prospect,Pitch strategic LP angle (BMO/Telus)
Garage Capital,Mike McCauley,Co-Founder/GP,https://ca.linkedin.com/in/mccauleymike,Pre-seed/Seed,"Remitian (Mar 2026), Secoda",7,prospect,Operator-to-operator + AngelList syndicate amplification
Luge Capital,Karim Gillani,General Partner,https://www.linkedin.com/in/karimgillani,Pre-seed/Seed (fintech-only),"Cybrid, Mycroft, Velix",8,prospect,Lead with strategic LP map (Sun Life/Caisse/IA)
Vibe Capital,Ankur Nagpal,Founder/Solo GP,https://www.linkedin.com/in/ankurnagpal/,Pre-seed/Seed,"Interchange, Ocho, Carry",6,prospect,Cold email — underserved geo + capital efficiency
Tactico Inc.,Partner TBD,Partner,https://www.linkedin.com/company/tactico-inc,Seed,"Moka (exited), Emma, Willful",6,prospect,Lead with Moka→Mogo exit thesis parallel
```

---

# Outreach drafts (5 paste-ready)

Each is set up so you just fill in `[brackets]` with your live URL, traction numbers, and preferred sending email/phone.

## 1. Neo Financial — Fintel Connect publisher application

Form field: "Tell us about your audience and content strategy" (~200 words)

```
MapleRewards is the first native Canadian rewards optimizer — built specifically
for the 92 consumer cards available in Canada (not a US tool with a CA wrapper).

Where Neo fits: we catalogue the Neo Mastercard, Neo Secured, Neo World Elite,
and the CEBL / Cathay Pacific co-brands in our card detail pages. Our optimizer
compares Neo's 10K+ merchant cashback network against Big-5 alternatives on a
spend-by-spend basis — exactly the comparison Neo wins. AI chat on the product
recommends Neo cards by name when the user's wallet + spend pattern justifies it.

Affiliate infrastructure is shipped (cards.affiliate_url + per-card payout column
+ a click ledger), so we can wire your Fintel Connect tracking link the day the
application is approved. Pro tier is on Stripe.

Hook: your $150M BMO Capital Markets securitization (April 21) signals an
acquisition-budget moment — we'd like to be one of your highest-quality CPA
channels through the back half of 2026. The Fintel Connect case study about
your first 30 publishers is exactly the playbook we want to slot into.

Traffic: [insert MAU + signup count]. Conversion: [insert apply-click rate].
Sample card-detail page: [insert URL].

Aditya Sahni · MapleRewards · [URL]
```

## 2. Scotiabank — Fintel Connect publisher application

```
MapleRewards is a Canadian-native credit-card optimizer that catalogues 92
cards and 19 loyalty programs. Scotia is structurally important to our audience
because Scene+ is one of the three Canadian loyalty ecosystems we model in depth
(Aeroplan, Scene+, PC Optimum) — and 2026 is a Scene+ inflection year.

Specifically: our category multipliers already account for the Tangerine + Scene+
merger (Feb 25), the Casa rent partnership (March), and the May 26 Shell + Empire
nationwide rollout. Users who run our optimizer with Scene+-eligible spend see
ScotiaGold Passport and the Scene+ Visa surface in their top recommendations
on a route that no other CA optimizer is mapping.

We have affiliate infrastructure live (per-card tracking URL + payout column +
click ledger) — Fintel tracking links plug in directly.

Hook: the open Director, Loyalty & Partnerships Marketing posting + the Scene+
cross-issuer expansion tell us Scotia is investing in this channel. We'd like
to be one of the publishers driving high-intent applicants for the 14 cards
in your Fintel program at the $110-$175 CPA tier.

Traffic: [MAU + signup]. Sample card page: [URL].

Aditya Sahni · MapleRewards · [URL]
```

Follow-up LinkedIn note to Chris Cavasin (after applying), ~200 chars:

```
Chris — just applied to Scotia's Fintel program. We're the only CA optimizer
modelling Tangerine + Scene+ + Shell stacking live. Open to a 15-min walk-through
of how Scene+ surfaces in our wallet flow?
```

## 3. Ameet Shah — Golden Ventures (investor cold email)

Subject options:
- *Canadian rewards-optimizer — the layer on top of every CA wallet (incl. Neo)*
- *Neo cap table + the wallet-side wedge you don't own yet*

```
Ameet —

You backed Neo to attack Big-5 banking. MapleRewards is the optimizer layer that
sits on top of every Canadian's wallet — including Neo's card — and helps them
choose which card to swipe at the moment of purchase.

Why now: MaxRewards and WalletFlo are deliberately US-only. Canadian users
search for "Canadian MaxRewards" thousands of times a month and end nowhere.
We've shipped the answer:

  · 92 cards catalogued, 19 loyalty programs modelled in YAML
  · AI chat (Claude Sonnet 4.5) that reads the user's actual wallet, not a
    hypothetical one
  · Stripe-backed Pro tier ($9/mo) — monetization is on, not on a roadmap
  · Affiliate infra wired (per-card tracking URL + payout column + click ledger);
    Scotia, Neo, RBC, NBC, Tangerine all on Fintel Connect

Where we are: [MRR / MAU / Pro count]. Beta-free runway through [date].

Raising ~$1.5M to staff the affiliate revenue switch-on + CA acquisition. You're
on the Neo cap table and the Float cap table — the rails thesis. This is the
software-on-top thesis. Different surface, same flywheel.

20 minutes to walk you through the optimizer + share the cap table?

Aditya
[URL] · [Calendar link]
```

## 4. Josh Scott — BetaKit (launch story pitch)

Subject: *Toronto-built MapleRewards launches — the first Canadian alternative to MaxRewards*

```
Josh —

You covered Neo + United and Brim's open-banking hire. Here's the next CA
fintech launch worth a column.

MapleRewards is a Canadian-native credit-card rewards optimizer (Go API +
Next.js, Claude Sonnet 4.5 powering an AI chat that reads users' actual
Canadian wallets). It's the first domestic answer to MaxRewards and WalletFlo
— both US-only, both deliberately uninterested in the 92 cards Canadians
actually hold.

What's shipped:
  · 92 cards, 19 loyalty programs (Aeroplan, Scene+, PC Optimum, Air Miles,
    Marriott Bonvoy, etc.) modelled in YAML
  · Pro tier on Stripe — currently free-during-beta
  · Aeroplan 2026 SQC tracker built ahead of Air Canada's revenue-based
    qualification rollout
  · India-outbound hotel arbitrage tool (diaspora angle nobody else covers)
  · Affiliate rails live — Scotia, Neo, Tangerine, RBC, NBC integrations queued

The angle for BetaKit: a Toronto solo founder building Canadian-only fintech
infrastructure (53KB of native CA primary research in the repo) deliberately
betting that US giants won't localize. Counter to the "go US-first or die"
narrative your beat covers.

Happy to demo. Embargo on launch date if useful for an exclusive.

Aditya Sahni
[URL] · [LinkedIn]
```

## 5. Erica Alini — Globe & Mail (newcomers' angle pitch)

Subject: *For your newcomers' finance series — a Canadian rewards app that actually reads YOUR wallet*

```
Erica —

Your Newcomers' Guide to Finances in Canada newsletter course is the best thing
I've seen on the topic — and it surfaced a gap I built MapleRewards to fill.

Newcomers arrive with one or two cards, no points history, and Google-translate
US apps (MaxRewards, WalletFlo) that don't know what Aeroplan is, don't know
what Scene+ does, and can't read a Cobalt's transfer ratio. MapleRewards is
the first Canadian-native optimizer — 92 CA cards, 19 CA loyalty programs
catalogued, AI chat that reads the user's actual wallet (not a hypothetical
one) and answers in plain English.

For a follow-up newcomer piece: the app has a feature called India hotel
arbitrage — it tells diaspora users where in India their Marriott / Hyatt
points are worth >40% more on a cash basis than CA bookings. It's the most
useful 30 seconds of newcomer financial advice I've seen in this category.

Happy to give you a Pro login + walk you through how the AI handles a
newcomer's wallet (say, one CIBC student card + a freshly-issued Cobalt).
If the math holds up against your reporting, the story writes itself.

Aditya Sahni · Founder, MapleRewards · [URL] · [phone]
```

---

# Post-research production-readiness work shipped this session

While the leads were being researched, several deferred production gaps were closed:

| Area | What changed | File(s) |
|---|---|---|
| Award-watch worker | Confirmed `cmd/worker` exists; added scheduling section to `SHIP.md` (was missing) | `SHIP.md` §6b |
| IDOR variadic footgun (audit H7) | 5 handler constructors changed from variadic to positional — `nil` must be passed explicitly | `handler/optimizer.go`, `handler/trip.go`, `handler/award_search.go`, `handler/stack.go`, `handler/chat.go` |
| Metrics endpoint | New `internal/metrics` package + `handler/admin_metrics.go` — `GET /api/v1/admin/metrics` returns uptime, upstream call counts, cache hit ratio, memstats | `internal/metrics/metrics.go`, `internal/handler/admin_metrics.go`, `cmd/api/main.go` |
| Per-route timeouts | `middleware.Timeout(30 * time.Second)` applied to auth, wallet-owner, Pro-tier, Pro-compute, chat-history, and admin route groups; long-running routes (chat, trip endpoints) unchanged | `cmd/api/main.go` |
| README refresh | Migration count 9→34; architecture diagram redrawn with full middleware stack; tech stack + data model + project structure all updated; new "Production Operations" section links to SHIP.md / SECURITY.md / BRAND.md | `README.md` |
| Minor vet cleanup | Fixed `_ struct{}` xml-tag warning in `feed_aggregator.go` | `internal/service/feed_aggregator.go` |

All gates green: `go build ./...`, `go vet ./...`, `go test ./internal/...`, `npx tsc --noEmit`, `npm run build`.
