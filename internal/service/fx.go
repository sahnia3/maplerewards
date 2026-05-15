package service

import "strings"

// FX rate snapshot (units of CAD per 1 unit of foreign currency).
//
// These are intentionally hardcoded approximations — exact enough that an
// imported transaction shows up in roughly the right ballpark for missed-
// rewards calculation, NOT exact enough for accounting. Refresh quarterly
// from Bank of Canada rates (https://www.bankofcanada.ca/rates/exchange/)
// or wire to a live FX API if you need accuracy beyond ±2%.
//
// Snapshot date: 2026-05-11.
var fxRatesToCAD = map[string]float64{
	"CAD": 1.00,
	"USD": 1.36,
	"EUR": 1.45,
	"GBP": 1.70,
	"AUD": 0.88,
	"NZD": 0.81,
	"JPY": 0.0089,
	"CNY": 0.19,
	"HKD": 0.17,
	"SGD": 1.01,
	"INR": 0.0163,
	"AED": 0.37,
	"MXN": 0.067,
	"BRL": 0.27,
	"ZAR": 0.075,
	"CHF": 1.50,
	"SEK": 0.13,
	"NOK": 0.13,
	"DKK": 0.20,
	"THB": 0.040,
	"PHP": 0.024,
	"IDR": 0.000086,
	"KRW": 0.001,
	"TWD": 0.044,
}

// CurrencyToCAD converts an amount in the given currency to CAD using the
// snapshot rates above. Falls back to a 1:1 rate (and `false` for ok) when
// the currency is unknown — caller decides whether to skip the row or warn.
func CurrencyToCAD(amount float64, currency string) (cad float64, ok bool) {
	rate, ok := fxRatesToCAD[strings.ToUpper(strings.TrimSpace(currency))]
	if !ok {
		return amount, false
	}
	return amount * rate, true
}

// IsPaymentDescription returns true if the bank-statement description looks
// like a credit-card payment rather than a charge — used to skip non-spend
// rows regardless of which sign convention the issuer uses.
//
// We deliberately avoid bare words like "return", "refund", "adjustment",
// or "reversal" — they false-positive on legitimate merchant names (e.g.
// "Returns Inc" or "ADJUSTMENT GROUP CONSULTING"). Match only on phrases
// that are unambiguously credit-card-payment descriptors.
func IsPaymentDescription(d string) bool {
	d = strings.ToLower(strings.TrimSpace(d))
	if d == "" {
		return false
	}
	keywords := []string{
		"payment - thank you",
		"payment thank you",
		"payment received",                   // Amex CA wording
		"paiement merci",                     // FR Amex
		"thank you for your payment",
		"autopay",
		"online payment",
		"pre-authorized payment",
		"pre authorized payment",
		"electronic payment",
		"bill payment received",
		"credit balance refund",
		"interest credit",
		"returned payment",                   // payment reversal (NOT the same as a generic "return")
		"installment plan",                   // Amex installment is a reclassification, not a new charge
		"installment fee",
		"plan it fee",                        // Amex Plan It
	}
	for _, k := range keywords {
		if strings.Contains(d, k) {
			return true
		}
	}
	return false
}
