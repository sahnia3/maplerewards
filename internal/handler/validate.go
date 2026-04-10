package handler

import (
	"regexp"
)

var (
	validSlugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,59}$`)
	validUUIDRegex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	validHexRegex  = regexp.MustCompile(`^[0-9a-f]{32}$`)
)

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
