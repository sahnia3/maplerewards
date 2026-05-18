package service

import (
	"context"
	"strings"
	"testing"

	"maplerewards/internal/model"
)

type mockStackRepo struct {
	merchant *model.Merchant
	offers   []model.NetworkOffer
}

func (m *mockStackRepo) ListMerchants(context.Context) ([]model.Merchant, error) {
	return nil, nil
}
func (m *mockStackRepo) GetMerchant(context.Context, string) (*model.Merchant, error) {
	return m.merchant, nil
}
func (m *mockStackRepo) BestPortalRate(context.Context, string) (*model.PortalRate, error) {
	return nil, nil
}
func (m *mockStackRepo) ActiveOffersForMerchant(context.Context, string) ([]model.NetworkOffer, error) {
	return m.offers, nil
}

// TestStack_OfferValueGuardrail proves the unbounded-projection guardrail:
// a "20% back" merchant_discount offer on $100k must NOT project a $20,000
// credit — real network offers cap the credit. CategorySlug/SessionID are
// empty so the optimizer/wallet layers are skipped; only the offer layer
// runs.
func TestStack_OfferValueGuardrail(t *testing.T) {
	svc := NewStackService(nil, &mockStackRepo{
		merchant: &model.Merchant{Slug: "lululemon", Name: "Lululemon"},
		offers: []model.NetworkOffer{
			{ID: "o1", Network: "amex", Merchant: "lululemon", Title: "20% back",
				RewardType: "merchant_discount", RewardValue: 20, MinSpend: 0},
		},
	}, nil)

	rec, err := svc.Recommend(context.Background(), model.StackRecommendRequest{
		MerchantSlug: "lululemon", SpendAmount: 100000,
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	// Unbounded bug would be 100000*20/100 = $20,000. Guardrail caps at $50.
	if rec.TotalValueCAD > defaultMaxOfferCreditCAD+0.01 {
		t.Errorf("offer value %.2f exceeds guardrail cap $%.0f — unbounded projection",
			rec.TotalValueCAD, defaultMaxOfferCreditCAD)
	}
	joined := strings.Join(rec.Warnings, " | ")
	if !strings.Contains(joined, "capped at") {
		t.Errorf("expected a cap-disclosure warning, got: %s", joined)
	}
}
