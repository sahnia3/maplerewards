package service

import "math"

// Money discipline.
//
// The schema stores currency as NUMERIC(10,2) and Postgres SUM() over NUMERIC
// is exact — so DB-side aggregation does NOT drift. The drift the independent
// review flagged is real only where Go accumulates float64 in a loop
// (missed_rewards.go) or derives a value that's then re-summed.
//
// The proportionate fix (not a full int64-cents migration, which is a
// multi-day rewrite with real regression risk and ~zero value for a
// pre-launch product with no users): a single rounding helper applied at two
// boundaries —
//
//  1. ON WRITE: round per-entry computed dollar values to cents before they
//     hit the DB, so every stored row is exactly representable and any later
//     SUM stays clean.
//  2. ON DISPLAY: round derived ratios (avg return %, CPP) before they leave
//     the service.
//
// This consolidates the scattered `math.Round(x*100)/100` / `round2()`
// idioms (devaluation.go, trip.go, missed_rewards.go) into one named
// function. Documented tradeoff: if this product ever handles real
// money movement (it doesn't — it's advisory math on user-entered numbers),
// revisit with a decimal type.

// roundMoney rounds a CAD amount to whole cents (2 dp). Half-away-from-zero
// via math.Round, which is correct for display money.
func roundMoney(v float64) float64 {
	return math.Round(v*100) / 100
}

// roundPct rounds a percentage to 2 dp (e.g. effective-return display).
func roundPct(v float64) float64 {
	return math.Round(v*100) / 100
}
