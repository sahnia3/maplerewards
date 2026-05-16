package service

import (
	"strings"
	"testing"

	"maplerewards/internal/model"
)

func card(network string) model.UserCard {
	return model.UserCard{Card: &model.Card{Network: network}}
}

func TestMerchantRouting_CostcoFiltersToMastercard(t *testing.T) {
	wallet := []model.UserCard{card("amex"), card("visa"), card("mastercard")}
	got, rule, err := filterByMerchantAcceptance(wallet, "costco_ca")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rule == nil || rule.Slug != "costco_ca" {
		t.Fatal("expected the costco_ca rule to be returned")
	}
	if len(got) != 1 || got[0].Card.Network != "mastercard" {
		t.Fatalf("expected only the Mastercard to survive, got %d cards", len(got))
	}
}

func TestMerchantRouting_LoblawsExcludesAmexOnly(t *testing.T) {
	wallet := []model.UserCard{card("amex"), card("visa"), card("mastercard")}
	got, _, err := filterByMerchantAcceptance(wallet, "loblaws")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("Loblaws should keep Visa+MC, drop only Amex; got %d", len(got))
	}
	for _, c := range got {
		if c.Card.Network == "amex" {
			t.Fatal("Amex must be excluded at Loblaws")
		}
	}
}

func TestMerchantRouting_AmexOnlyWalletAtCostco_ClearError(t *testing.T) {
	wallet := []model.UserCard{card("amex"), card("visa")}
	_, _, err := filterByMerchantAcceptance(wallet, "costco_ca")
	if err == nil {
		t.Fatal("an Amex/Visa-only wallet at Costco must produce a clear error, not silent empty")
	}
	// The error must name the merchant so the UI message is actionable.
	if !strings.Contains(err.Error(), "Costco") {
		t.Fatalf("error should explain the Costco constraint, got: %v", err)
	}
}

func TestMerchantRouting_UnknownMerchant_NoFilter(t *testing.T) {
	wallet := []model.UserCard{card("amex"), card("visa"), card("mastercard")}
	got, rule, err := filterByMerchantAcceptance(wallet, "some-random-store")
	if err != nil || rule != nil {
		t.Fatalf("unknown merchant must be a no-op (no rule, no error), got rule=%v err=%v", rule, err)
	}
	if len(got) != 3 {
		t.Fatalf("unknown merchant must not filter the wallet, got %d", len(got))
	}
}

func TestMerchantRouting_CostcoOnlineAllowsVisaAndMC(t *testing.T) {
	wallet := []model.UserCard{card("amex"), card("visa"), card("mastercard")}
	got, _, err := filterByMerchantAcceptance(wallet, "costco_ca_online")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("Costco.ca online = Visa+MC, drop Amex; got %d", len(got))
	}
}

