# I Did the Math on a Year of My Own Rewards and Found $2,400 Left on the Table

*Canada's best rewards tool is a spreadsheet, and the US apps don't work here. So I built the one that should exist. It's called MapleRewards.*

I added up a full year of my credit card rewards. Not the points I earned. The points I *should* have earned and didn't.

$2,400. In CAD. Gone.

Three cards, each great at something, and I'd been treating them like they were interchangeable. Groceries on the 1x card instead of the 4x. A 5x cap I blew through in March and never noticed, so half my year quietly paid one point per dollar. None of it felt like a mistake in the moment. It only showed up when I looked at the whole year at once.

The average Canadian leaves about $800 a year on the table. I was just an overachiever about it.

## The status quo is a spreadsheet

My first move was the obvious one: find the app. There's an app for everything.

There is, if you live in the US. I tried the well-known American optimizers and hit a wall every time. One told me to pay at Costco with my Amex. Costco Canada is Mastercard only. One couldn't read my Aeroplan balance at all. One asked for my bank login, then broke on the handoff.

They weren't badly built. They were built for a different country, all the way down: which networks stores take, which loyalty programs matter, a reliance on bank-linking that barely reaches Canadian banks. You can't patch your way out of that.

So the best rewards tool in Canada is a spreadsheet. The serious points people all keep one. Everyone else guesses. The card issuers love it. Complexity is the moat: the harder it is to know which card to pull out, the more rewards quietly expire.

I got tired of being on the wrong side of that.

## So I built it

MapleRewards is a cap-aware rewards optimizer built for Canada.

You tell it what's in your wallet. For any purchase, it tells you the single best card to use, given the category, the network the store actually takes, and how much of each bonus you've already spent.

Then the part I'm proudest of: it reroutes. The moment a 5x category fills, it hands you your next-best card automatically. That one behavior is most of my $2,400.

It covers 90+ Canadian cards across 28 loyalty programs. It hands you a receipt of exactly what you left on the table, in CAD. And it has an assistant that doesn't just chat, it reads your real wallet and calls the optimizer and a live award search to answer questions like "best way to fly two people to Tokyo on points?" from your actual balances.

One rule I won't break: no bank-linking, ever. You tell it your cards. It never touches your accounts. That's the thing the US apps got wrong, and it broke on me personally. I'm not repeating it.

## What's under the hood

I built it solo, full stack.

The cap math runs on a Go core with PostgreSQL and Redis, because the reroute logic has to stay correct under load and feel instant. "Subtly wrong" is the failure mode I was most afraid of. The assistant runs on Claude with tool-calling, so it reasons over real data instead of improvising. The front end is Next.js and React. It's in production on Railway and Vercel.

This was months of unglamorous work. Modelling caps that reset on different cycles across two dozen programs. Making an AI answer from a wallet instead of confidently making something up. There's no incumbent to dethrone here, just a gap where the right tool should be, and a country quietly leaving real money behind because nobody built it for them.

## Come look

MapleRewards is live at maplerewards.app, and it works.

I'm opening it deliberately, not all at once. There's a waitlist, and I'm letting in a small first group, partly to get the optimizer right against real, messy Canadian wallets while it's young, and partly because I'd rather the first people in actually care about this problem.

If you've ever pulled out a card and quietly wondered whether it was the right one, it probably wasn't. I'll show you the receipt.

Link's in the first comment. Request a spot, and tell me what your number turns out to be.

---

### Posting kit

**Alternate headlines (A/B these):**
1. I Added Up a Year of My Own Rewards and Found $2,400 I Never Collected
2. Canada's Best Rewards Tool Is a Spreadsheet. So I Built the One That Should Exist.
3. A US App Told Me to Use Amex at Costco. That's When I Started Building.

**First comment (put the link here, not in the body):**
> Here's the link: maplerewards.app — It's live, but I'm letting people in a small first wave at a time rather than opening the doors all at once. Request a spot on the waitlist and I'll start moving the early group through. Curious what your missed-rewards receipt comes back as.

**Suggested image:** lead with `1-home-hero` (the "Know what to swipe. Before you swipe." shot) or `2-optimizer-input`. A 3-4 image set in this order reads well: hero -> optimizer -> loyalty/Aeroplan -> pricing.
