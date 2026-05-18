package service

import (
	"context"
	"strings"
	"testing"

	"maplerewards/internal/model"
)

type mockBuyPromoRepo struct{ promos []model.BuyPromo }

func (m *mockBuyPromoRepo) CurrentPromos(context.Context) ([]model.BuyPromo, error) {
	return m.promos, nil
}

func newBuyPointsTestSvc() *BuyPointsService {
	return NewBuyPointsService(&mockBuyPromoRepo{promos: []model.BuyPromo{
		{ProgramSlug: "aeroplan", PromoLabel: "Aeroplan 1.5¢ sale", BaseCentsPerPoint: 3.0, PromoCentsPerPoint: 1.5},
	}})
}

func TestBuyPoints_NormalBuyVerdict(t *testing.T) {
	svc := newBuyPointsTestSvc()
	v, err := svc.Evaluate(context.Background(), model.BuyPointsRequest{
		ProgramSlug: "aeroplan", PointsNeeded: 50000, CashAlternative: 1500,
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	// breakEven = 1500*100/50000 = 3.0¢ > promo 1.5¢ → buy.
	if v.Verdict != "buy" {
		t.Errorf("verdict: got %q want buy (rationale: %s)", v.Verdict, v.Rationale)
	}
}

// TestBuyPoints_ImpossibleQuantityGuardrail proves the safety guardrail:
// an un-purchasable quantity must NOT return a confident "buy" even when
// the per-point math is favourable — programs cap annual point purchases.
func TestBuyPoints_ImpossibleQuantityGuardrail(t *testing.T) {
	svc := newBuyPointsTestSvc()
	v, err := svc.Evaluate(context.Background(), model.BuyPointsRequest{
		ProgramSlug: "aeroplan", PointsNeeded: 2000000, CashAlternative: 60000,
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	// breakEven = 60000*100/2000000 = 3.0¢ > 1.5¢ → math says "buy", but
	// 2,000,000 pts is far over the annual purchase ceiling.
	if v.Verdict == "buy" {
		t.Errorf("guardrail failed: returned 'buy' for an un-purchasable 2,000,000-pt quantity")
	}
	if !strings.Contains(v.Rationale, "annual point-purchase limit") {
		t.Errorf("expected over-limit caveat in rationale, got: %s", v.Rationale)
	}
}

// P5: with a VERIFIED per-program ceiling (migration 000049), a quantity over
// the real cap must never return "buy" and must cite the published limit;
// a quantity under it with favourable math must still return "buy".
func TestBuyPoints_VerifiedPurchaseCeiling(t *testing.T) {
	cap := 100000 // Aeroplan published annual buy cap
	svc := NewBuyPointsService(&mockBuyPromoRepo{promos: []model.BuyPromo{{
		ProgramSlug: "aeroplan", PromoLabel: "Aeroplan sale",
		BaseCentsPerPoint: 3.0, PromoCentsPerPoint: 1.5,
		MaxPurchasablePerYear: &cap,
	}}})

	over, err := svc.Evaluate(context.Background(), model.BuyPointsRequest{
		ProgramSlug: "aeroplan", PointsNeeded: 150000, CashAlternative: 4500,
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if over.Verdict == "buy" {
		t.Errorf("over verified cap (150k > 100k) must not be 'buy'")
	}
	if !strings.Contains(over.Rationale, "published annual point-purchase limit") {
		t.Errorf("expected verified-cap wording, got: %s", over.Rationale)
	}

	under, err := svc.Evaluate(context.Background(), model.BuyPointsRequest{
		ProgramSlug: "aeroplan", PointsNeeded: 80000, CashAlternative: 2400,
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if under.Verdict != "buy" {
		t.Errorf("under verified cap with favourable math should be 'buy', got %q (%s)",
			under.Verdict, under.Rationale)
	}
}
