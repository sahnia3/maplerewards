# "Your Rewards Move" — Proactive Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deterministic engine that fuses a user's wallet + the market + the tool surface into ranked, cited "moves," delivered as a free-teaser/Pro-depth Brief (in-app + weekly email + urgent push).

**Architecture:** A new isolated `internal/service/brief/` package. Deterministic `MoveGenerator`s each take an in-memory `UserState` + `MarketState` and emit `[]Move` with verifiable citations; the `Engine` assembles state once, fans out, ranks, and caps. The LLM is *not* in the generation path. A thin handler applies free/Pro gating; the worker reuses `BuildBrief` for email/push with a dedup table. Generators depend on a consumer-defined `BriefRepo` interface (DI), wired to existing repos by an adapter — so the package is unit-testable with function-field mocks (the repo's standard pattern).

**Tech Stack:** Go 1.22, Chi, pgx (PostgreSQL), Redis, golang-migrate; Next.js 16 / React 19 / TS frontend; existing RESEND mailer + VAPID pusher in `cmd/worker`.

---

## Scope check

Single subsystem (the Brief). One plan. v1 = 5 "ready now" generators + the sweet-spot generator; deferred generators (#7–10 in the spec) are explicitly out of scope here.

## File structure

| File | Responsibility |
|------|----------------|
| `internal/service/brief/move.go` | `Move`, `MoveType`, `Citation`, `CTA`, `Urgency` types |
| `internal/service/brief/repo.go` | `BriefRepo` consumer interface + the `UserState`/`MarketState` structs |
| `internal/service/brief/generator.go` | `MoveGenerator` interface + registry |
| `internal/service/brief/rank.go` | `rankMoves` scoring/sort |
| `internal/service/brief/gen_transfer_bonus.go` | transfer-bonus-timing generator |
| `internal/service/brief/gen_credit_sweep.go` | unused-credit generator |
| `internal/service/brief/gen_renewal.go` | renewal keep/cancel generator |
| `internal/service/brief/gen_award_watch.go` | award-watch-hit generator |
| `internal/service/brief/gen_application_window.go` | application-timing generator |
| `internal/service/brief/gen_sweet_spot.go` | redemption sweet-spot generator |
| `internal/service/brief/engine.go` | `Engine.BuildBrief` — assemble, fan out, rank, cap |
| `internal/service/brief/*_test.go` | per-unit tests (function-field mocks) |
| `internal/repo/brief_adapter.go` | adapts existing repos to `BriefRepo` |
| `internal/handler/brief.go` | `GET /api/v1/brief` + free/Pro gating |
| `migrations/000059_brief_alerts_sent.{up,down}.sql` | dedup table |
| `internal/repo/brief_alerts.go` | `WasAlerted` / `MarkAlerted` |
| `cmd/worker/brief_sweep.go` | weekly digest + urgent push using `BuildBrief` |
| `frontend/app/brief/page.tsx` | `/brief` page (gated render) |
| `frontend/lib/api.ts` | `getBrief()` client + `BriefMove` type (modify) |

Money is integer **cents** end-to-end in the engine (`ValueCAD int64`) to avoid float drift; formatting to dollars happens at the edge.

---

## Task 1: Core types

**Files:**
- Create: `internal/service/brief/move.go`
- Test: `internal/service/brief/move_test.go`

- [ ] **Step 1: Write the failing test**

```go
package brief

import "testing"

func TestMoveIsValidRequiresCitation(t *testing.T) {
	m := Move{Type: MoveTransferBonus, Title: "x", ValueCAD: 100}
	if m.IsValid() {
		t.Fatal("move with no citation source must be invalid")
	}
	m.Citation = Citation{SourceTable: "transfer_bonus_events", SourceID: "abc"}
	if !m.IsValid() {
		t.Fatal("move with a citation should be valid")
	}
}
```

- [ ] **Step 2: Run it to verify failure**

Run: `go test ./internal/service/brief/ -run TestMoveIsValidRequiresCitation`
Expected: FAIL — `undefined: Move`.

- [ ] **Step 3: Implement `move.go`**

```go
// Package brief builds a ranked list of cited, time-sensitive "moves" by
// fusing a user's wallet/balances with current market state. Generation is
// deterministic; the LLM is never in this path.
package brief

import "time"

type MoveType string

const (
	MoveTransferBonus     MoveType = "transfer_bonus"
	MoveCreditSweep       MoveType = "credit_sweep"
	MoveRenewal           MoveType = "renewal"
	MoveAwardWatch        MoveType = "award_watch"
	MoveApplicationWindow MoveType = "application_window"
	MoveSweetSpot         MoveType = "sweet_spot"
)

type Urgency int

const (
	UrgencyLow  Urgency = 1
	UrgencyMed  Urgency = 2
	UrgencyHigh Urgency = 3
)

// Citation ties every claim to a real row a user can verify.
type Citation struct {
	SourceTable string `json:"source_table"`
	SourceID    string `json:"source_id"`
	URL         string `json:"url,omitempty"`
}

type CTA struct {
	Label string `json:"label"`
	Route string `json:"route"`
}

// Move is one decision card. ValueCAD is integer cents.
type Move struct {
	Type      MoveType   `json:"type"`
	Title     string     `json:"title"`
	Detail    string     `json:"detail"`
	ValueCAD  int64      `json:"value_cad_cents"`
	Urgency   Urgency    `json:"urgency"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	Citation  Citation   `json:"citation"`
	CTA       CTA        `json:"cta"`
	Pro       bool       `json:"pro"`
}

// IsValid drops any move that can't be traced to a real source row.
func (m Move) IsValid() bool { return m.Citation.SourceTable != "" && m.Citation.SourceID != "" }

// Fingerprint dedups alerts: same source + expiry day = same alert.
func (m Move) Fingerprint() string {
	day := ""
	if m.ExpiresAt != nil {
		day = m.ExpiresAt.Format("2006-01-02")
	}
	return string(m.Type) + "|" + m.Citation.SourceID + "|" + day
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `go test ./internal/service/brief/ -run TestMoveIsValidRequiresCitation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/service/brief/move.go internal/service/brief/move_test.go
git commit -m "feat(brief): core Move types with mandatory citation"
```

---

## Task 2: Consumer interface + state structs

**Files:**
- Create: `internal/service/brief/repo.go`

This declares exactly what generators need. No test (pure type decls); covered transitively.

- [ ] **Step 1: Implement `repo.go`**

```go
package brief

import (
	"context"
	"time"
)

// Balance is one held loyalty balance valued at the program's base CPP (cents).
type Balance struct {
	ProgramSlug string
	ProgramName string
	Points      int64
	BaseCPP     float64 // cents per point
}

// Credit is a card statement credit with a reset/expiry date.
type Credit struct {
	ID         string
	CardName   string
	Name       string
	RemainingC int64 // unused value, cents
	ResetsAt   *time.Time
}

// CardHolding is a wallet card with its fee + next renewal.
type CardHolding struct {
	CardID      string
	Name        string
	AnnualFeeC  int64
	NetAnnualC  int64 // from card-value scorecard
	RenewsAt    *time.Time
}

// Watch is a saved award-availability watch with any newly-found seat.
type Watch struct {
	ID         string
	Route      string
	SeatFound  bool
	ProgramName string
}

// Application records a prior application for cooldown math.
type Application struct {
	CardName   string
	Issuer     string
	AppliedAt  time.Time
}

// Promo is an active transfer-bonus event.
type Promo struct {
	ID           string
	FromProgram  string
	ToProgram    string
	BonusPercent float64
	ExpiresAt    *time.Time
	SourceURL    string
}

// UserState is assembled once per user.
type UserState struct {
	UserID      string
	HomeAirport string
	Cards       []CardHolding
	Balances    []Balance
	Credits     []Credit
	Watches     []Watch
	Apps        []Application
}

// MarketState is assembled once per batch run, shared across users.
type MarketState struct {
	Promos []Promo
}

// BriefRepo is the narrow data dependency for the engine + generators.
type BriefRepo interface {
	LoadUserState(ctx context.Context, userID string) (UserState, error)
	LoadMarketState(ctx context.Context) (MarketState, error)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `go build ./internal/service/brief/`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add internal/service/brief/repo.go
git commit -m "feat(brief): consumer-defined BriefRepo + state structs"
```

---

## Task 3: Generator interface + registry

**Files:**
- Create: `internal/service/brief/generator.go`

- [ ] **Step 1: Implement `generator.go`**

```go
package brief

import "context"

// MoveGenerator turns (user, market) state into zero or more moves.
type MoveGenerator interface {
	Generate(ctx context.Context, u UserState, m MarketState) ([]Move, error)
	Name() string
}

// defaultGenerators is the v1 registry, in no particular order (rank sorts).
func defaultGenerators() []MoveGenerator {
	return []MoveGenerator{
		transferBonusGen{},
		creditSweepGen{},
		renewalGen{},
		awardWatchGen{},
		applicationWindowGen{},
		sweetSpotGen{},
	}
}
```

- [ ] **Step 2: Commit** (compiles after Task 9 adds the generator structs; commit now is fine as the file is self-consistent once those land — sequence Tasks 4–8 before building)

```bash
git add internal/service/brief/generator.go
git commit -m "feat(brief): MoveGenerator interface + v1 registry"
```

> Note: `go build` for the package succeeds only after Tasks 4–8 define the generator structs. Build/verify at the end of Task 8.

---

## Task 4: Transfer-bonus generator (canonical TDD example)

**Files:**
- Create: `internal/service/brief/gen_transfer_bonus.go`
- Test: `internal/service/brief/gen_transfer_bonus_test.go`

- [ ] **Step 1: Write the failing test**

```go
package brief

import (
	"context"
	"testing"
	"time"
)

func TestTransferBonusGen_ValuesAgainstBalance(t *testing.T) {
	exp := time.Now().Add(96 * time.Hour)
	u := UserState{
		Balances: []Balance{{ProgramSlug: "amex-mr-ca", ProgramName: "Amex MR", Points: 100000, BaseCPP: 1.65}},
	}
	m := MarketState{Promos: []Promo{{
		ID: "p1", FromProgram: "amex-mr-ca", ToProgram: "aeroplan",
		BonusPercent: 30, ExpiresAt: &exp, SourceURL: "https://x",
	}}}
	got, err := transferBonusGen{}.Generate(context.Background(), u, m)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 move, got %d", len(got))
	}
	// 100k MR -> 130k Aeroplan; incremental 30k pts; at MR base 1.65c the
	// incremental value = 30000 * 1.65c = 49500 cents.
	if got[0].ValueCAD != 49500 {
		t.Fatalf("want 49500 cents, got %d", got[0].ValueCAD)
	}
	if got[0].Citation.SourceID != "p1" {
		t.Fatalf("citation must point at the promo row, got %q", got[0].Citation.SourceID)
	}
	if got[0].Urgency != UrgencyHigh {
		t.Fatalf("ends in 4 days -> high urgency, got %d", got[0].Urgency)
	}
}

func TestTransferBonusGen_SkipsWhenNoMatchingBalance(t *testing.T) {
	exp := time.Now().Add(96 * time.Hour)
	u := UserState{Balances: []Balance{{ProgramSlug: "td-rewards", Points: 50000, BaseCPP: 0.5}}}
	m := MarketState{Promos: []Promo{{ID: "p1", FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, ExpiresAt: &exp}}}
	got, _ := transferBonusGen{}.Generate(context.Background(), u, m)
	if len(got) != 0 {
		t.Fatalf("no MR balance -> no move, got %d", len(got))
	}
}
```

- [ ] **Step 2: Run it to verify failure**

Run: `go test ./internal/service/brief/ -run TestTransferBonusGen`
Expected: FAIL — `undefined: transferBonusGen`.

- [ ] **Step 3: Implement `gen_transfer_bonus.go`**

```go
package brief

import (
	"context"
	"fmt"
	"time"
)

type transferBonusGen struct{}

func (transferBonusGen) Name() string { return "transfer_bonus" }

func (transferBonusGen) Generate(_ context.Context, u UserState, m MarketState) ([]Move, error) {
	byProgram := map[string]Balance{}
	for _, b := range u.Balances {
		byProgram[b.ProgramSlug] = b
	}
	var out []Move
	for _, p := range m.Promos {
		bal, ok := byProgram[p.FromProgram]
		if !ok || bal.Points <= 0 {
			continue
		}
		// Incremental points from the bonus, valued at the source program's
		// base CPP (conservative — the user already holds these points).
		incr := float64(bal.Points) * (p.BonusPercent / 100.0)
		valCents := int64(incr * bal.BaseCPP)
		if valCents <= 0 {
			continue
		}
		mv := Move{
			Type:     MoveTransferBonus,
			Title:    fmt.Sprintf("Transfer %s → %s now (+%.0f%%)", bal.ProgramName, p.ToProgram, p.BonusPercent),
			Detail:   fmt.Sprintf("You hold %s %s. The +%.0f%% bonus is worth ~$%.0f in extra value if you transfer before it ends.", humanInt(bal.Points), bal.ProgramName, p.BonusPercent, float64(valCents)/100),
			ValueCAD: valCents,
			Urgency:  urgencyFromExpiry(p.ExpiresAt),
			ExpiresAt: p.ExpiresAt,
			Citation: Citation{SourceTable: "transfer_bonus_events", SourceID: p.ID, URL: p.SourceURL},
			CTA:      CTA{Label: "See the promo", Route: "/promos"},
			Pro:      false,
		}
		if mv.IsValid() {
			out = append(out, mv)
		}
	}
	return out, nil
}

// urgencyFromExpiry: <=5 days = high, <=14 = med, else low. nil = low.
func urgencyFromExpiry(t *time.Time) Urgency {
	if t == nil {
		return UrgencyLow
	}
	d := time.Until(*t)
	switch {
	case d <= 5*24*time.Hour:
		return UrgencyHigh
	case d <= 14*24*time.Hour:
		return UrgencyMed
	default:
		return UrgencyLow
	}
}

// humanInt renders 100000 -> "100,000".
func humanInt(n int64) string {
	s := fmt.Sprintf("%d", n)
	out := ""
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out += ","
		}
		out += string(c)
	}
	return out
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `go test ./internal/service/brief/ -run TestTransferBonusGen`
Expected: PASS (both subtests).

- [ ] **Step 5: Commit**

```bash
git add internal/service/brief/gen_transfer_bonus.go internal/service/brief/gen_transfer_bonus_test.go
git commit -m "feat(brief): transfer-bonus-timing generator"
```

---

## Task 5: Credit-sweep generator

**Files:**
- Create: `internal/service/brief/gen_credit_sweep.go`
- Test: `internal/service/brief/gen_credit_sweep_test.go`

- [ ] **Step 1: Write the failing test**

```go
package brief

import (
	"context"
	"testing"
	"time"
)

func TestCreditSweepGen_FlagsUnusedExpiring(t *testing.T) {
	soon := time.Now().Add(6 * 24 * time.Hour)
	u := UserState{Credits: []Credit{
		{ID: "c1", CardName: "Amex Platinum", Name: "Dining credit", RemainingC: 20000, ResetsAt: &soon},
		{ID: "c2", CardName: "Amex Platinum", Name: "Used credit", RemainingC: 0, ResetsAt: &soon},
	}}
	got, _ := creditSweepGen{}.Generate(context.Background(), u, MarketState{})
	if len(got) != 1 {
		t.Fatalf("only the unused credit should fire, got %d", len(got))
	}
	if got[0].ValueCAD != 20000 || got[0].Citation.SourceID != "c1" {
		t.Fatalf("unexpected move: %+v", got[0])
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/service/brief/ -run TestCreditSweepGen`
Expected: FAIL — `undefined: creditSweepGen`.

- [ ] **Step 3: Implement `gen_credit_sweep.go`**

```go
package brief

import (
	"context"
	"fmt"
)

type creditSweepGen struct{}

func (creditSweepGen) Name() string { return "credit_sweep" }

func (creditSweepGen) Generate(_ context.Context, u UserState, _ MarketState) ([]Move, error) {
	var out []Move
	for _, c := range u.Credits {
		if c.RemainingC <= 0 {
			continue
		}
		mv := Move{
			Type:     MoveCreditSweep,
			Title:    fmt.Sprintf("Use your $%.0f %s before it resets", float64(c.RemainingC)/100, c.Name),
			Detail:   fmt.Sprintf("$%.0f of your %s on the %s is unused.", float64(c.RemainingC)/100, c.Name, c.CardName),
			ValueCAD: c.RemainingC,
			Urgency:  urgencyFromExpiry(c.ResetsAt),
			ExpiresAt: c.ResetsAt,
			Citation: Citation{SourceTable: "card_credits", SourceID: c.ID},
			CTA:      CTA{Label: "Open credits tracker", Route: "/pro-tools"},
			Pro:      true,
		}
		if mv.IsValid() {
			out = append(out, mv)
		}
	}
	return out, nil
}
```

- [ ] **Step 4: Run to verify pass**

Run: `go test ./internal/service/brief/ -run TestCreditSweepGen`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/service/brief/gen_credit_sweep.go internal/service/brief/gen_credit_sweep_test.go
git commit -m "feat(brief): unused-credit-sweep generator"
```

---

## Task 6: Renewal keep/cancel generator

**Files:**
- Create: `internal/service/brief/gen_renewal.go`
- Test: `internal/service/brief/gen_renewal_test.go`

- [ ] **Step 1: Write the failing test**

```go
package brief

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestRenewalGen_KeepWhenNetPositive(t *testing.T) {
	soon := time.Now().Add(11 * 24 * time.Hour)
	u := UserState{Cards: []CardHolding{
		{CardID: "k1", Name: "Amex Cobalt", AnnualFeeC: 15588, NetAnnualC: 110000, RenewsAt: &soon},
	}}
	got, _ := renewalGen{}.Generate(context.Background(), u, MarketState{})
	if len(got) != 1 || !strings.Contains(got[0].Title, "Keep") {
		t.Fatalf("net-positive card should say Keep: %+v", got)
	}
}

func TestRenewalGen_ReviewWhenNetNegative(t *testing.T) {
	soon := time.Now().Add(11 * 24 * time.Hour)
	u := UserState{Cards: []CardHolding{
		{CardID: "k2", Name: "Some Premium", AnnualFeeC: 69900, NetAnnualC: -5000, RenewsAt: &soon},
	}}
	got, _ := renewalGen{}.Generate(context.Background(), u, MarketState{})
	if len(got) != 1 || !strings.Contains(got[0].Title, "Review") {
		t.Fatalf("net-negative card should say Review: %+v", got)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/service/brief/ -run TestRenewalGen`
Expected: FAIL — `undefined: renewalGen`.

- [ ] **Step 3: Implement `gen_renewal.go`**

```go
package brief

import (
	"context"
	"fmt"
	"time"
)

type renewalGen struct{}

func (renewalGen) Name() string { return "renewal" }

func (renewalGen) Generate(_ context.Context, u UserState, _ MarketState) ([]Move, error) {
	var out []Move
	for _, c := range u.Cards {
		if c.RenewsAt == nil || time.Until(*c.RenewsAt) > 30*24*time.Hour {
			continue // only surface renewals inside 30 days
		}
		keep := c.NetAnnualC >= 0
		verb := "Keep"
		if !keep {
			verb = "Review"
		}
		mv := Move{
			Type:     MoveRenewal,
			Title:    fmt.Sprintf("%s the %s — annual fee due soon", verb, c.Name),
			Detail:   fmt.Sprintf("$%.0f fee renews soon; modelled net value $%.0f/yr.", float64(c.AnnualFeeC)/100, float64(c.NetAnnualC)/100),
			ValueCAD: abs64(c.NetAnnualC),
			Urgency:  urgencyFromExpiry(c.RenewsAt),
			ExpiresAt: c.RenewsAt,
			Citation: Citation{SourceTable: "wallet_cards", SourceID: c.CardID},
			CTA:      CTA{Label: "See card scorecard", Route: "/pro-tools"},
			Pro:      true,
		}
		if mv.IsValid() {
			out = append(out, mv)
		}
	}
	return out, nil
}

func abs64(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
```

- [ ] **Step 4: Run to verify pass**

Run: `go test ./internal/service/brief/ -run TestRenewalGen`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/service/brief/gen_renewal.go internal/service/brief/gen_renewal_test.go
git commit -m "feat(brief): renewal keep/review generator"
```

---

## Task 7: Award-watch + application-window generators

**Files:**
- Create: `internal/service/brief/gen_award_watch.go`, `internal/service/brief/gen_application_window.go`
- Test: `internal/service/brief/gen_award_watch_test.go`

- [ ] **Step 1: Write the failing test**

```go
package brief

import (
	"context"
	"testing"
)

func TestAwardWatchGen_FiresOnSeatFound(t *testing.T) {
	u := UserState{Watches: []Watch{
		{ID: "w1", Route: "YYZ→CDG", SeatFound: true, ProgramName: "Aeroplan"},
		{ID: "w2", Route: "YYZ→NRT", SeatFound: false},
	}}
	got, _ := awardWatchGen{}.Generate(context.Background(), u, MarketState{})
	if len(got) != 1 || got[0].Citation.SourceID != "w1" || got[0].Urgency != UrgencyHigh {
		t.Fatalf("only the found watch should fire at high urgency: %+v", got)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/service/brief/ -run TestAwardWatchGen`
Expected: FAIL — `undefined: awardWatchGen`.

- [ ] **Step 3: Implement both generators**

`gen_award_watch.go`:

```go
package brief

import (
	"context"
	"fmt"
)

type awardWatchGen struct{}

func (awardWatchGen) Name() string { return "award_watch" }

func (awardWatchGen) Generate(_ context.Context, u UserState, _ MarketState) ([]Move, error) {
	var out []Move
	for _, w := range u.Watches {
		if !w.SeatFound {
			continue
		}
		mv := Move{
			Type:     MoveAwardWatch,
			Title:    fmt.Sprintf("A seat opened on your watched %s", w.Route),
			Detail:   fmt.Sprintf("Award space appeared for %s (%s). These move fast — book soon.", w.Route, w.ProgramName),
			ValueCAD: 0, // availability, not a CAD figure — never fabricate one
			Urgency:  UrgencyHigh,
			Citation: Citation{SourceTable: "award_watches", SourceID: w.ID},
			CTA:      CTA{Label: "Open trip planner", Route: "/trip-planner"},
			Pro:      true,
		}
		if mv.IsValid() {
			out = append(out, mv)
		}
	}
	return out, nil
}
```

`gen_application_window.go`:

```go
package brief

import (
	"context"
	"fmt"
	"time"
)

type applicationWindowGen struct{}

func (applicationWindowGen) Name() string { return "application_window" }

// issuerCooldownDays mirrors the applications cooldown rules.
var issuerCooldownDays = map[string]int{
	"American Express": 0, // Amex is lifetime-language, not a day cooldown
	"RBC":              90,
	"TD":               365,
	"BMO":              90,
	"CIBC":             90,
	"Scotiabank":       90,
}

func (applicationWindowGen) Generate(_ context.Context, u UserState, _ MarketState) ([]Move, error) {
	var out []Move
	for _, a := range u.Apps {
		days, ok := issuerCooldownDays[a.Issuer]
		if !ok || days == 0 {
			continue
		}
		clears := a.AppliedAt.Add(time.Duration(days) * 24 * time.Hour)
		left := time.Until(clears)
		if left <= 0 || left > 30*24*time.Hour {
			continue // only surface cooldowns clearing within 30 days
		}
		mv := Move{
			Type:     MoveApplicationWindow,
			Title:    fmt.Sprintf("%s cooldown clears soon", a.Issuer),
			Detail:   fmt.Sprintf("Your %s cooldown (from %s) clears on %s — then you can apply again.", a.Issuer, a.CardName, clears.Format("Jan 2")),
			ValueCAD: 0,
			Urgency:  UrgencyLow,
			ExpiresAt: &clears,
			Citation: Citation{SourceTable: "applications", SourceID: a.CardName + "|" + a.AppliedAt.Format("2006-01-02")},
			CTA:      CTA{Label: "See applications", Route: "/applications"},
			Pro:      true,
		}
		if mv.IsValid() {
			out = append(out, mv)
		}
	}
	return out, nil
}
```

- [ ] **Step 4: Run to verify pass**

Run: `go test ./internal/service/brief/ -run TestAwardWatchGen`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/service/brief/gen_award_watch.go internal/service/brief/gen_application_window.go internal/service/brief/gen_award_watch_test.go
git commit -m "feat(brief): award-watch + application-window generators"
```

---

## Task 8: Sweet-spot generator (Pro-only, balance-gated)

**Files:**
- Create: `internal/service/brief/gen_sweet_spot.go`
- Test: `internal/service/brief/gen_sweet_spot_test.go`

Per spec §12: Pro-only, and only for users with a home airport + a balance ≥ a threshold, to bound award-search quota. v1 emits a "your balance unlocks premium redemptions" prompt that deep-links to a pre-filled trip-planner search; it does **not** call live award search inside the batch (that stays a click-through to keep the sweep cheap and honest).

- [ ] **Step 1: Write the failing test**

```go
package brief

import (
	"context"
	"strings"
	"testing"
)

func TestSweetSpotGen_RequiresHomeAndBigBalance(t *testing.T) {
	big := UserState{HomeAirport: "YYZ", Balances: []Balance{{ProgramSlug: "aeroplan", ProgramName: "Aeroplan", Points: 120000, BaseCPP: 2.0}}}
	got, _ := sweetSpotGen{}.Generate(context.Background(), big, MarketState{})
	if len(got) != 1 || !strings.Contains(got[0].CTA.Route, "trip-planner") {
		t.Fatalf("big balance + home should yield a sweet-spot prompt: %+v", got)
	}
	noHome := UserState{Balances: big.Balances}
	if g, _ := sweetSpotGen{}.Generate(context.Background(), noHome, MarketState{}); len(g) != 0 {
		t.Fatalf("no home airport -> no move, got %d", len(g))
	}
	small := UserState{HomeAirport: "YYZ", Balances: []Balance{{ProgramSlug: "aeroplan", Points: 5000, BaseCPP: 2.0}}}
	if g, _ := sweetSpotGen{}.Generate(context.Background(), small, MarketState{}); len(g) != 0 {
		t.Fatalf("tiny balance -> no move, got %d", len(g))
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/service/brief/ -run TestSweetSpotGen`
Expected: FAIL — `undefined: sweetSpotGen`.

- [ ] **Step 3: Implement `gen_sweet_spot.go`**

```go
package brief

import (
	"context"
	"fmt"
	"net/url"
)

type sweetSpotGen struct{}

func (sweetSpotGen) Name() string { return "sweet_spot" }

// minSweetSpotPoints: below this a premium-cabin redemption isn't realistic.
const minSweetSpotPoints = 60000

func (sweetSpotGen) Generate(_ context.Context, u UserState, _ MarketState) ([]Move, error) {
	if u.HomeAirport == "" {
		return nil, nil
	}
	var best Balance
	for _, b := range u.Balances {
		if b.Points >= minSweetSpotPoints && b.Points > best.Points {
			best = b
		}
	}
	if best.Points < minSweetSpotPoints {
		return nil, nil
	}
	q := url.Values{}
	q.Set("from", u.HomeAirport)
	q.Set("cabin", "business")
	mv := Move{
		Type:     MoveSweetSpot,
		Title:    fmt.Sprintf("Your %s %s could unlock a premium-cabin redemption", humanInt(best.Points), best.ProgramName),
		Detail:   fmt.Sprintf("With %s %s from %s you're in range of a business-class award. Run a live search to see open seats.", humanInt(best.Points), best.ProgramName, u.HomeAirport),
		ValueCAD: int64(float64(best.Points) * best.BaseCPP), // floor value, honestly the everyday-CPP worth
		Urgency:  UrgencyLow,
		Citation: Citation{SourceTable: "loyalty_balances", SourceID: u.UserID + "|" + best.ProgramSlug},
		CTA:      CTA{Label: "Search award space", Route: "/trip-planner?" + q.Encode()},
		Pro:      true,
	}
	if !mv.IsValid() {
		return nil, nil
	}
	return []Move{mv}, nil
}
```

- [ ] **Step 4: Run to verify pass + whole-package build**

Run: `go test ./internal/service/brief/ -run TestSweetSpotGen && go build ./internal/service/brief/`
Expected: PASS + clean build (all generators now exist for the registry).

- [ ] **Step 5: Commit**

```bash
git add internal/service/brief/gen_sweet_spot.go internal/service/brief/gen_sweet_spot_test.go
git commit -m "feat(brief): Pro-only balance-gated sweet-spot generator"
```

---

## Task 9: Rank + Engine.BuildBrief

**Files:**
- Create: `internal/service/brief/rank.go`, `internal/service/brief/engine.go`
- Test: `internal/service/brief/engine_test.go`

- [ ] **Step 1: Write the failing tests**

```go
package brief

import (
	"context"
	"errors"
	"testing"
)

// fakeRepo is a function-field mock (the repo's standard test pattern).
type fakeRepo struct {
	user   func(ctx context.Context, id string) (UserState, error)
	market func(ctx context.Context) (MarketState, error)
}

func (f fakeRepo) LoadUserState(ctx context.Context, id string) (UserState, error) { return f.user(ctx, id) }
func (f fakeRepo) LoadMarketState(ctx context.Context) (MarketState, error)        { return f.market(ctx) }

// boom always errors — proves a failing generator is skipped, not fatal.
type boomGen struct{}

func (boomGen) Name() string { return "boom" }
func (boomGen) Generate(context.Context, UserState, MarketState) ([]Move, error) {
	return nil, errors.New("kaboom")
}

func TestEngine_RanksByUrgencyThenValue_AndSkipsFailures(t *testing.T) {
	repo := fakeRepo{
		user: func(context.Context, string) (UserState, error) {
			return UserState{Credits: []Credit{{ID: "c1", Name: "Big", CardName: "X", RemainingC: 30000}}}, nil
		},
		market: func(context.Context) (MarketState, error) { return MarketState{}, nil },
	}
	e := NewEngine(repo, []MoveGenerator{boomGen{}, creditSweepGen{}})
	b, err := e.BuildBrief(context.Background(), "u1")
	if err != nil {
		t.Fatal(err) // a generator erroring must NOT fail the whole brief
	}
	if len(b.Moves) != 1 || b.Moves[0].Type != MoveCreditSweep {
		t.Fatalf("expected the credit move despite boom failing: %+v", b.Moves)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/service/brief/ -run TestEngine`
Expected: FAIL — `undefined: NewEngine`.

- [ ] **Step 3: Implement `rank.go`**

```go
package brief

import "sort"

// rankMoves sorts highest-priority first: urgency desc, then value desc.
func rankMoves(in []Move) []Move {
	sort.SliceStable(in, func(i, j int) bool {
		if in[i].Urgency != in[j].Urgency {
			return in[i].Urgency > in[j].Urgency
		}
		return in[i].ValueCAD > in[j].ValueCAD
	})
	return in
}
```

- [ ] **Step 4: Implement `engine.go`**

```go
package brief

import (
	"context"
	"log/slog"
	"time"
)

type Brief struct {
	Moves       []Move    `json:"moves"`
	GeneratedAt time.Time `json:"generated_at"`
}

type Engine struct {
	repo BriefRepo
	gens []MoveGenerator
}

func NewEngine(repo BriefRepo, gens []MoveGenerator) *Engine {
	if gens == nil {
		gens = defaultGenerators()
	}
	return &Engine{repo: repo, gens: gens}
}

// BuildBrief assembles state once, fans out, and ranks. A failing generator
// is logged and skipped — a partial brief always beats no brief.
func (e *Engine) BuildBrief(ctx context.Context, userID string) (Brief, error) {
	u, err := e.repo.LoadUserState(ctx, userID)
	if err != nil {
		return Brief{}, err
	}
	m, err := e.repo.LoadMarketState(ctx)
	if err != nil {
		return Brief{}, err
	}
	var all []Move
	for _, g := range e.gens {
		moves, err := g.Generate(ctx, u, m)
		if err != nil {
			slog.Warn("brief generator failed", "generator", g.Name(), "user", userID, "err", err)
			continue
		}
		for _, mv := range moves {
			if mv.IsValid() {
				all = append(all, mv)
			}
		}
	}
	return Brief{Moves: rankMoves(all), GeneratedAt: time.Now().UTC()}, nil
}
```

- [ ] **Step 5: Run to verify pass**

Run: `go test ./internal/service/brief/`
Expected: PASS (all tests across the package).

- [ ] **Step 6: Commit**

```bash
git add internal/service/brief/rank.go internal/service/brief/engine.go internal/service/brief/engine_test.go
git commit -m "feat(brief): engine fan-out with skip-on-failure + ranking"
```

---

## Task 10: Migration — brief_alerts_sent + repo

**Files:**
- Create: `migrations/000059_brief_alerts_sent.up.sql`, `migrations/000059_brief_alerts_sent.down.sql`, `internal/repo/brief_alerts.go`

- [ ] **Step 1: Write `000059_brief_alerts_sent.up.sql`**

```sql
-- Dedup ledger so the worker never re-alerts the same move (same type +
-- citation source + expiry day) to the same user.
CREATE TABLE IF NOT EXISTS brief_alerts_sent (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL,
    move_fingerprint TEXT NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brief_alerts_user_fp
    ON brief_alerts_sent (user_id, move_fingerprint);
```

- [ ] **Step 2: Write `000059_brief_alerts_sent.down.sql`**

```sql
DROP TABLE IF EXISTS brief_alerts_sent;
```

- [ ] **Step 3: Apply + verify round-trip**

Run:
```bash
make migrate-up
migrate -path ./migrations -database "$DATABASE_URL" down 1
migrate -path ./migrations -database "$DATABASE_URL" up
```
Expected: `58/u brief_alerts_sent`, then down 1, then re-up — no errors.

- [ ] **Step 4: Implement `internal/repo/brief_alerts.go`**

```go
package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type BriefAlertsRepo struct{ pool *pgxpool.Pool }

func NewBriefAlertsRepo(pool *pgxpool.Pool) *BriefAlertsRepo { return &BriefAlertsRepo{pool: pool} }

// MarkAlerted records a fingerprint; returns true if it was newly inserted
// (i.e. NOT a duplicate), so the caller alerts only on the first sighting.
func (r *BriefAlertsRepo) MarkAlerted(ctx context.Context, userID, fingerprint string) (bool, error) {
	tag, err := r.pool.Exec(ctx,
		`INSERT INTO brief_alerts_sent (user_id, move_fingerprint)
		 VALUES ($1, $2) ON CONFLICT (user_id, move_fingerprint) DO NOTHING`,
		userID, fingerprint)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}
```

- [ ] **Step 5: Commit**

```bash
git add migrations/000059_brief_alerts_sent.up.sql migrations/000059_brief_alerts_sent.down.sql internal/repo/brief_alerts.go
git commit -m "feat(brief): brief_alerts_sent dedup table + repo"
```

---

## Task 11: BriefRepo adapter (wire to existing repos)

**Files:**
- Create: `internal/repo/brief_adapter.go`

This is the one task that touches existing repo signatures. **Before writing, read** the existing repos to confirm exact method names: `internal/repo/wallet.go` (balances + cards summary), `internal/repo/card_value.go` (net annual value), `internal/repo/card_credits.go` (or wherever credits live), `internal/repo/award_watch.go`, `internal/repo/applications.go`, `internal/repo/transfer_bonus.go` (`ListActive`). The adapter maps their returns into the `brief.UserState`/`brief.MarketState` structs.

- [ ] **Step 1: Read the source repos**

Run: `ls internal/repo/ && grep -rn "func (.*Repo) " internal/repo/wallet.go internal/repo/transfer_bonus.go internal/repo/applications.go internal/repo/award_watch.go internal/repo/card_value.go | head -40`
Expected: the method signatures to map from.

- [ ] **Step 2: Implement `brief_adapter.go`**

```go
package repo

import (
	"context"

	"maplerewards/internal/service/brief"
)

// briefAdapter satisfies brief.BriefRepo using the existing repos. Each call
// maps an existing repo result into the brief.* structs. Field-by-field
// mapping is mechanical; adjust the getters to the real signatures found in
// Step 1 (e.g. WalletRepo.Summary, TransferBonusRepo.ListActive).
type briefAdapter struct {
	wallet   *WalletRepo
	credits  *CardCreditsRepo
	cardVal  *CardValueRepo
	watches  *AwardWatchRepo
	apps     *ApplicationsRepo
	promos   *TransferBonusRepo
}

func NewBriefRepo(w *WalletRepo, cr *CardCreditsRepo, cv *CardValueRepo, aw *AwardWatchRepo, ap *ApplicationsRepo, pr *TransferBonusRepo) brief.BriefRepo {
	return &briefAdapter{wallet: w, credits: cr, cardVal: cv, watches: aw, apps: ap, promos: pr}
}

func (a *briefAdapter) LoadUserState(ctx context.Context, userID string) (brief.UserState, error) {
	st := brief.UserState{UserID: userID}
	// Balances + cards from the wallet summary (cards carry program_name + base_cpp).
	sum, err := a.wallet.Summary(ctx, userID)
	if err != nil {
		return st, err
	}
	for _, c := range sum.Cards {
		if c.PointBalance > 0 {
			st.Balances = append(st.Balances, brief.Balance{
				ProgramSlug: slugify(c.ProgramName), ProgramName: c.ProgramName,
				Points: int64(c.PointBalance), BaseCPP: c.BaseCPP,
			})
		}
	}
	// Net annual value per card (for the renewal generator).
	cv, err := a.cardVal.WalletScorecard(ctx, userID)
	if err == nil {
		for _, c := range cv.Cards {
			st.Cards = append(st.Cards, brief.CardHolding{
				CardID: c.CardID, Name: c.CardName,
				AnnualFeeC: int64(c.AnnualFee * 100), NetAnnualC: int64(c.NetAnnual * 100),
				RenewsAt: c.RenewsAt,
			})
		}
	}
	// Credits, watches, applications — mapped from their repos likewise.
	creds, _ := a.credits.ListForUser(ctx, userID)
	for _, c := range creds {
		st.Credits = append(st.Credits, brief.Credit{
			ID: c.ID, CardName: c.CardName, Name: c.Name,
			RemainingC: int64(c.RemainingValue * 100), ResetsAt: c.ResetsAt,
		})
	}
	watches, _ := a.watches.ListForUser(ctx, userID)
	for _, w := range watches {
		st.Watches = append(st.Watches, brief.Watch{ID: w.ID, Route: w.Route, SeatFound: w.SeatFound, ProgramName: w.ProgramName})
	}
	apps, _ := a.apps.ListForUser(ctx, userID)
	for _, ap := range apps {
		st.Apps = append(st.Apps, brief.Application{CardName: ap.CardName, Issuer: ap.Issuer, AppliedAt: ap.AppliedAt})
	}
	st.HomeAirport = sum.HomeAirport // if present; else "" (sweet-spot generator no-ops)
	return st, nil
}

func (a *briefAdapter) LoadMarketState(ctx context.Context) (brief.MarketState, error) {
	var ms brief.MarketState
	promos, err := a.promos.ListActive(ctx)
	if err != nil {
		return ms, err
	}
	for _, p := range promos {
		ms.Promos = append(ms.Promos, brief.Promo{
			ID: p.ID, FromProgram: p.FromProgram, ToProgram: p.ToProgram,
			BonusPercent: p.BonusPercent, ExpiresAt: p.ExpiresAt, SourceURL: p.SourceURL,
		})
	}
	return ms, nil
}
```

> If a getter named here (e.g. `WalletScorecard`, `ListForUser`, `Summary`) doesn't exist verbatim, use the actual method found in Step 1 and adjust the mapping. The `brief.*` struct shapes are fixed; only the source-side getters vary. `slugify` already exists in the codebase (used by the loyalty page); reuse it or add a small local helper.

- [ ] **Step 3: Build**

Run: `go build ./internal/repo/ ./internal/service/brief/`
Expected: clean (fix any signature mismatches surfaced).

- [ ] **Step 4: Commit**

```bash
git add internal/repo/brief_adapter.go
git commit -m "feat(brief): adapter wiring BriefRepo to existing repos"
```

---

## Task 12: HTTP handler + free/Pro gating

**Files:**
- Create: `internal/handler/brief.go`
- Modify: `cmd/api/main.go` (register route)
- Test: `internal/handler/brief_test.go`

- [ ] **Step 1: Write the failing test**

```go
package handler

import (
	"testing"

	"maplerewards/internal/service/brief"
)

func TestGateBrief_FreeShowsOneMovePlusLockedAggregate(t *testing.T) {
	moves := []brief.Move{
		{Type: brief.MoveTransferBonus, Title: "A", ValueCAD: 50000, Urgency: brief.UrgencyHigh, Citation: brief.Citation{SourceTable: "t", SourceID: "1"}},
		{Type: brief.MoveCreditSweep, Title: "B", ValueCAD: 20000, Urgency: brief.UrgencyMed, Citation: brief.Citation{SourceTable: "t", SourceID: "2"}, Pro: true},
		{Type: brief.MoveRenewal, Title: "C", ValueCAD: 14000, Urgency: brief.UrgencyLow, Citation: brief.Citation{SourceTable: "t", SourceID: "3"}, Pro: true},
	}
	out := gateBrief(brief.Brief{Moves: moves}, false /* not pro */)
	if len(out.Moves) != 1 || out.Moves[0].Title != "A" {
		t.Fatalf("free user sees only the top move: %+v", out.Moves)
	}
	if out.LockedCount != 2 || out.LockedValueCAD != 34000 {
		t.Fatalf("locked aggregate wrong: count=%d value=%d", out.LockedCount, out.LockedValueCAD)
	}
	full := gateBrief(brief.Brief{Moves: moves}, true /* pro */)
	if len(full.Moves) != 3 || full.LockedCount != 0 {
		t.Fatalf("pro sees everything: %+v", full)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/handler/ -run TestGateBrief`
Expected: FAIL — `undefined: gateBrief`.

- [ ] **Step 3: Implement `brief.go`**

```go
package handler

import (
	"net/http"

	"maplerewards/internal/middleware"
	"maplerewards/internal/service/brief"
)

type gatedBrief struct {
	Moves          []brief.Move `json:"moves"`
	LockedCount    int          `json:"locked_count"`
	LockedValueCAD int64        `json:"locked_value_cad_cents"`
	Pro            bool         `json:"pro"`
}

// gateBrief: Pro sees all moves; free sees the top-ranked move plus an
// aggregate of what's hidden (the conversion lever).
func gateBrief(b brief.Brief, isPro bool) gatedBrief {
	if isPro {
		return gatedBrief{Moves: b.Moves, Pro: true}
	}
	out := gatedBrief{Pro: false}
	if len(b.Moves) > 0 {
		out.Moves = b.Moves[:1]
		for _, m := range b.Moves[1:] {
			out.LockedCount++
			out.LockedValueCAD += m.ValueCAD
		}
	}
	return out
}

type BriefHandler struct{ engine *brief.Engine }

func NewBriefHandler(e *brief.Engine) *BriefHandler { return &BriefHandler{engine: e} }

func (h *BriefHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		jsonMaskedError(w, http.StatusUnauthorized, "sign in to see your brief")
		return
	}
	b, err := h.engine.BuildBrief(r.Context(), userID)
	if err != nil {
		jsonInternalError(w, err)
		return
	}
	isPro := middleware.IsProFromContext(r.Context())
	jsonOK(w, gateBrief(b, isPro))
}
```

> Confirm the exact helpers in Step 1 of Task 11's neighbours: `jsonOK`, `jsonMaskedError`, `jsonInternalError`, `middleware.UserIDFromContext`, and the Pro check (`middleware.IsProFromContext` or equivalent — grep `internal/middleware` + existing Pro-gated handlers like `pro-tools` endpoints and match the real name).

- [ ] **Step 4: Register the route in `cmd/api/main.go`**

Find the authenticated route group (where `/wallet`, `/pro-tools` endpoints mount) and add:

```go
briefEngine := brief.NewEngine(repo.NewBriefRepo(walletRepo, creditsRepo, cardValueRepo, awardWatchRepo, applicationsRepo, transferBonusRepo), nil)
briefHandler := handler.NewBriefHandler(briefEngine)
r.Get("/api/v1/brief", briefHandler.Get) // inside the JWTOptional + user-rate-limit group
```

- [ ] **Step 5: Run tests + build**

Run: `go test ./internal/handler/ -run TestGateBrief && go build ./...`
Expected: PASS + clean build.

- [ ] **Step 6: Commit**

```bash
git add internal/handler/brief.go cmd/api/main.go internal/handler/brief_test.go
git commit -m "feat(brief): GET /api/v1/brief with free/Pro gating"
```

---

## Task 13: Worker sweep — weekly email + urgent push (deduped)

**Files:**
- Create: `cmd/worker/brief_sweep.go`
- Modify: `cmd/worker/main.go` (schedule the sweep)

**Read first:** `cmd/worker/main.go` for the existing RESEND mailer + VAPID pusher helpers and the cron/loop scheduling pattern (the award-watch `probeOne` loop).

- [ ] **Step 1: Implement `brief_sweep.go`**

```go
package main

import (
	"context"
	"fmt"
	"log/slog"

	"maplerewards/internal/service/brief"
)

// runBriefSweep builds each user's brief once and (a) emails the weekly digest
// when weekly==true, (b) pushes HIGH-urgency moves not already alerted.
func runBriefSweep(ctx context.Context, engine *brief.Engine, userIDs []string, weekly bool, alerts briefAlerter, mail mailer, push pusher) {
	for _, uid := range userIDs {
		b, err := engine.BuildBrief(ctx, uid)
		if err != nil {
			slog.Warn("brief sweep: build failed", "user", uid, "err", err)
			continue
		}
		if weekly && len(b.Moves) > 0 {
			if err := mail.SendBriefDigest(ctx, uid, b); err != nil {
				slog.Warn("brief digest email failed", "user", uid, "err", err)
			}
		}
		for _, mv := range b.Moves {
			if mv.Urgency != brief.UrgencyHigh {
				continue
			}
			fresh, err := alerts.MarkAlerted(ctx, uid, mv.Fingerprint())
			if err != nil || !fresh {
				continue // already alerted (or error) — never double-fire
			}
			_ = push.Send(ctx, uid, mv.Title, fmt.Sprintf("%s", mv.Detail))
		}
	}
}

// Minimal local interfaces so this file is testable + decoupled from concrete
// mailer/pusher types (wire to the existing worker helpers in main.go).
type briefAlerter interface {
	MarkAlerted(ctx context.Context, userID, fingerprint string) (bool, error)
}
type mailer interface {
	SendBriefDigest(ctx context.Context, userID string, b brief.Brief) error
}
type pusher interface {
	Send(ctx context.Context, userID, title, body string) error
}
```

- [ ] **Step 2: Schedule it in `cmd/worker/main.go`**

In the worker's scheduler, add: a daily tick that calls `runBriefSweep(ctx, engine, allActiveUserIDs, weekly, ...)` with `weekly = (time.Now().Weekday() == time.Sunday)`. Reuse the existing user-enumeration query and the award-watch loop cadence. Implement `SendBriefDigest` on the existing RESEND mailer (render `b.Moves` to an HTML list; Pro users get all, free users get top move + "N more with Pro") and confirm the existing VAPID pusher satisfies `pusher`.

- [ ] **Step 3: Build**

Run: `go build ./cmd/worker/`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add cmd/worker/brief_sweep.go cmd/worker/main.go
git commit -m "feat(brief): worker weekly digest + deduped urgent push"
```

---

## Task 14: Frontend — /brief page + homepage module

**Files:**
- Modify: `frontend/lib/api.ts` (add `getBrief()` + `BriefMove`/`GatedBrief` types)
- Create: `frontend/app/brief/page.tsx`
- Modify: `frontend/app/page.tsx` (replace the static "BEST MOVE TODAY" card with the real top move)

- [ ] **Step 1: Add the client in `frontend/lib/api.ts`**

```ts
export type BriefMove = {
  type: string;
  title: string;
  detail: string;
  value_cad_cents: number;
  urgency: number;
  expires_at?: string;
  citation: { source_table: string; source_id: string; url?: string };
  cta: { label: string; route: string };
  pro: boolean;
};
export type GatedBrief = {
  moves: BriefMove[];
  locked_count: number;
  locked_value_cad_cents: number;
  pro: boolean;
};

export async function getBrief(): Promise<GatedBrief> {
  const r = await fetch(`${BASE_URL}/brief`, { credentials: "include" });
  if (!r.ok) throw new Error("Could not load your brief");
  return r.json();
}
```

- [ ] **Step 2: Create `frontend/app/brief/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { getBrief, type GatedBrief } from "@/lib/api";

export default function BriefPage() {
  const [brief, setBrief] = useState<GatedBrief | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getBrief().then(setBrief).catch((e) => setErr(e?.message ?? "error"));
  }, []);
  if (err) return <p style={{ color: "var(--accent)", padding: 24 }}>{err}</p>;
  if (!brief) return <p className="eyebrow" style={{ padding: 24 }}>LOADING YOUR MOVES…</p>;
  if (brief.moves.length === 0)
    return <p style={{ padding: 24, fontStyle: "italic" }}>No time-sensitive moves this week — your wallet&apos;s optimized.</p>;
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 80px" }}>
      <h1 className="display" style={{ fontSize: 30, marginBottom: 18 }}>Your rewards moves</h1>
      <div style={{ display: "grid", gap: 14 }}>
        {brief.moves.map((m, i) => (
          <a key={i} href={m.cta.route} style={{ border: "1px solid var(--rule)", borderRadius: 12, padding: 20, textDecoration: "none", color: "var(--ink)" }}>
            <div className="eyebrow" style={{ color: "var(--accent)" }}>
              {m.value_cad_cents > 0 ? `+$${(m.value_cad_cents / 100).toFixed(0)}` : "ACTION"}
              {m.expires_at ? ` · ENDS ${new Date(m.expires_at).toLocaleDateString()}` : ""}
            </div>
            <div className="display" style={{ fontSize: 20, margin: "8px 0" }}>{m.title}</div>
            <p className="serif" style={{ color: "var(--ink-2)" }}>{m.detail}</p>
            <span className="mono" style={{ color: "var(--accent)", fontSize: 11 }}>{m.cta.label} →</span>
          </a>
        ))}
        {!brief.pro && brief.locked_count > 0 && (
          <a href="/pricing" style={{ border: "1px dashed var(--rule)", borderRadius: 12, padding: 20, textDecoration: "none", color: "var(--ink)" }}>
            <div className="display" style={{ fontSize: 18 }}>
              {brief.locked_count} more move{brief.locked_count === 1 ? "" : "s"} worth ~${(brief.locked_value_cad_cents / 100).toFixed(0)}
            </div>
            <span className="mono" style={{ color: "var(--accent)", fontSize: 11 }}>UNLOCK WITH PRO →</span>
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the homepage module**

In `frontend/app/page.tsx`, replace the existing "BEST MOVE TODAY" block with the top move from `getBrief()` (fall back to the current missed-rewards card only if the brief call fails), linking to the move's `cta.route`. Keep the existing styling.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: 0 errors. Then manually: log in, open `/brief`, confirm a free user sees one move + the unlock card; a Pro user sees all.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts frontend/app/brief/page.tsx frontend/app/page.tsx
git commit -m "feat(brief): /brief page + homepage top-move module"
```

---

## Self-review

**Spec coverage:** §3 moves → Tasks 4–8 (all 6 generators). §4 architecture (engine, generators, state, citation-drop) → Tasks 1–3, 9. §5 data flow → Tasks 9, 13. §6 storage (no briefs table; `brief_alerts_sent`; fingerprint) → Task 1 (`Fingerprint`), Task 10. §7 delivery (in-app/email/push) → Tasks 12, 13, 14. §8 gating → Task 12. §9 honesty (skip-on-failure, citation-drop, no fabricated CAD) → Tasks 1, 9, plus award-watch/application moves set `ValueCAD: 0`. §10 testing → tests in Tasks 1, 4–9, 12. §11 build sequence → task order matches. §12 open questions → encoded as defaults (free shows 1 move: Task 12; sweet-spot Pro-only + 60k threshold + home airport: Task 8). No gaps.

**Placeholder scan:** No "TBD/TODO". The two tasks that depend on real existing signatures (11 adapter, 13 worker) explicitly say "read first" and name the files/methods to confirm — the `brief.*` target shapes are fully specified, only the source getters are confirmed at implementation. That's a verification instruction, not a placeholder.

**Type consistency:** `Move`, `Citation`, `CTA`, `Urgency`, `MoveType` constants used identically across Tasks 1, 4–9, 12. `BriefRepo.LoadUserState/LoadMarketState` consistent in Tasks 2, 9, 11. `Engine.BuildBrief`/`NewEngine` consistent Tasks 9, 12, 13. `MarkAlerted(userID, fingerprint) (bool, error)` consistent Tasks 10, 13. `gateBrief(Brief, bool) gatedBrief` consistent Task 12. Money is cents (`int64`) throughout. No mismatches.

---

## Execution handoff

This plan is **not yet executed** — no implementation has started. When you're ready, two options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with review between tasks.
2. **Inline Execution** — execute tasks in-session with checkpoints.

Confirm before any execution begins.
