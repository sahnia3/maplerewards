package service

import (
	"context"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"maplerewards/internal/knowledge"
	"maplerewards/internal/model"
)

type fakeTransferLookup struct{ routes []model.TransferPartner }

func (f fakeTransferLookup) GetTransferRoutesFrom(context.Context, string) ([]model.TransferPartner, error) {
	return f.routes, nil
}

type fakeProgramLookup struct{}

func (fakeProgramLookup) GetProgramBySlug(_ context.Context, slug string) (*model.LoyaltyProgram, error) {
	return &model.LoyaltyProgram{ID: "p-" + slug, Slug: slug}, nil
}

// bestInboundPartner picks the strongest program you can transfer INTO the
// award's currency: highest ratio, tie-broken by source-currency base value,
// skipping inactive routes. Nil lookups (worker path) yield no hint.
func TestBestInboundPartner(t *testing.T) {
	routes := []model.TransferPartner{
		{TransferRatio: 1.0, IsActive: true, FromProgram: &model.LoyaltyProgram{Name: "Amex MR", Slug: "amex-mr-ca", BaseCPP: 1.65}},
		{TransferRatio: 0.75, IsActive: true, FromProgram: &model.LoyaltyProgram{Name: "Capital One", Slug: "c1", BaseCPP: 1.50}},
		{TransferRatio: 1.0, IsActive: true, FromProgram: &model.LoyaltyProgram{Name: "RBC Avion", Slug: "rbc-avion", BaseCPP: 1.40}},
		{TransferRatio: 2.0, IsActive: false, FromProgram: &model.LoyaltyProgram{Name: "Inactive", Slug: "x", BaseCPP: 9}}, // best ratio but inactive → skipped
	}
	svc := &AwardSearchService{transferRepo: fakeTransferLookup{routes: routes}, programRepo: fakeProgramLookup{}}
	cache := map[string]string{}

	// Highest ACTIVE ratio is 1.0 (Amex MR vs RBC Avion tie) → tie-broken by
	// base cpp → Amex MR (1.65 > 1.40). The 2.0 route is inactive and skipped.
	if got := svc.bestInboundPartner(context.Background(), "aeroplan", cache); got != "Amex MR" {
		t.Fatalf("want Amex MR, got %q", got)
	}
	if cache["aeroplan"] != "Amex MR" {
		t.Errorf("result must be cached, got %q", cache["aeroplan"])
	}
	// Nil lookups (the worker path) must yield no hint, not panic.
	if got := (&AwardSearchService{}).bestInboundPartner(context.Background(), "aeroplan", map[string]string{}); got != "" {
		t.Errorf("nil lookups must yield empty hint, got %q", got)
	}
}

// googleFlightsDated must always carry the exact route AND the searched date
// so a program with no real award deep link still lands the user on "all
// flights that day" rather than a bare airline homepage.
func TestGoogleFlightsDated_CarriesRouteAndDate(t *testing.T) {
	got := googleFlightsDated("YYZ", "CDG", "2026-06-25")
	for _, want := range []string{"google.com/travel/flights", "YYZ", "CDG", "2026-06-25"} {
		if !strings.Contains(got, want) {
			t.Fatalf("googleFlightsDated missing %q: %s", want, got)
		}
	}
	// No date → still route-scoped, no dangling "on".
	g2 := googleFlightsDated("YYZ", "CDG", "")
	if !strings.Contains(g2, "YYZ") || !strings.Contains(g2, "CDG") {
		t.Fatalf("dateless variant lost the route: %s", g2)
	}
	if strings.Contains(g2, "%20on%20") {
		t.Fatalf("dateless variant left a dangling 'on': %s", g2)
	}
}

// awardBookingURL: programs WITHOUT a usable dated award deep link must fall
// through to a dated Google Flights view (the user-reported defect: Air France
// / Virgin / Lufthansa links went to useless or US homepages with no date).
// Programs WITH a real dated deep link must keep it and include the date.
func TestAwardBookingURL_DeepLinkVsDatedFallback(t *testing.T) {
	const date = "2026-06-25"

	weak := []string{"flyingblue", "virginatlantic", "lufthansa", "singapore", "emirates", "turkish", "qatar", "etihad", "unknown-prog"}
	for _, prog := range weak {
		got := awardBookingURL(prog, "YYZ", "CDG", date, "business", 1)
		if !strings.Contains(got, "google.com/travel/flights") {
			t.Errorf("%s: expected dated Google Flights fallback, got %s", prog, got)
		}
		if !strings.Contains(got, date) {
			t.Errorf("%s: fallback dropped the date: %s", prog, got)
		}
		if strings.Contains(got, "airfrance.us") || strings.Contains(got, "#book-with-miles") {
			t.Errorf("%s: still points at the old dead/US homepage: %s", prog, got)
		}
	}

	// Strong programs keep their real award deep link AND embed the date.
	strong := map[string]string{
		"aeroplan": "aircanada.com",
		"united":   "united.com",
		"avios":    "britishairways.com",
		"delta":    "delta.com",
		"american": "aa.com",
	}
	for prog, host := range strong {
		got := awardBookingURL(prog, "YYZ", "CDG", date, "business", 1)
		if !strings.Contains(got, host) {
			t.Errorf("%s: lost its real deep link (want host %s), got %s", prog, host, got)
		}
		if !strings.Contains(got, date) && !strings.Contains(got, "25/06/26") {
			t.Errorf("%s: deep link missing the searched date: %s", prog, got)
		}
		if strings.Contains(got, "google.com/travel/flights") {
			t.Errorf("%s: regressed to generic fallback instead of its deep link: %s", prog, got)
		}
	}
}

// netCashCAD subtracts cash taxes (CAD) from the fare before CPP pricing,
// treats a nil taxes pointer as "unknown" (subtract nothing), and clamps at 0
// when surcharges meet or exceed the fare.
func TestNetCashCAD(t *testing.T) {
	p := func(v float64) *float64 { return &v }
	cases := []struct {
		name  string
		cash  float64
		taxes *float64
		want  float64
	}{
		{"nil taxes unchanged", 800, nil, 800},
		{"subtracts taxes", 800, p(120), 680},
		{"clamps when taxes exceed fare", 100, p(150), 0},
		{"zero when taxes equal fare", 150, p(150), 0},
	}
	for _, c := range cases {
		if got := netCashCAD(c.cash, c.taxes); got != c.want {
			t.Errorf("%s: netCashCAD(%.0f) = %.2f, want %.2f", c.name, c.cash, got, c.want)
		}
	}
}

// The headline CPP prices points on cash NET of surcharges: a $1000 fare with
// $300 cash taxes on 50k points is worth ($1000-$300)/50000 = 1.4¢, not the
// pre-fix 2.0¢ that ignored the taxes the user still pays on redemption.
func TestComputeCPP_NetsAwardTaxes(t *testing.T) {
	taxes := 300.0
	got := computeCPP(netCashCAD(1000, &taxes), 50_000)
	if diff := got - 1.4; diff > 0.001 || diff < -0.001 {
		t.Fatalf("net CPP = %.4f, want 1.4", got)
	}
	if old := computeCPP(1000, 50_000); old <= got {
		t.Fatalf("taxes-ignored CPP (%.2f) should exceed the netted CPP (%.2f)", old, got)
	}
}

// ── Issuer-key → DB-slug partner resolution ──────────────────────────────────

// recordingProgramLookup captures the slug bestInboundPartner queries with, so
// we can prove the scraper issuer key is remapped to the real DB slug before
// the lookup (the bug: non-Aeroplan programs queried with the raw key missed).
type recordingProgramLookup struct {
	mu        sync.Mutex
	askedSlug string
}

func (r *recordingProgramLookup) GetProgramBySlug(_ context.Context, slug string) (*model.LoyaltyProgram, error) {
	r.mu.Lock()
	r.askedSlug = slug
	r.mu.Unlock()
	return &model.LoyaltyProgram{ID: "p-" + slug, Slug: slug}, nil
}

// dbSlugForIssuer is the inverse of the wallet's slugToIssuer, using the ACTUAL
// seeded DB slugs (Avios = "ba-avios", Flying Blue = "flying-blue"). Unmapped
// keys pass through unchanged so programs without a DB row degrade silently.
func TestDBSlugForIssuer(t *testing.T) {
	cases := map[string]string{
		"aeroplan":   "aeroplan",    // key == slug (the only one that worked before)
		"flyingblue": "flying-blue", // scraper key ≠ DB slug
		"avios":      "ba-avios",    // scraper key ≠ DB slug
		"united":     "united",      // no DB row → pass through, degrades silently
		"delta":      "delta",
	}
	for issuer, want := range cases {
		if got := dbSlugForIssuer(issuer); got != want {
			t.Errorf("dbSlugForIssuer(%q) = %q, want %q", issuer, got, want)
		}
	}
}

// bestInboundPartner must light up for NON-Aeroplan awards: given the scraper
// key "flyingblue" it has to query loyalty_programs by the DB slug "flying-blue"
// (not the raw key) and then return the strongest inbound partner.
func TestBestInboundPartner_RemapsIssuerKeyToDBSlug(t *testing.T) {
	routes := []model.TransferPartner{
		{TransferRatio: 1.0, IsActive: true, FromProgram: &model.LoyaltyProgram{Name: "Amex MR", Slug: "amex-mr-ca", BaseCPP: 1.65}},
	}
	rec := &recordingProgramLookup{}
	svc := &AwardSearchService{transferRepo: fakeTransferLookup{routes: routes}, programRepo: rec}

	got := svc.bestInboundPartner(context.Background(), "flyingblue", map[string]string{})
	if got != "Amex MR" {
		t.Fatalf("want Amex MR for flyingblue award, got %q", got)
	}
	if rec.askedSlug != "flying-blue" {
		t.Fatalf("bestInboundPartner queried slug %q, want the remapped DB slug %q", rec.askedSlug, "flying-blue")
	}
}

// ── Wallet slug → issuer-key aggregation ─────────────────────────────────────

// slugToIssuer maps a DB loyalty_programs.slug to the scraper issuer key award
// rows carry. The two seeded airline programs whose slug differs from the key
// MUST remap ("ba-avios"→"avios", "flying-blue"→"flyingblue"); everything else —
// seeded airline programs with no award issuer (asia-miles, westjet-rewards), a
// non-airline transferable program, and unknown slugs — falls through unchanged.
// Slugs verified against migrations/*.up.sql loyalty_programs seeds.
func TestSlugToIssuer(t *testing.T) {
	cases := map[string]string{
		"ba-avios":        "avios",      // DB slug ≠ scraper key — the wallet-aggregation bug
		"flying-blue":     "flyingblue", // DB slug ≠ scraper key
		"aeroplan":        "aeroplan",   // seeded slug == scraper key
		"asia-miles":      "asia-miles", // seeded airline, no award issuer key → pass through
		"westjet-rewards": "westjet-rewards",
		"amex-mr-ca":      "amex-mr-ca",    // non-airline transferable program → pass through
		"not-a-program":   "not-a-program", // unmapped → returned verbatim
	}
	for slug, want := range cases {
		if got := slugToIssuer(slug); got != want {
			t.Errorf("slugToIssuer(%q) = %q, want %q", slug, got, want)
		}
	}
}

// loadWalletBalances must key the wallet by the scraper ISSUER KEY, not the raw
// DB slug: a British Airways card carries loyalty_programs.slug "ba-avios", but
// award rows are keyed "avios". Before the slug→issuer remap the balance landed
// under "ba-avios" and never matched the award row, so PointsAvailable/CanAfford
// and CardBreakdowns for every Avios result were empty. Two cards prove the
// per-issuer aggregation as well as the remap.
func TestLoadWalletBalances_AviosCardAggregatesUnderIssuerKey(t *testing.T) {
	avios := &model.LoyaltyProgram{Slug: "ba-avios", Name: "British Airways Avios"}
	repo := &walletTestRepo{
		getUserBySession: func(context.Context, string) (*model.User, error) {
			return &model.User{ID: "u-1"}, nil
		},
		getUserCards: func(context.Context, string) ([]model.UserCard, error) {
			return []model.UserCard{
				{CardID: "c-1", PointBalance: 30_000, Card: &model.Card{Name: "Amex Cobalt", LoyaltyProgram: avios}},
				{CardID: "c-2", PointBalance: 20_000, Card: &model.Card{Name: "RBC Avion", LoyaltyProgram: avios}},
			}, nil
		},
	}
	svc := &AwardSearchService{walletRepo: repo}

	balances, err := svc.loadWalletBalances(context.Background(), "sess-1")
	if err != nil {
		t.Fatalf("loadWalletBalances: %v", err)
	}

	// The raw DB slug must NOT be a key — it has to be remapped to the issuer key.
	if _, ok := balances["ba-avios"]; ok {
		t.Errorf("wallet keyed by raw DB slug %q; expected remap to issuer key %q", "ba-avios", "avios")
	}
	wb, ok := balances["avios"]
	if !ok {
		t.Fatalf("no wallet entry under issuer key %q; balances=%v", "avios", balances)
	}
	if wb.balance != 50_000 {
		t.Errorf("aggregated balance = %d, want 50000 (30000+20000)", wb.balance)
	}
	if len(wb.breakdowns) != 2 {
		t.Fatalf("want 2 card breakdowns, got %d", len(wb.breakdowns))
	}
	// Breakdowns carry the per-card detail the UI renders.
	if wb.breakdowns[0].CardName == "" || wb.breakdowns[0].PointsHeld == 0 {
		t.Errorf("breakdown missing card detail: %+v", wb.breakdowns[0])
	}
}

// loadWalletBalances must skip cards with no linked card or loyalty program
// rather than panic, and must short-circuit an empty session (the worker probe
// path) before touching the repo.
func TestLoadWalletBalances_SkipsNilAndEmptySession(t *testing.T) {
	queried := false
	repo := &walletTestRepo{
		getUserBySession: func(context.Context, string) (*model.User, error) {
			queried = true
			return &model.User{ID: "u-1"}, nil
		},
		getUserCards: func(context.Context, string) ([]model.UserCard, error) {
			return []model.UserCard{
				{CardID: "c-nil-card"},                                  // Card == nil → skipped
				{CardID: "c-no-prog", Card: &model.Card{Name: "Plain"}}, // LoyaltyProgram == nil → skipped
			}, nil
		},
	}
	svc := &AwardSearchService{walletRepo: repo}

	// Empty session short-circuits before any repo call.
	if got, err := svc.loadWalletBalances(context.Background(), ""); err != nil || len(got) != 0 {
		t.Fatalf("empty session: got (%v, %v), want (empty map, nil)", got, err)
	}
	if queried {
		t.Error("empty session must not query the wallet repo")
	}

	balances, err := svc.loadWalletBalances(context.Background(), "sess-1")
	if err != nil {
		t.Fatalf("loadWalletBalances: %v", err)
	}
	if len(balances) != 0 {
		t.Errorf("cards with nil Card/LoyaltyProgram must be skipped, got %v", balances)
	}
}

// ── Round-trip combine ───────────────────────────────────────────────────────

func ratedRow(prog string, points int, cash float64, taxes *float64) model.AwardSearchResult {
	return model.AwardSearchResult{
		Program:      prog,
		PointsCost:   points,
		CashPriceCAD: cash,
		TaxesCash:    taxes,
		Rated:        true,
	}
}

// combineRoundTrip pairs each outbound row with the cheapest same-program return
// option, sets ReturnLeg, and folds in combined points/taxes/CPP. Both-legs-
// rated rows get a real RoundTripCPP priced on net-of-tax cash across the pair.
func TestCombineRoundTrip_ShapeAndMath(t *testing.T) {
	obTax, retTax := 100.0, 80.0
	outbound := []model.AwardSearchResult{
		ratedRow("aeroplan", 50_000, 1000, &obTax),
		// United has an outbound option but NO same-program return below → stays one-way.
		ratedRow("united", 44_000, 900, nil),
	}
	returnLeg := []model.AwardSearchResult{
		ratedRow("aeroplan", 60_000, 1200, &retTax),
		// A second, pricier aeroplan return must be ignored in favour of the cheaper one above.
		ratedRow("aeroplan", 99_000, 1500, &retTax),
	}

	combined := combineRoundTrip(outbound, returnLeg, "business")
	if len(combined) != 2 {
		t.Fatalf("want 2 outbound rows preserved, got %d", len(combined))
	}

	// Row 0: aeroplan round-trip.
	rt := combined[0]
	if rt.Program != "aeroplan" {
		t.Fatalf("row 0 program = %q, want aeroplan", rt.Program)
	}
	if rt.ReturnLeg == nil {
		t.Fatal("aeroplan row must carry a ReturnLeg")
	}
	if rt.ReturnLeg.PointsCost != 60_000 {
		t.Errorf("return leg should be the CHEAPER 60k option, got %d", rt.ReturnLeg.PointsCost)
	}
	if rt.RoundTripPointsCost != 110_000 {
		t.Errorf("round-trip points = %d, want 110000", rt.RoundTripPointsCost)
	}
	if rt.RoundTripTaxesCash == nil || *rt.RoundTripTaxesCash != 180 {
		t.Errorf("round-trip taxes = %v, want 180 (100+80)", rt.RoundTripTaxesCash)
	}
	// Net cash = (1000-100)+(1200-80) = 2020 over 110k pts → 2020/110000*100 = 1.8363…¢
	wantCPP := (900.0 + 1120.0) / 110_000.0 * 100.0
	if diff := rt.RoundTripCPP - wantCPP; diff > 0.001 || diff < -0.001 {
		t.Errorf("round-trip CPP = %.4f, want %.4f", rt.RoundTripCPP, wantCPP)
	}

	// Row 1: united stays one-way (no same-program return).
	ow := combined[1]
	if ow.Program != "united" {
		t.Fatalf("row 1 program = %q, want united", ow.Program)
	}
	if ow.ReturnLeg != nil || ow.RoundTripPointsCost != 0 || ow.RoundTripCPP != 0 {
		t.Errorf("united row must remain one-way (no ReturnLeg/RT fields), got %+v", ow)
	}
}

// When either leg is unrated (cash is a zone-fallback guess), the combined CPP
// must stay 0 — we never price a round trip off a fabricated cash number — but
// the points/taxes/ReturnLeg pairing still happens.
func TestCombineRoundTrip_UnratedLegSuppressesCPP(t *testing.T) {
	outbound := []model.AwardSearchResult{ratedRow("aeroplan", 50_000, 1000, nil)}
	unratedReturn := model.AwardSearchResult{Program: "aeroplan", PointsCost: 55_000, CashPriceCAD: 1100, Rated: false}

	combined := combineRoundTrip(outbound, []model.AwardSearchResult{unratedReturn}, "economy")
	if len(combined) != 1 || combined[0].ReturnLeg == nil {
		t.Fatalf("expected a paired round-trip row, got %+v", combined)
	}
	if combined[0].RoundTripPointsCost != 105_000 {
		t.Errorf("RT points = %d, want 105000", combined[0].RoundTripPointsCost)
	}
	if combined[0].RoundTripCPP != 0 {
		t.Errorf("RT CPP must be 0 when a leg is unrated, got %.4f", combined[0].RoundTripCPP)
	}
}

// cloneResults must give each caller an independent copy so the per-request
// wallet overlay (which mutates rows in place) can't corrupt a slice shared by
// singleflight — including the nested ReturnLeg pointer.
func TestCloneResults_Isolation(t *testing.T) {
	ret := model.AwardSearchResult{Program: "aeroplan", PointsCost: 60_000}
	src := []model.AwardSearchResult{
		{Program: "aeroplan", PointsCost: 50_000, PointsAvailable: 0, ReturnLeg: &ret},
	}
	clone := cloneResults(src)

	// Mutate the clone's top-level + nested return leg.
	clone[0].PointsAvailable = 999
	clone[0].ReturnLeg.PointsAvailable = 888

	if src[0].PointsAvailable != 0 {
		t.Errorf("source row mutated through clone: %d", src[0].PointsAvailable)
	}
	if src[0].ReturnLeg.PointsAvailable != 0 {
		t.Errorf("source ReturnLeg mutated through clone: %d", src[0].ReturnLeg.PointsAvailable)
	}
	if clone[0].ReturnLeg == src[0].ReturnLeg {
		t.Error("clone shares the ReturnLeg pointer with the source")
	}
	if cloneResults(nil) != nil {
		t.Error("cloneResults(nil) must be nil")
	}
}

// sumTaxes: nil means "unknown" for that leg; the total is the sum of whatever
// legs reported a number, and nil only when NEITHER leg did.
func TestSumTaxes(t *testing.T) {
	p := func(v float64) *float64 { return &v }
	if got := sumTaxes(nil, nil); got != nil {
		t.Errorf("both nil → nil, got %v", *got)
	}
	if got := sumTaxes(p(100), nil); got == nil || *got != 100 {
		t.Errorf("one known → that value, got %v", got)
	}
	if got := sumTaxes(p(100), p(80)); got == nil || *got != 180 {
		t.Errorf("both known → sum, got %v", got)
	}
}

// ── Cache-stampede singleflight de-dup ───────────────────────────────────────

// barrierCache is an AwardCache double for the singleflight test. Every
// GetAwardSearch returns a miss after waiting on a shared start gate (so all
// callers enter fetchLeg's singleflight near-simultaneously). SetAwardSearch —
// reached ONLY by the singleflight leader, inside the de-duplicated function —
// blocks on a release gate, which guarantees every follower is parked inside
// singleflight.Do before the leader returns. It counts both calls.
type barrierCache struct {
	start    chan struct{} // closed by the test to release all GETs at once
	release  chan struct{} // closed by the test to let the leader's SET return
	gets     int64
	sets     int64
	setOnce  sync.Once
	setEntry chan struct{} // signals the test that the leader reached SET
}

func (b *barrierCache) GetAwardSearch(_ context.Context, _ string) ([]byte, bool, error) {
	<-b.start
	atomic.AddInt64(&b.gets, 1)
	return nil, false, nil // always miss → force the cold fan-out path
}

func (b *barrierCache) SetAwardSearch(_ context.Context, _ string, _ []byte, _ time.Duration) error {
	atomic.AddInt64(&b.sets, 1)
	b.setOnce.Do(func() { close(b.setEntry) }) // exactly one leader should reach here
	<-b.release                                // hold the leader inside Do until the test releases
	return nil
}

// A cold cache must not let N concurrent identical requests each fire the paid
// fan-out: singleflight collapses them to one. We prove it by counting how many
// times the de-duplicated function writes the cache (leader-only) — exactly one
// — while all N callers still receive a populated result.
func TestFetchLeg_SingleflightDeDup(t *testing.T) {
	// Minimal in-memory KB so fetchLegFresh's YAML fallback yields a cacheable
	// (non-empty) row with no network: aeroplan, atlantic/economy chart.
	kb := &knowledge.KnowledgeBase{
		Programs: map[string]*knowledge.Program{
			"aeroplan": {
				Name:       "Aeroplan",
				CPPRange:   knowledge.CPPRange{Low: 1.0, High: 2.0},
				AwardChart: map[string]map[string]int{"atlantic": {"economy": 60000}},
			},
		},
	}
	bc := &barrierCache{
		start:    make(chan struct{}),
		release:  make(chan struct{}),
		setEntry: make(chan struct{}),
	}
	// All data-source services nil → fan-out degrades straight to YAML fallback.
	svc := &AwardSearchService{kb: kb, cache: bc}

	req := model.AwardSearchRequest{Origin: "YYZ", Destination: "CDG", Date: "2026-09-01", Cabin: "economy", Passengers: 1}

	const n = 24
	var wg sync.WaitGroup
	results := make([][]model.AwardSearchResult, n)
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			res, err := svc.fetchLeg(context.Background(), req)
			// Mutate in place exactly like overlayWallet does per request. If
			// singleflight handed sharers the same backing array (i.e. cloneResults
			// failed to isolate callers), -race flags this write-write immediately.
			for j := range res {
				res[j].PointsAvailable = int64(idx)
				res[j].CanAfford = idx%2 == 0
			}
			results[idx], errs[idx] = res, err
		}(i)
	}

	close(bc.start) // release all GETs together → everyone piles into singleflight
	<-bc.setEntry   // leader has run the fan-out once and reached SET (and is parked there)

	// Park the leader in SET until every caller has passed GET, so all N are
	// guaranteed inside singleflight.Do (attached to the leader) before we let
	// the leader return — removes any window for a straggler to re-run the work.
	deadline := time.Now().Add(2 * time.Second)
	for atomic.LoadInt64(&bc.gets) < n {
		if time.Now().After(deadline) {
			t.Fatalf("only %d/%d callers reached GET", atomic.LoadInt64(&bc.gets), n)
		}
		time.Sleep(time.Millisecond)
	}
	close(bc.release)
	wg.Wait()

	if got := atomic.LoadInt64(&bc.sets); got != 1 {
		t.Fatalf("singleflight should de-dup the fan-out to ONE cache write, got %d", got)
	}
	for i := 0; i < n; i++ {
		if errs[i] != nil {
			t.Fatalf("caller %d errored: %v", i, errs[i])
		}
		if len(results[i]) == 0 {
			t.Fatalf("caller %d got no results — every caller must receive the shared bundle", i)
		}
	}
}
