package handler

import (
	"regexp"
	"time"
)

var (
	validSlugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,59}$`)
	validUUIDRegex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	validHexRegex  = regexp.MustCompile(`^[0-9a-f]{32}$`)
	validIATARegex = regexp.MustCompile(`^[A-Za-z]{3}$`)
)

// isValidIATA reports whether s is a plausible 3-letter airport/IATA code.
// Used to gate user input BEFORE it is forwarded to paid external scrapers
// (Apify/Seats.aero/SerpAPI) — garbage input there burns metered quota.
func isValidIATA(s string) bool {
	return validIATARegex.MatchString(s)
}

// isValidFlightDate reports whether s is a YYYY-MM-DD date within a sane
// forward window (not in the past beyond a day, not absurdly far out).
func isValidFlightDate(s string) bool {
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		return false
	}
	now := time.Now()
	return d.After(now.AddDate(0, 0, -2)) && d.Before(now.AddDate(2, 0, 0))
}

func isValidSpendAmount(amount float64) bool {
	return amount >= 0.01 && amount <= 1_000_000
}

func isValidUUID(id string) bool {
	return validUUIDRegex.MatchString(id)
}

func isValidSessionID(id string) bool {
	return validHexRegex.MatchString(id)
}

func isValidSlug(slug string) bool {
	return validSlugRegex.MatchString(slug)
}
