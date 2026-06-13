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

// Wallet mock — GetUserBySession + GetUserCards are exercised by the
// network-acceptance filter.
type mockStackWallet struct {
	cards []model.UserCard
}

func (m *mockStackWallet) CreateUser(context.Context, string) (*model.User, error) { return nil, nil }
func (m *mockStackWallet) GetUserBySession(context.Context, string) (*model.User, error) {
	return &model.User{ID: "u1"}, nil
}
func (m *mockStackWallet) GetUserCards(context.Context, string) ([]model.UserCard, error) {
	return m.cards, nil
}
func (m *mockStackWallet) AddCard(context.Context, string, string) (*model.UserCard, error) {
	return nil, nil
}
func (m *mockStackWallet) RemoveCard(context.Context, string, string) error { return nil }
func (m *mockStackWallet) UpdateBalance(context.Context, string, string, int64) error {
	return nil
}
func (m *mockStackWallet) UpdateCardDetails(context.Context, string, string, model.UpdateCardDetailsRequest) error {
	return nil
}

type mockStackOptimizer struct {
	recs []model.CardRecommendation
}

func (m *mockStackOptimizer) GetBestCard(context.Context, model.OptimizeRequest) ([]model.CardRecommendation, error) {
	return m.recs, nil
}

// TestStack_MerchantNetworkAcceptance proves P1-8: the stack recommender must
// never surface a card on a network the merchant doesn't accept. costco_ca
// (accepts_amex=false) must skip Amex Cobalt and fall through to the best
// accepted-network card.
func TestStack_MerchantNetworkAcceptance(t *testing.T) {
	wallet := &mockStackWallet{cards: []model.UserCard{
		{CardID: "c-cobalt", Card: &model.Card{ID: "c-cobalt", Name: "Amex Cobalt", Network: "amex"}},
		{CardID: "c-wem", Card: &model.Card{ID: "c-wem", Name: "BMO CashBack WE Mastercard", Network: "mastercard"}},
	}}
	optimizer := &mockStackOptimizer{recs: []model.CardRecommendation{
		{CardID: "c-cobalt", CardName: "Amex Cobalt", EffectiveReturn: 8.25, DollarValue: 8.25},
		{CardID: "c-wem", CardName: "BMO CashBack WE Mastercard", EffectiveReturn: 3.0, DollarValue: 3.0},
	}}
	svc := NewStackService(wallet, &mockStackRepo{
		merchant: &model.Merchant{
			Slug: "costco_ca", Name: "Costco (in-warehouse)", CategorySlug: "groceries",
			AcceptsAmex: false, AcceptsVisa: false, AcceptsMastercard: true,
		},
	}, optimizer)

	rec, err := svc.Recommend(context.Background(), model.StackRecommendRequest{
		MerchantSlug: "costco_ca", SpendAmount: 100, SessionID: "s1",
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if rec.BestCard == nil {
		t.Fatal("expected a best card from the accepted network, got none")
	}
	if rec.BestCard.CardName == "Amex Cobalt" {
		t.Errorf("costco_ca (accepts_amex=false) returned an Amex: %s", rec.BestCard.CardName)
	}
	if rec.BestCard.CardName != "BMO CashBack WE Mastercard" {
		t.Errorf("best card = %q, want the Mastercard fallback", rec.BestCard.CardName)
	}
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

// P5: with a VERIFIED per-offer max-credit (migration 000049), a %/points
// offer on large spend is clamped to the offer's real cap and the disclosure
// switches to the authoritative "(offer terms)" wording.
func TestStack_VerifiedOfferMaxCredit(t *testing.T) {
	maxCredit := 40.0
	svc := NewStackService(nil, &mockStackRepo{
		merchant: &model.Merchant{Slug: "lululemon", Name: "Lululemon"},
		offers: []model.NetworkOffer{
			{ID: "o1", Network: "amex", Merchant: "lululemon", Title: "20% back up to $40",
				RewardType: "merchant_discount", RewardValue: 20, MinSpend: 0,
				MaxCreditCAD: &maxCredit},
		},
	}, nil)

	rec, err := svc.Recommend(context.Background(), model.StackRecommendRequest{
		MerchantSlug: "lululemon", SpendAmount: 100000,
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if rec.TotalValueCAD > maxCredit+0.01 {
		t.Errorf("offer value %.2f exceeds verified max-credit $%.0f", rec.TotalValueCAD, maxCredit)
	}
	joined := strings.Join(rec.Warnings, " | ")
	if !strings.Contains(joined, "(offer terms)") {
		t.Errorf("expected authoritative '(offer terms)' wording, got: %s", joined)
	}
}
