package service

import "strings"

/*
 * Categorizer — turn a merchant description into a category slug from the
 * 8 categories MapleRewards models. Used by the CSV import flow so the user
 * doesn't have to pick a category per row.
 *
 * This is a deliberate substring dictionary, not an AI call. Reasons:
 *   - Bank descriptions are short and noisy; LLM classification would burn
 *     ~$0.0001 per row × thousands of rows for marginal accuracy gains.
 *   - The Canadian merchant landscape is small enough that a curated list
 *     covers ~80% of real-world spend in a typical wallet (groceries,
 *     dining, gas, pharmacy stack — most of the top 50 merchants).
 *   - Anything we miss falls through to "everything-else" which is exactly
 *     what the optimizer's fallback rate would handle anyway.
 *
 * Slugs match the rows seeded in the `categories` table:
 *   groceries, dining, travel, gas-transit, pharmacy, entertainment,
 *   streaming-digital, online-shopping, recurring-bills, everything-else.
 *
 * Hyphenated slugs (NOT underscored) — that's how the seed migration wrote
 * them and how WalletService.LogSpend looks them up via GetCategoryBySlug.
 */

type merchantRule struct {
	pattern  string // case-insensitive substring; first match wins per category
	category string
}

// Order matters — more specific rules first. Within a category, ordering
// is irrelevant. Across categories, "STREAMING" beats "ENTERTAINMENT" only
// because we want streaming_digital to capture Netflix/Spotify before a
// generic "MOVIE" trigger could mislabel them. Tested with real Cobalt /
// RBC / Scotia statements during development.
var merchantRules = []merchantRule{
	// ── Recurring bills & memberships ────────────────────────────────────
	// Match before streaming since some subscription services (Crave, etc.)
	// could double as either; "membership" / "recurring" is the strong signal.
	{"membership fee", "recurring-bills"},
	{"annual fee", "recurring-bills"},
	{"hydro", "recurring-bills"},
	{"enbridge", "recurring-bills"},
	{"bell canada", "recurring-bills"},
	{"rogers ", "recurring-bills"}, // trailing space avoids matching "rogers cinema" etc.
	{"telus", "recurring-bills"},
	{"freedom mobile", "recurring-bills"},
	// Mobile carriers MUST sit above the "mobil" (Exxon/Mobil gas) rule —
	// first-match-wins, so "BELL MOBILITY"/"VIRGIN MOBILE"/etc. categorize as a
	// phone bill, not gas (which would value the entry at a card's gas
	// multiplier and inflate the persisted reward).
	{"bell mobility", "recurring-bills"},
	{"virgin mobile", "recurring-bills"},
	{"virgin plus", "recurring-bills"},
	{"public mobile", "recurring-bills"},
	{"lucky mobile", "recurring-bills"},
	{"fido", "recurring-bills"},
	{"chatr", "recurring-bills"},
	{"t-mobile", "recurring-bills"},
	{"koodo", "recurring-bills"},
	{"insurance", "recurring-bills"},

	// ── Online shopping ─────────────────────────────────────────────────
	{"amazon.ca", "online-shopping"},
	{"amazon mktplc", "online-shopping"},
	{"amazon prime", "online-shopping"},
	{"amazon mkt", "online-shopping"},
	{"amzn mktp", "online-shopping"},
	{"ebay", "online-shopping"},
	{"aliexpress", "online-shopping"},
	{"etsy", "online-shopping"},
	{"shein", "online-shopping"},
	{"temu", "online-shopping"},
	{"wayfair", "online-shopping"},
	{"best buy", "online-shopping"},
	{"bestbuy", "online-shopping"},
	{"the bay", "online-shopping"},
	{"hudsons bay", "online-shopping"},
	{"indigo", "online-shopping"},
	{"chapters", "online-shopping"},

	// ── Streaming & digital ─────────────────────────────────────────────
	{"netflix", "streaming-digital"},
	{"spotify", "streaming-digital"},
	{"apple.com/bill", "streaming-digital"},
	{"itunes", "streaming-digital"},
	{"apple music", "streaming-digital"},
	{"disney+", "streaming-digital"},
	{"disney plus", "streaming-digital"},
	{"crave", "streaming-digital"},
	{"prime video", "streaming-digital"},
	{"audible", "streaming-digital"},
	{"hbo", "streaming-digital"},
	{"youtube premium", "streaming-digital"},
	{"google one", "streaming-digital"},
	{"icloud", "streaming-digital"},
	{"dropbox", "streaming-digital"},
	{"adobe", "streaming-digital"},
	{"openai", "streaming-digital"},
	{"chatgpt", "streaming-digital"},
	{"anthropic", "streaming-digital"},
	{"github", "streaming-digital"},

	// ── Groceries ───────────────────────────────────────────────────────
	{"loblaws", "groceries"},
	{"no frills", "groceries"},
	{"superstore", "groceries"},
	{"wholesale club", "groceries"},
	{"shoppers", "groceries"},
	{"shoppers drug mart", "groceries"},
	{"costco wholesale", "groceries"},
	{"costco gas", "gas-transit"}, // override — costco gas is gas
	{"costco", "groceries"},
	{"walmart", "groceries"},
	{"metro", "groceries"},
	{"sobeys", "groceries"},
	{"safeway", "groceries"},
	{"iga", "groceries"},
	{"freshco", "groceries"},
	{"fortinos", "groceries"},
	{"longo", "groceries"},
	{"farm boy", "groceries"},
	{"whole foods", "groceries"},
	{"t&t", "groceries"},
	{"t & t", "groceries"},
	{"galleria", "groceries"},
	{"foody mart", "groceries"},
	{"provigo", "groceries"},
	{"maxi", "groceries"},
	{"save-on-foods", "groceries"},
	{"save on foods", "groceries"},
	{"thrifty foods", "groceries"},
	{"food basics", "groceries"},

	// ── Dining ──────────────────────────────────────────────────────────
	{"tim hortons", "dining"},
	{"tims", "dining"},
	{"starbucks", "dining"},
	{"mcdonalds", "dining"},
	{"mcdonald", "dining"},
	{"a&w", "dining"},
	{"subway", "dining"},
	{"pizza pizza", "dining"},
	{"pizza hut", "dining"},
	{"dominos", "dining"},
	{"boston pizza", "dining"},
	{"swiss chalet", "dining"},
	{"the keg", "dining"},
	{"earls", "dining"},
	{"cactus club", "dining"},
	{"chipotle", "dining"},
	{"five guys", "dining"},
	{"wendy", "dining"},
	{"kfc", "dining"},
	{"popeyes", "dining"},
	{"taco bell", "dining"},
	{"booster juice", "dining"},
	{"second cup", "dining"},
	{"jugo juice", "dining"},
	{"freshslice", "dining"},
	{"jack astor", "dining"},
	{"montana", "dining"},
	{"east side mario", "dining"},
	{"shoeless joe", "dining"},
	{"local public eatery", "dining"},
	{"uber eats", "dining"},
	{"ubereats", "dining"},
	{"doordash", "dining"},
	{"skipthedishes", "dining"},
	{"skip the dishes", "dining"},
	{"foodora", "dining"},
	{"restaurant", "dining"},
	{"cafe", "dining"},
	{"bistro", "dining"},
	{"pub", "dining"},

	// ── Gas & transit ───────────────────────────────────────────────────
	{"esso", "gas-transit"},
	{"shell ", "gas-transit"},
	{"petro-canada", "gas-transit"},
	{"petro canada", "gas-transit"},
	{"husky", "gas-transit"},
	{"chevron", "gas-transit"},
	{"mobil", "gas-transit"},
	{"pioneer", "gas-transit"},
	{"ultramar", "gas-transit"},
	{"co-op gas", "gas-transit"},
	{"co-op fuel", "gas-transit"},
	{"7-eleven", "gas-transit"},
	{"7 eleven", "gas-transit"},
	{"mac's", "gas-transit"},
	{"macs", "gas-transit"},
	{"circle k", "gas-transit"},
	{"uber trip", "gas-transit"},
	{"uber bv", "gas-transit"},
	{"uber canada", "gas-transit"},
	{"lyft", "gas-transit"},
	{"presto", "gas-transit"},
	{"go transit", "gas-transit"},
	{"ttc", "gas-transit"},
	{"oc transpo", "gas-transit"},
	{"translink", "gas-transit"},
	{"compass", "gas-transit"},
	{"via rail", "gas-transit"},

	// ── Pharmacy ────────────────────────────────────────────────────────
	{"rexall", "pharmacy"},
	{"pharma plus", "pharmacy"},
	{"pharmasave", "pharmacy"},
	{"london drugs", "pharmacy"},
	{"jean coutu", "pharmacy"},
	{"familiprix", "pharmacy"},
	{"uniprix", "pharmacy"},
	{"pharmacy", "pharmacy"},

	// ── Entertainment ───────────────────────────────────────────────────
	{"cineplex", "entertainment"},
	{"landmark cinemas", "entertainment"},
	{"imax", "entertainment"},
	{"live nation", "entertainment"},
	{"ticketmaster", "entertainment"},
	{"stubhub", "entertainment"},
	{"vivid seats", "entertainment"},
	{"box office", "entertainment"},
	{"theatre", "entertainment"},
	{"cinema", "entertainment"},
	{"playstation", "entertainment"},
	{"xbox", "entertainment"},
	{"nintendo", "entertainment"},
	{"steampowered", "entertainment"},
	{"amusement", "entertainment"},

	// ── Travel ──────────────────────────────────────────────────────────
	{"air canada", "travel"},
	{"westjet", "travel"},
	{"porter airlines", "travel"},
	{"sunwing", "travel"},
	{"flair airlines", "travel"},
	{"lynx air", "travel"},
	{"ac aeroplan", "travel"},
	{"booking.com", "travel"},
	{"booking com", "travel"},
	{"expedia", "travel"},
	{"hotels.com", "travel"},
	{"trivago", "travel"},
	{"airbnb", "travel"},
	{"vrbo", "travel"},
	{"marriott", "travel"},
	{"hilton", "travel"},
	{"hyatt", "travel"},
	{"sheraton", "travel"},
	{"westin", "travel"},
	{"holiday inn", "travel"},
	{"best western", "travel"},
	{"ihg", "travel"},
	{"fairmont", "travel"},
	{"four seasons", "travel"},
	{"delta hotels", "travel"},
	{"alamo", "travel"},
	{"avis", "travel"},
	{"budget rent", "travel"},
	{"enterprise rent", "travel"},
	{"hertz", "travel"},
	{"national car", "travel"},
	{"discount car", "travel"},
}

// CategorizeMerchant returns the best-matching category slug for a bank-
// statement description. Returns "everything-else" when no rule matches —
// the optimizer's fallback rate handles that case correctly.
func CategorizeMerchant(description string) string {
	d := strings.ToLower(strings.TrimSpace(description))
	if d == "" {
		return "everything-else"
	}
	for _, r := range merchantRules {
		if strings.Contains(d, r.pattern) {
			return r.category
		}
	}
	return "everything-else"
}
