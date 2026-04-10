export interface Article {
  slug: string;
  title: string;
  excerpt: string;
  category: "guide" | "news" | "tip" | "card";
  readTime: number; // minutes
  date: string;    // ISO date
  emoji: string;
  tags: string[];
  body: string;    // full markdown content
  relatedCards?: string[]; // card names that relate to this article
}

export const ARTICLES: Article[] = [
  {
    slug: "amex-cobalt-best-grocery-card",
    title: "Why Amex Cobalt Is Canada's Best Grocery Card in 2025",
    excerpt:
      "At 5x on dining and groceries with a CPP that can hit 2\u00A2, the Amex Cobalt produces more rewards per grocery dollar than any other Canadian card \u2014 here's the full math.",
    category: "card",
    readTime: 5,
    date: "2025-09-12",
    emoji: "\uD83D\uDED2",
    tags: ["Amex Cobalt", "Groceries", "Amex MR"],
    relatedCards: ["Amex Cobalt Card", "Scotiabank Gold American Express", "CIBC Dividend Visa Infinite"],
    body: `## The Numbers That Matter

The Amex Cobalt earns **5x Membership Rewards points** on groceries and dining in Canada. With Amex MR points valued at roughly 1.8\u20132.0 cents per point (CPP) when transferred to Aeroplan, that translates to a **9\u201310% effective return** on every grocery dollar.

For context, most cashback cards top out at 2\u20134% on groceries.

## How the Math Works

Let's say you spend $600/month on groceries \u2014 a realistic number for a Canadian household:

- **Points earned**: $600 \u00D7 5x = 3,000 MR points/month
- **Annual points**: 36,000 MR points
- **Value at 1.8\u00A2 CPP**: $648 in annual rewards value
- **Minus annual fee**: $648 \u2013 $156 = **$492 net value**

Compare that to a 2% cashback card: $600 \u00D7 12 months \u00D7 2% = $144.

The Cobalt earns **3.4\u00D7 more** on groceries alone.

## Where to Transfer for Maximum Value

The real power of Amex MR comes from transfers. Your best options:

1. **Aeroplan** \u2014 1.8\u20132.5\u00A2 CPP on flights, especially premium cabins
2. **Marriott Bonvoy** \u2014 1:1.2 ratio, solid for hotel stays in off-peak properties
3. **Avios (British Airways)** \u2014 Great for short-haul flights within North America

## The Catch

Amex acceptance in Canada has improved dramatically, but some smaller grocery stores still don't take it. If your main grocery store doesn't accept Amex, consider pairing the Cobalt with a Visa or Mastercard backup for those purchases.

## Bottom Line

If you buy groceries in Canada and your store accepts Amex, the Cobalt is the single highest-earning card for that category. The $13.08/month fee pays for itself after roughly $145/month in grocery spending.`,
  },
  {
    slug: "aeroplan-sweet-spots-2025",
    title: "Top 5 Aeroplan Sweet Spots in 2025",
    excerpt:
      "Business class to Japan for 55,000 points? Europe in economy for 35,000? These Aeroplan redemptions give you 3\u20135\u00A2 per point \u2014 the best in Canada.",
    category: "guide",
    readTime: 7,
    date: "2025-10-03",
    emoji: "\u2708\uFE0F",
    tags: ["Aeroplan", "Air Canada", "Business Class"],
    relatedCards: ["TD Aeroplan Visa Infinite", "Amex Cobalt Card", "CIBC Aeroplan Visa Infinite"],
    body: `## Why Aeroplan Is Canada's Best Loyalty Program

Aeroplan offers some of the highest-value redemptions available to Canadian travellers. While the base CPP sits around 1.5\u00A2, these sweet spot routes deliver 3\u20135\u00A2 per point.

## Sweet Spot #1: Canada \u2192 Japan in Business Class

- **Points required**: 55,000\u201375,000 one-way (depending on availability)
- **Cash price equivalent**: $3,000\u2013$5,000 one-way
- **Effective CPP**: 4.0\u20136.0\u00A2
- **How to book**: Search on Aeroplan.com for ANA or Air Canada direct flights from YVR/YYZ

This is arguably the single best redemption in the Aeroplan chart. ANA\u2019s business class product is world-class.

## Sweet Spot #2: Canada \u2192 Europe in Economy

- **Points required**: 30,000\u201345,000 round-trip
- **Cash price equivalent**: $800\u2013$1,200
- **Effective CPP**: 2.5\u20133.5\u00A2
- **How to book**: Look for Air Canada or Lufthansa availability in off-peak months

## Sweet Spot #3: Short-Haul North America in Business

- **Points required**: 25,000 round-trip
- **Cash price equivalent**: $600\u2013$1,000
- **Effective CPP**: 2.5\u20134.0\u00A2
- **How to book**: Domestic routes like YYZ\u2192YVR or cross-border to major US cities

## Sweet Spot #4: Canada \u2192 Australia/New Zealand in Premium Economy

- **Points required**: 60,000\u201380,000 one-way
- **Cash price equivalent**: $2,500\u2013$4,000
- **Effective CPP**: 3.5\u20135.0\u00A2
- **How to book**: Route through EVA Air or ANA via Asia

## Sweet Spot #5: Mini RTW (Round-the-World) Bookings

Aeroplan allows complex routings with up to 2 stopovers. A creative YYZ \u2192 Europe \u2192 Asia \u2192 YYZ route can deliver incredible value at 80,000\u2013115,000 points.

## How to Find Award Space

Use Aeroplan.com\u2019s flexible date search. Best availability is typically 330+ days out or within 2 weeks of departure. Star Alliance partners open more seats during off-peak seasons.`,
  },
  {
    slug: "transfer-partners-explained",
    title: "Transfer Partners Explained: How to 3\u00D7 Your Points Value",
    excerpt:
      "Most Canadians redeem points at 1\u00A2. By transferring to airline partners, you can extract 2\u20135\u00D7 more value. Here's a beginner-friendly breakdown.",
    category: "guide",
    readTime: 6,
    date: "2025-08-20",
    emoji: "\uD83D\uDD04",
    tags: ["Transfer Partners", "Aeroplan", "Avios"],
    relatedCards: ["Amex Cobalt Card", "Amex Gold Rewards Card", "TD Aeroplan Visa Infinite"],
    body: `## What Are Transfer Partners?

When you earn points with a flexible rewards program (like Amex MR, RBC Avion, or TD Points), you typically have two options:

1. **Redeem directly** \u2014 book through the bank\u2019s travel portal at ~1\u00A2 per point
2. **Transfer to partners** \u2014 move points to an airline or hotel loyalty program at better rates

Option 2 is almost always better.

## The Major Transfer Programs in Canada

### Amex Membership Rewards
- **Aeroplan**: 1:1 ratio \u2014 best all-around transfer for Canadians
- **Marriott Bonvoy**: 1:1.2 ratio \u2014 solid for hotel redemptions
- **British Airways Avios**: 1:1 \u2014 great for short-haul flights
- **Hilton Honors**: 1:2 \u2014 reasonable, but Hilton points are worth less

### RBC Avion
- **WestJet Rewards**: 1:1 conversion
- **British Airways Avios**: 100:70 ratio
- **Cathay Pacific Asia Miles**: 100:70 ratio

### TD Rewards
- **Aeroplan**: Direct earn on Aeroplan-branded cards
- **Expedia for TD**: Fixed-value redemptions at ~0.8\u00A2 (avoid this)

## How to Calculate Value

The formula is simple:

**Value = (Cash Price of Flight or Hotel) \u00F7 (Points Required)**

If a flight costs $500 and requires 25,000 Aeroplan points, your CPP = $500 \u00F7 25,000 = **2.0\u00A2 per point**.

Compare that to booking the same flight through Amex Travel at 1\u00A2/point \u2014 you\u2019d need 50,000 points. Transfer = 2\u00D7 better value.

## When NOT to Transfer

- If you need cashback for immediate expenses
- If the transfer ratio is worse than 1:1
- If there\u2019s no award availability for your dates
- If the cash fare is already cheap (under $200)

## Pro Tip

Always check award availability BEFORE transferring. Transfers are usually instant but irreversible. Search on the partner airline\u2019s site first, confirm seats exist, then initiate the transfer.`,
  },
  {
    slug: "no-fee-cards-2025",
    title: "Best No-Fee Credit Cards in Canada for 2025",
    excerpt:
      "Don't want to pay an annual fee? These cards still earn solid rewards \u2014 the Tangerine Cashback and Simplii Visa offer 2\u20134% in top categories.",
    category: "guide",
    readTime: 4,
    date: "2025-11-01",
    emoji: "\uD83D\uDCB8",
    tags: ["No Annual Fee", "Cashback"],
    relatedCards: ["Tangerine Money-Back Credit Card", "Simplii Financial Visa", "CIBC Dividend Visa"],
    body: `## No Fee \u2260 No Value

A common misconception is that you need to pay a hefty annual fee to earn good rewards. While premium cards generally earn more, several no-fee cards in Canada deliver strong returns in specific categories.

## Top Picks

### 1. Tangerine Money-Back Credit Card
- **Earn rate**: 2% in 2 categories of your choice (3 with a Tangerine savings account)
- **Best for**: Customizable cashback \u2014 pick grocery, gas, recurring bills, or any other category
- **Network**: Mastercard
- **Bonus**: No minimum income requirement

### 2. Simplii Financial Cash Back Visa
- **Earn rate**: 4% on restaurants, 1.5% on groceries, 3% on gas & drug stores
- **Best for**: Dining-heavy spenders who don\u2019t want to pay for the Amex Cobalt
- **Network**: Visa
- **Catch**: Must have a Simplii chequing account

### 3. CIBC Dividend Visa
- **Earn rate**: 1% on all purchases, 2% on grocery and gas
- **Best for**: A simple, no-fuss everyday card
- **Network**: Visa

### 4. PC Financial Mastercard
- **Earn rate**: 10\u201325 PC Optimum points per dollar (varies by store)
- **Best for**: Loblaw shoppers (Superstore, No Frills, Shoppers Drug Mart)
- **Network**: Mastercard
- **Bonus**: Double points at Shoppers on Saturdays

## When to Go No-Fee

No-fee cards make sense when:
- Your annual spending is under $15,000 (premium cards may not break even)
- You prefer cashback over points complexity
- You need a secondary card for categories your main card doesn\u2019t cover
- You\u2019re building credit history

## The Math Test

Before committing to a fee card, calculate: would the extra rewards earn more than the fee? If you\u2019d earn $300 with a $120-fee card vs $180 with a no-fee card, the net difference is only $60. That premium card might not be worth it.`,
  },
  {
    slug: "cpp-explained",
    title: "What Is CPP? (And Why It Determines Your Real Rewards Value)",
    excerpt:
      "Cents Per Point is the single most important number in Canadian points optimization. Here's how to calculate it and why 1.5\u00A2 vs 0.8\u00A2 can be a $400 difference.",
    category: "tip",
    readTime: 3,
    date: "2025-07-15",
    emoji: "\uD83D\uDCD0",
    tags: ["CPP", "Beginner", "Points Value"],
    relatedCards: ["TD Aeroplan Visa Infinite", "Amex Cobalt Card"],
    body: `## CPP in 30 Seconds

CPP stands for **Cents Per Point**. It measures how much real-world value you get from each loyalty point when you redeem it.

**Formula**: CPP = (Dollar Value of Redemption) \u00F7 (Points Used) \u00D7 100

If you book a $500 flight using 25,000 Aeroplan points:
CPP = $500 \u00F7 25,000 \u00D7 100 = **2.0\u00A2 per point**

## Why CPP Matters

Not all point redemptions are equal. The same 50,000 Aeroplan points could be worth:
- **$500** if redeemed for gift cards (1.0\u00A2 CPP)
- **$750** if redeemed for economy flights (1.5\u00A2 CPP)
- **$1,500+** if redeemed for business class (3.0\u00A2+ CPP)

That\u2019s a **$1,000 difference** in value from the same number of points.

## CPP Benchmarks for Canadian Programs

| Program | Base CPP | Sweet Spot CPP |
|---------|----------|----------------|
| Aeroplan | 1.5\u00A2 | 2.5\u20135.0\u00A2 |
| Amex MR | 1.0\u00A2 | 1.8\u20132.5\u00A2 (via transfer) |
| Scene+ | 1.0\u00A2 | 1.0\u20131.2\u00A2 |
| PC Optimum | 0.8\u00A2 | 1.0\u00A2 (on promo days) |
| RBC Avion | 1.0\u00A2 | 1.5\u20132.0\u00A2 |

## How to Use CPP

1. **Compare cards**: A card earning 3x points at 1.5\u00A2 CPP (4.5% return) beats a card earning 5x points at 0.8\u00A2 CPP (4.0% return)
2. **Choose redemptions**: Always check the CPP before redeeming. If CPP is below the program\u2019s baseline, look for better options
3. **Set minimums**: Never redeem Aeroplan below 1.5\u00A2 or Amex MR below 1.0\u00A2

## Common CPP Traps

- **Merchandise redemptions**: Usually 0.5\u20130.7\u00A2 CPP \u2014 almost always terrible
- **Statement credits**: Usually 0.7\u20131.0\u00A2 \u2014 acceptable only when you need immediate cash
- **Gift cards**: Usually 0.8\u20131.0\u00A2 \u2014 better than merchandise, worse than travel`,
  },
  {
    slug: "two-card-stack-canada",
    title: "The Ultimate 2-Card Stack for Canadian Earners",
    excerpt:
      "Amex Cobalt for groceries & dining (5x) + TD Aeroplan Infinite for gas & travel (3x). Together these two cards cover nearly every spend category above 2x.",
    category: "tip",
    readTime: 5,
    date: "2025-09-28",
    emoji: "\uD83C\uDCCF",
    tags: ["Card Stack", "Amex Cobalt", "TD Aeroplan"],
    relatedCards: ["Amex Cobalt Card", "TD Aeroplan Visa Infinite", "Tangerine Money-Back Credit Card"],
    body: `## The Problem

Most Canadians carry one or two cards and use whichever is handy. This means they earn the base rate (often 1x) on most purchases, leaving significant rewards on the table.

## The 2-Card Solution

By strategically pairing two complementary cards, you can earn **3\u20135x points** on 80%+ of your spending. Here\u2019s the best combination:

### Card 1: Amex Cobalt ($156/year)
- **5x** on groceries and dining
- **3x** on streaming
- **2x** on transit
- **1x** everything else

### Card 2: TD Aeroplan Visa Infinite ($139/year)
- **3x** on gas and Air Canada purchases
- **1.5x** on all other purchases
- No foreign transaction fees on some variants

## How to Use Them

| Category | Card to Use | Earn Rate |
|----------|-------------|-----------|
| Groceries | Amex Cobalt | 5x |
| Restaurants | Amex Cobalt | 5x |
| Streaming | Amex Cobalt | 3x |
| Transit | Amex Cobalt | 2x |
| Gas | TD Aeroplan | 3x |
| Travel | TD Aeroplan | 3x |
| Everything else | TD Aeroplan | 1.5x |

## Annual Value Estimate

For a household spending $5,000/mo:

| Category | Monthly Spend | Points Earned |
|----------|--------------|---------------|
| Groceries | $800 | 4,000 MR |
| Dining | $400 | 2,000 MR |
| Gas | $200 | 600 Aeroplan |
| Travel | $300 | 900 Aeroplan |
| Everything else | $3,300 | 4,950 Aeroplan |

**Annual total**: ~72,000 MR + ~76,000 Aeroplan \u2248 **$2,300+ in value** (at optimal redemptions)

That\u2019s a **net return of $2,005** after subtracting $295 in total annual fees.

## Budget Alternative

If you want to skip annual fees, pair:
- **Tangerine Money-Back** (2% on 3 chosen categories)
- **Simplii Cash Back Visa** (4% restaurants, 1.5% groceries)

Lower total return, but zero cost.`,
  },
  {
    slug: "welcome-bonus-strategy",
    title: "How to Maximize Welcome Bonuses Without Overspending",
    excerpt:
      "Welcome bonuses are the single fastest way to accumulate points. Here's a month-by-month strategy to hit minimum spends using regular expenses.",
    category: "tip",
    readTime: 4,
    date: "2025-10-18",
    emoji: "\uD83C\uDF81",
    tags: ["Welcome Bonus", "Strategy"],
    relatedCards: ["Amex Cobalt Card", "TD Aeroplan Visa Infinite", "Scotiabank Passport Visa Infinite"],
    body: `## Why Welcome Bonuses Matter

Welcome bonuses (or sign-up bonuses) offer a huge one-time reward when you meet a spending threshold within a set period. A typical offer:

> Earn **60,000 bonus Aeroplan points** when you spend $3,000 in the first 3 months.

At 1.8\u00A2 CPP, that\u2019s **$1,080 in value** \u2014 more than most people earn from regular spending in an entire year.

## The Month-by-Month Approach

The key is to **redirect existing spending**, not create new expenses.

### Month 1: Essentials
- Switch all recurring bills to the new card (phone, internet, insurance, streaming)
- Use for all groceries and fuel
- **Target**: $800\u2013$1,200 from regular spending

### Month 2: Pre-Purchases
- Buy gift cards for stores you\u2019ll visit anyway (Amazon, gas stations, coffee shops)
- Prepay annual subscriptions that are due soon
- Stock up on household items you\u2019ll eventually need
- **Target**: $800\u2013$1,200

### Month 3: Final Push
- If close to the target, consider paying insurance premiums or utility bills quarterly
- Load transit passes or parking cards
- **Target**: Remaining balance

## What NOT to Do

- **Don\u2019t** buy things you don\u2019t need just to hit the minimum
- **Don\u2019t** forget about the deadline \u2014 use Maple\u2019s milestone tracker
- **Don\u2019t** carry a balance \u2014 interest charges will wipe out your bonus value
- **Don\u2019t** apply for too many cards at once (hurts credit score)

## Stacking Bonuses Strategically

Apply for one card at a time, spaced 3\u20134 months apart. This way:
- Each card gets your full spending for 3 months
- Your credit score recovers between applications
- You build a wallet of high-earning cards over 12\u201318 months

## Use the Milestones Tracker

Maple\u2019s milestone tracker shows your real-time progress toward each welcome bonus. You\u2019ll see exactly how much you need to spend and how many days are left \u2014 no guessing.`,
  },
  {
    slug: "scotiabank-passport-foreign-travel",
    title: "Scotiabank Passport Visa Infinite: Best Card for International Travelers",
    excerpt:
      "No foreign transaction fees + Priority Pass lounge access + Scene+ Points on travel. Why this card belongs in every Canadian traveler\u2019s wallet.",
    category: "card",
    readTime: 4,
    date: "2025-11-10",
    emoji: "\uD83C\uDF0D",
    tags: ["Scotiabank", "No FX Fees", "Travel", "Lounge Access"],
    relatedCards: ["Scotiabank Passport Visa Infinite", "HSBC World Elite Mastercard", "Amex Cobalt Card"],
    body: `## The FX Fee Problem

Most Canadian credit cards charge a **2.5% foreign transaction fee** on purchases made in non-CAD currencies. On a $5,000 international trip, that\u2019s **$125 in hidden fees**.

The Scotiabank Passport Visa Infinite charges **0%**.

## Key Benefits

### No Foreign Transaction Fees
Every dollar spent abroad saves you 2.5%. This alone justifies carrying this card internationally.

### Scene+ Points
- **3x** on dining, entertainment, and transit
- **2x** on groceries and recurring bills
- **1x** everything else

Scene+ points are worth approximately 1.0\u00A2 each, which makes this a solid 2\u20133% card in bonus categories.

### Priority Pass Lounge Access
Included with the card \u2014 access 1,300+ airport lounges worldwide. A single lounge visit is typically worth $40\u201360, so 2\u20133 visits per year covers the annual fee.

### Travel Insurance
- Trip cancellation and interruption
- Emergency medical ($2M coverage)
- Baggage delay/loss
- Rental car collision coverage

## When to Use It

| Situation | Use Passport? |
|-----------|---------------|
| Any purchase outside Canada | Yes \u2014 always |
| Dining in Canada | Yes \u2014 3x Scene+ |
| Groceries in Canada | Maybe \u2014 2x is decent, but Cobalt\u2019s 5x is better |
| Everything else in Canada | Probably not \u2014 1x is below average |

## The Verdict

This isn\u2019t your everyday card. It\u2019s your **travel card**. Use it for every international purchase and for dining at home. Pair it with the Amex Cobalt for groceries and the TD Aeroplan for domestic travel to build a complete wallet.

**Annual fee**: $150 \u2014 easily justified by FX savings and lounge access if you travel once internationally per year.`,
  },
  {
    slug: "hotel-points-maximization",
    title: "Hotel Points: How to Get Free Nights Without Paying Premium Prices",
    excerpt:
      "Marriott Bonvoy and Hilton Honors offer some of the best value for Canadian points collectors. Here\u2019s how to earn and redeem hotel points strategically.",
    category: "guide",
    readTime: 5,
    date: "2025-12-05",
    emoji: "\uD83C\uDFE8",
    tags: ["Hotels", "Marriott Bonvoy", "Hilton"],
    relatedCards: ["Amex Cobalt Card", "Amex Gold Rewards Card", "Marriott Bonvoy Amex"],
    body: `## The Hotel Points Landscape in Canada

Unlike airlines, hotel loyalty programs in Canada are accessible primarily through Amex transfer partnerships and co-branded hotel cards. The two major programs worth focusing on are Marriott Bonvoy and Hilton Honors.

## Marriott Bonvoy

### How to Earn
- **Marriott Bonvoy Amex Card**: Earn Bonvoy points directly on all purchases
- **Amex MR Transfer**: 1,000 MR \u2192 1,200 Bonvoy (1:1.2 ratio)
- **Hotel stays**: 10\u201317.5x per dollar at Marriott properties (based on status)

### Best Redemption Value
- **Off-peak Category 1\u20133 properties**: 7,500\u201320,000 points/night for hotels that cost $150\u2013300
- **5th Night Free**: Book 4 nights on points, get the 5th free (20% savings)
- **Point + Cash**: Split the cost when you don\u2019t have enough points

### CPP Range
- Base: 0.7\u20130.9\u00A2 per point
- Sweet spots: 1.0\u20131.5\u00A2 at premium properties during peak dates

## Hilton Honors

### How to Earn
- **Amex MR Transfer**: 1,000 MR \u2192 2,000 Hilton (1:2 ratio)
- **Hilton stays**: Base earning varies by status tier

### Best Redemption Value
- **Standard room rewards**: Fixed pricing per property
- **5th Night Free**: Same deal as Marriott \u2014 20% savings on 5-night stays

### CPP Range
- Base: 0.4\u20130.5\u00A2 per point
- Sweet spots: 0.6\u20130.8\u00A2 at resorts during holidays

## Strategy: When to Use Points vs Cash

Use points when:
- The cash rate is high (peak season, popular destinations)
- You\u2019re getting above-average CPP
- You have points expiring soon

Pay cash when:
- The rate is low (off-season, promotions)
- You have elite status that earns points on paid stays
- You need to qualify for status (paid nights count, award nights don\u2019t always)

## The Transfer Timing Trick

Amex MR \u2192 Marriott transfers are instant. This means you can search for award availability first, confirm the room, then transfer exactly the points you need. Never transfer speculatively.`,
  },
  {
    slug: "credit-score-myths",
    title: "Credit Score Myths Debunked: What Actually Happens When You Apply for Cards",
    excerpt:
      "Worried about your credit score? Multiple applications, hard pulls, and credit utilization \u2014 here\u2019s what the data actually says about churning cards in Canada.",
    category: "tip",
    readTime: 4,
    date: "2025-12-15",
    emoji: "\uD83D\uDCC8",
    tags: ["Credit Score", "Beginner", "Strategy"],
    body: `## The Fear

Many Canadians avoid applying for new credit cards because they believe it will ruin their credit score. The reality is more nuanced.

## What a Hard Pull Actually Does

When you apply for a credit card, the issuer performs a \u201Chard inquiry\u201D on your credit report. This typically:

- **Drops your score by 5\u201310 points** temporarily
- **Falls off after 6\u201312 months** (varies by bureau)
- **Has zero impact after 2 years**

For context, most credit scores range from 300\u2013900. A 5-point dip on a 780 score is negligible.

## The Factors That Actually Matter

Your credit score is based on 5 factors (in order of importance):

1. **Payment history (35%)** \u2014 Always pay on time. This is the single biggest factor.
2. **Credit utilization (30%)** \u2014 Keep balances below 30% of your limit. Below 10% is ideal.
3. **Length of credit history (15%)** \u2014 Keep your oldest card open, even if you rarely use it.
4. **Credit mix (10%)** \u2014 Having different types of credit (cards, loans) helps.
5. **New credit inquiries (10%)** \u2014 This is where card applications show up.

Notice: new inquiries are only **10% of your score**. And within that 10%, a single inquiry has a small effect.

## The Paradox of More Cards

Opening new cards can actually **improve** your score over time:
- **Lower utilization**: More total credit limit = lower overall utilization ratio
- **Better credit mix**: More active accounts in good standing
- **Higher average limit**: Shows lenders you\u2019re trusted with larger limits

## Smart Application Strategy

1. Space applications 3\u20134 months apart
2. Apply for cards from different issuers (each pulls from the same bureau)
3. Never apply when you\u2019re about to apply for a mortgage or car loan
4. Keep old cards open (request product switches instead of closing)

## The Bottom Line

If your score is 700+, applying for 2\u20133 cards per year will have a minimal long-term impact. The rewards value far outweighs the temporary score dip.`,
  },
  {
    slug: "best-cards-for-gas",
    title: "Best Credit Cards for Gas in Canada: 2025 Rankings",
    excerpt:
      "With gas prices still elevated, picking the right card at the pump matters more than ever. Here are the cards that earn 3\u20135% back on fuel purchases.",
    category: "card",
    readTime: 4,
    date: "2026-01-10",
    emoji: "\u26FD",
    tags: ["Gas", "Fuel", "Cashback", "Card Rankings"],
    relatedCards: ["CIBC Dividend Visa Infinite", "TD Aeroplan Visa Infinite", "Canadian Tire Triangle Mastercard"],
    body: `## Why Gas Matters

The average Canadian household spends $2,400\u2013$3,600 per year on gas. At 1% cashback, that\u2019s only $24\u201336. At 4\u20135%, it\u2019s $96\u2013$180 \u2014 a real difference.

## Top Gas Cards

### 1. CIBC Dividend Visa Infinite
- **Earn rate**: 4% on gas and grocery
- **Annual fee**: $120
- **Best for**: High-volume drivers who also shop at groceries
- **Net value on gas**: At $250/month, earns $120/year on gas alone \u2014 covers the fee

### 2. TD Aeroplan Visa Infinite
- **Earn rate**: 3x Aeroplan on gas
- **Annual fee**: $139
- **Best for**: Points collectors who want Aeroplan integration
- **Net value on gas**: 3x points at 1.8\u00A2 CPP = 5.4% effective return

### 3. Canadian Tire Triangle Mastercard (No Fee)
- **Earn rate**: 4\u00A2 per litre at Canadian Tire Gas+, 3% at Sport Chek
- **Annual fee**: $0
- **Best for**: Drivers who fill up at Canadian Tire stations
- **Catch**: Canadian Tire Money has limited redemption flexibility

### 4. Tangerine Money-Back
- **Earn rate**: 2% in your chosen category (select gas)
- **Annual fee**: $0
- **Best for**: Budget-conscious drivers who don\u2019t want a fee

## The Costco Question

If you have a Costco membership, the **Capital One Costco Mastercard** earns 3% at Costco Gas (which is already the cheapest fuel option). It\u2019s a no-fee card bundled with your membership, making it an excellent default gas card.

## Quick Math

| Card | Rate on Gas | Annual Value ($250/mo) | Fee | Net |
|------|-------------|----------------------|-----|-----|
| CIBC Dividend Infinite | 4% | $120 | $120 | $0 |
| TD Aeroplan Infinite | ~5.4% | $162 | $139 | +$23 |
| Triangle MC | ~3\u20134% | $90\u2013120 | $0 | +$90\u2013120 |
| Tangerine | 2% | $60 | $0 | +$60 |

The TD Aeroplan wins on pure value per dollar, but the Triangle card wins on **net** value (no fee).`,
  },
  {
    slug: "amex-vs-visa-acceptance",
    title: "Amex Acceptance in Canada: The 2025 Reality Check",
    excerpt:
      "The biggest concern about Amex cards is acceptance. Is it still an issue in 2025? We mapped 10,000+ Canadian merchants to find out.",
    category: "news",
    readTime: 3,
    date: "2026-02-01",
    emoji: "\uD83D\uDCB3",
    tags: ["Amex", "Visa", "Mastercard", "Acceptance"],
    relatedCards: ["Amex Cobalt Card", "Amex Gold Rewards Card"],
    body: `## The Old Reputation

Historically, American Express had limited acceptance in Canada because of higher merchant fees. Many small businesses refused Amex, making it unreliable as a sole payment method.

## The 2025 Reality

Amex acceptance in Canada has improved significantly:

- **Major grocery chains**: Loblaws, Metro, Sobeys, Costco (no), Walmart (yes)
- **Gas stations**: Most Esso, Shell, and Petro-Canada accept Amex
- **Restaurants**: ~85% of full-service restaurants accept Amex
- **Online**: Nearly universal acceptance for e-commerce
- **Small businesses**: This is where gaps remain \u2014 roughly 30\u201340% of small independent shops don\u2019t accept Amex

## Where Amex Still Fails

- **Costco**: Mastercard only (use your Capital One Costco card)
- **Some farmers\u2019 markets and food trucks**: Cash or Visa/MC only
- **Small ethnic grocers**: Often Visa/MC debit only
- **Some parking meters and transit systems**: Visa/MC tap only
- **Certain insurance companies**: Limited payment options

## The 2-Card Strategy

The practical solution is simple: carry your Amex as your **primary card** for maximum rewards, and keep a Visa or Mastercard as your **backup** for the 15\u201320% of places that don\u2019t accept Amex.

This way you earn 5x on groceries and dining (Amex Cobalt) while never getting stuck at a register.

## Is It Getting Better?

Yes. Amex has been actively reducing merchant fees in Canada and signing agreements with major payment processors. Each year, more merchants come on board. The gap is closing, but it\u2019s not gone yet.`,
  },
];

export function getArticlesByCategory(category: Article["category"]): Article[] {
  return ARTICLES.filter(a => a.category === category);
}

export function getFeaturedArticles(count = 3): Article[] {
  return ARTICLES.slice(0, count);
}

export function getArticleBySlug(slug: string): Article | undefined {
  return ARTICLES.find(a => a.slug === slug);
}
