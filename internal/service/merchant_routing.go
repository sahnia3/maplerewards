package service

import (
	"fmt"

	"maplerewards/internal/model"
)

// Merchant network-acceptance rules. This is the single most-upvoted
// r/PersonalFinanceCanada complaint ("I tried to use my Cobalt at Superstore
// and it got declined"): the optimizer would happily recommend an Amex for
// the Loblaws empire, where Amex isn't accepted at all.
//
// These are network-LEVEL constraints (which card networks a merchant's
// terminals accept), distinct from category multipliers. They're hardcoded,
// not table-driven, because they change rarely (a merchant's acquirer deal is
// a multi-year contract) and a code diff is the right audit trail for "why
// did the recommendation change."
//
// Sources: each merchant's published payment-methods page + r/PFC community
// confirmation, May 2026.

type MerchantRule struct {
	Slug             string   `json:"slug"`
	Label            string   `json:"label"`
	AcceptedNetworks []string `json:"accepted_networks"` // subset of {visa,mastercard,amex}; empty = all
	Note             string   `json:"note"`
}

// merchantRules is the authoritative map. Keys are the slugs the frontend +
// AI tool pass in req.Merchant.
var merchantNetworkRules = map[string]MerchantRule{
	"costco_ca": {
		Slug:             "costco_ca",
		Label:            "Costco (in-warehouse)",
		AcceptedNetworks: []string{"mastercard"},
		Note:             "Costco Canada has an exclusive Mastercard acquiring deal (since 2014). In-warehouse terminals accept Mastercard only — no Amex, no Visa.",
	},
	"costco_ca_online": {
		Slug:             "costco_ca_online",
		Label:            "Costco.ca (online)",
		AcceptedNetworks: []string{"mastercard", "visa"},
		Note:             "Costco.ca online checkout accepts Visa and Mastercard. Amex is still excluded.",
	},
	"loblaws": {
		Slug:  "loblaws",
		Label: "Loblaws empire (No Frills, Superstore, Shoppers, T&T, Zehrs, Fortinos, Provigo, Maxi, Independent)",
		// Loblaws Companies dropped Amex acceptance years ago across the
		// entire banner family. Visa + Mastercard only.
		AcceptedNetworks: []string{"visa", "mastercard"},
		Note:             "The Loblaws group (incl. Shoppers Drug Mart and T&T) does not accept American Express. Visa and Mastercard only.",
	},
}

// LookupMerchantRule returns the rule for a slug. ok=false means "no
// constraint — every network is accepted" (the common case).
func LookupMerchantRule(slug string) (MerchantRule, bool) {
	r, ok := merchantNetworkRules[slug]
	return r, ok
}

// AllMerchantRules returns every rule, for the /merchants endpoint and the
// frontend dropdown. Order is not guaranteed (map); callers that care should
// sort by Label.
func AllMerchantRules() []MerchantRule {
	out := make([]MerchantRule, 0, len(merchantNetworkRules))
	for _, r := range merchantNetworkRules {
		out = append(out, r)
	}
	return out
}

// filterByMerchantAcceptance drops cards whose network the merchant doesn't
// accept. Returns the surviving cards plus the applied rule (nil when no
// rule matched the slug). When the filter empties the wallet it returns a
// user-facing error explaining exactly why — silent zero-results here is
// the worst UX (the user thinks the product is broken, not that their card
// won't work at that store).
func filterByMerchantAcceptance(cards []model.UserCard, merchantSlug string) ([]model.UserCard, *MerchantRule, error) {
	rule, ok := merchantNetworkRules[merchantSlug]
	if !ok || len(rule.AcceptedNetworks) == 0 {
		return cards, nil, nil
	}

	accepted := make(map[string]bool, len(rule.AcceptedNetworks))
	for _, n := range rule.AcceptedNetworks {
		accepted[n] = true
	}

	filtered := cards[:0]
	for _, uc := range cards {
		if uc.Card != nil && accepted[uc.Card.Network] {
			filtered = append(filtered, uc)
		}
	}

	if len(filtered) == 0 {
		return nil, &rule, fmt.Errorf(
			"none of your cards work at %s — %s Add an eligible card or pay another way",
			rule.Label, rule.Note,
		)
	}
	return filtered, &rule, nil
}
