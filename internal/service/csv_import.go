package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"maplerewards/internal/model"
)

// CSVImportService parses bank-statement CSV exports into spend entries. The
// canonical Plaid/Flinks integration is gated on partner contracts; this
// service is the practical workaround that ships value today: any user can
// download their statement, drag it onto Maple, and get a missed-rewards
// report against the imported transactions.
//
// CSV format detection is lenient because Canadian banks all export
// differently. We look for any header that contains "date", "amount" /
// "withdrawals" / "debits", and "description" / "merchant" / "details".
type CSVImportService struct {
	walletSvc *WalletService
}

func NewCSVImportService(walletSvc *WalletService) *CSVImportService {
	return &CSVImportService{walletSvc: walletSvc}
}

// CSVImportPreview is what the API returns to the frontend before commit:
// detected columns, parsed row count, sample rows, plus any per-row warnings
// the user should know about.
type CSVImportPreview struct {
	DetectedColumns map[string]int    `json:"detected_columns"` // logical name → column index
	TotalRows       int               `json:"total_rows"`
	ParsedRows      int               `json:"parsed_rows"`
	Samples         []ParsedTxn       `json:"samples"`        // first 5
	Warnings        []string          `json:"warnings"`
}

type ParsedTxn struct {
	Date             string  `json:"date"`        // YYYY-MM-DD
	Description      string  `json:"description"`
	Amount           float64 `json:"amount"`      // CAD, always positive (spend)
	OriginalAmount   float64 `json:"original_amount,omitempty"`   // amount in source currency
	OriginalCurrency string  `json:"original_currency,omitempty"` // 'USD', 'INR', etc. — empty for CAD
	Category         string  `json:"category"`    // auto-derived via CategorizeMerchant
}

// Parse reads a CSV from the reader, returns a structured preview. Doesn't
// write anything to the DB — call Commit with the same parsed transactions
// to actually create spend entries.
func (s *CSVImportService) Parse(r io.Reader) (*CSVImportPreview, []ParsedTxn, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1 // tolerate inconsistent column counts

	rows, err := cr.ReadAll()
	if err != nil {
		return nil, nil, fmt.Errorf("read csv: %w", err)
	}
	if len(rows) < 2 {
		return nil, nil, fmt.Errorf("csv has no data rows")
	}

	cols := detectColumns(rows[0])
	dateIdx, ok := cols["date"]
	if !ok {
		return nil, nil, fmt.Errorf("could not find a 'date' column in the CSV header")
	}
	descIdx, ok := cols["description"]
	if !ok {
		return nil, nil, fmt.Errorf("could not find a 'description' column in the CSV header")
	}

	preview := &CSVImportPreview{
		DetectedColumns: cols,
		TotalRows:       len(rows) - 1,
		Samples:         []ParsedTxn{},
		Warnings:        []string{},
	}

	parsed := make([]ParsedTxn, 0, len(rows)-1)
	for i, row := range rows[1:] {
		// Defensive: bank exports occasionally append summary rows with
		// fewer columns than the header — skip silently.
		if dateIdx >= len(row) || descIdx >= len(row) {
			preview.Warnings = append(preview.Warnings, fmt.Sprintf("row %d: short row, skipped", i+2))
			continue
		}
		t, err := parseDate(row[dateIdx])
		if err != nil {
			preview.Warnings = append(preview.Warnings, fmt.Sprintf("row %d: unparseable date %q", i+2, row[dateIdx]))
			continue
		}
		desc := strings.TrimSpace(row[descIdx])

		// Skip credit-card payments / refunds / reversals regardless of which
		// sign convention the issuer uses (Amex CA: spend positive; RBC/Scotia:
		// spend negative). The description is the reliable signal.
		if IsPaymentDescription(desc) {
			preview.Warnings = append(preview.Warnings, fmt.Sprintf("row %d: skipped as payment/refund (%q)", i+2, truncateNote(desc, 50)))
			continue
		}

		rawAmt, currency, err := pickAmount(cols, row)
		if err != nil {
			preview.Warnings = append(preview.Warnings, fmt.Sprintf("row %d: %v", i+2, err))
			continue
		}
		if rawAmt == 0 {
			// Surface as warning so users see what's being dropped — common
			// cause is the detector picking a column that's empty for most rows
			// (e.g. "Foreign Currency Amount" instead of "Amount").
			preview.Warnings = append(preview.Warnings, fmt.Sprintf("row %d: empty amount column for %q — detector may have picked the wrong column", i+2, truncateNote(desc, 50)))
			continue
		}

		// Take absolute value — once payments are filtered by description, the
		// remaining rows are spend regardless of which convention the bank used.
		spend := rawAmt
		if spend < 0 {
			spend = -spend
		}

		// Convert to CAD if the row carries a foreign currency suffix.
		// Unknown currencies are warned and skipped — better than silently
		// recording a mis-valued transaction.
		amountCAD := spend
		original := 0.0
		originalCcy := ""
		if currency != "" && !strings.EqualFold(currency, "CAD") {
			cad, ok := CurrencyToCAD(spend, currency)
			if !ok {
				preview.Warnings = append(preview.Warnings, fmt.Sprintf("row %d: unknown currency %q — add to fxRatesToCAD", i+2, currency))
				continue
			}
			amountCAD = cad
			original = spend
			originalCcy = strings.ToUpper(currency)
		}

		parsed = append(parsed, ParsedTxn{
			Date:             t.Format("2006-01-02"),
			Description:      desc,
			Amount:           amountCAD,
			OriginalAmount:   original,
			OriginalCurrency: originalCcy,
			Category:         CategorizeMerchant(desc),
		})
	}

	preview.ParsedRows = len(parsed)
	if len(parsed) > 5 {
		preview.Samples = append([]ParsedTxn(nil), parsed[:5]...)
	} else {
		preview.Samples = append([]ParsedTxn(nil), parsed...)
	}

	return preview, parsed, nil
}

// ErrCardNotInWallet is returned by Commit when the supplied cardID isn't
// part of the session's wallet. Surfaces as 403 in the handler so users
// can't post spend against another user's card.
var ErrCardNotInWallet = fmt.Errorf("card not in wallet")

// Commit writes parsed transactions to spend_entries. Each row uses its
// auto-derived `Category` (from CategorizeMerchant) so the user doesn't pick
// a category for the whole CSV. WalletService.LogSpend computes points +
// dollar value per row using the card's multiplier for that category — those
// flow through to wallet/insights/portfolio automatically.
//
// IDOR fix: we verify cardID is actually in the session's wallet before
// writing anything. Otherwise a logged-in user could post spend rows
// against any card in the catalog and pollute another user's data
// (or pollute their own missed-rewards math by attributing spend to
// cards they don't hold).
//
// fallbackCategorySlug only kicks in when a row's auto-derived category is
// empty (defaults to "everything-else" server-side when omitted).
func (s *CSVImportService) Commit(ctx context.Context, sessionID, cardID, fallbackCategorySlug string, txns []ParsedTxn) (int, error) {
	if cardID == "" {
		return 0, fmt.Errorf("card_id required for import")
	}
	if fallbackCategorySlug == "" {
		fallbackCategorySlug = "everything-else"
	}

	// Verify cardID is in the session's wallet.
	cards, err := s.walletSvc.GetWallet(ctx, sessionID)
	if err != nil {
		return 0, fmt.Errorf("session not found: %w", err)
	}
	owned := false
	for _, c := range cards {
		if c.CardID == cardID {
			owned = true
			break
		}
	}
	if !owned {
		return 0, ErrCardNotInWallet
	}

	created := 0
	for _, t := range txns {
		category := t.Category
		if category == "" {
			category = fallbackCategorySlug
		}
		_, err := s.walletSvc.LogSpend(ctx, sessionID, model.SpendLogRequest{
			CardID:       cardID,
			CategorySlug: category,
			Amount:       t.Amount,
			Date:         t.Date,
			Note:         truncateNote(t.Description, 200),
		})
		if err != nil {
			// Stop on the first DB error so the user can see what broke.
			return created, fmt.Errorf("row %s/%s: %w", t.Date, t.Description, err)
		}
		created++
	}
	return created, nil
}

// ── Column detection ──────────────────────────────────────────────────────

// detectColumns picks one index per logical role (date/description/amount/etc.)
// from the CSV header. When a header matches multiple roles, more specific
// rules win. Critically: prefer a plain "Amount" column over any column with
// "foreign" or a currency-code suffix in its name — Amex CA exports often
// have BOTH and we want the CAD totals, not the foreign-currency originals.
func detectColumns(header []string) map[string]int {
	out := map[string]int{}
	// Track whether the chosen amount column was a "weak" fallback (foreign-
	// currency or currency-suffix header) so a stronger match later in the
	// header can override it.
	amountIsWeak := false

	for i, h := range header {
		h = strings.ToLower(strings.TrimSpace(h))
		switch {
		case contains(h, "date") || contains(h, "transaction date") || contains(h, "posting date"):
			if _, ok := out["date"]; !ok {
				out["date"] = i
			}
		case contains(h, "description") || contains(h, "details") || contains(h, "merchant") || contains(h, "narrative") || contains(h, "memo"):
			if _, ok := out["description"]; !ok {
				out["description"] = i
			}
		case contains(h, "amount") && !contains(h, "running"):
			isForeign := contains(h, "foreign") || contains(h, "original") || contains(h, "fx")
			if isForeign {
				// Only take this if we have nothing better yet.
				if _, ok := out["amount"]; !ok {
					out["amount"] = i
					amountIsWeak = true
				}
			} else {
				// Strong match — overrides any weak prior choice.
				out["amount"] = i
				amountIsWeak = false
			}
		case contains(h, "withdrawal") || contains(h, "debit") || contains(h, "spent"):
			out["debit"] = i
		case contains(h, "deposit") || contains(h, "credit") || contains(h, "received"):
			out["credit"] = i
		case h == "cad$" || h == "cad" || h == "amount cad" || h == "cad amount":
			// Strong CAD-amount column — always wins, since this is exactly
			// what we want to log.
			out["amount"] = i
			amountIsWeak = false
		case h == "usd$" || h == "usd":
			if _, ok := out["amount"]; !ok {
				out["amount"] = i
				amountIsWeak = true
			}
		case contains(h, "balance"):
			out["balance"] = i
		}
	}
	// Silence the "weak choice" tracking from the caller's perspective — it
	// only affects intra-detector overrides above.
	_ = amountIsWeak
	return out
}

func contains(haystack, needle string) bool {
	return strings.Contains(haystack, needle)
}

// pickAmount handles the Canadian-bank conventions:
//
//	1. Single signed Amount column (Amex CA: spend positive; RBC/Scotia/BMO:
//	   spend negative). The sign is returned as-is — the caller resolves
//	   the convention via the description (payment keyword) and abs().
//	2. Separate Withdrawals/Debits and Deposits/Credits columns (TD style).
//
// Returns the signed amount + currency code (empty string when the source
// is plain CAD with no suffix).
func pickAmount(cols map[string]int, row []string) (float64, string, error) {
	if di, ok := cols["debit"]; ok && di < len(row) && strings.TrimSpace(row[di]) != "" {
		v, ccy, err := parseMoney(row[di])
		if err == nil {
			return v, ccy, nil
		}
	}
	if ci, ok := cols["credit"]; ok && ci < len(row) && strings.TrimSpace(row[ci]) != "" {
		// Credit-only row — return 0 so caller filters it out.
		return 0, "", nil
	}
	if ai, ok := cols["amount"]; ok && ai < len(row) {
		raw := strings.TrimSpace(row[ai])
		if raw == "" {
			return 0, "", nil
		}
		v, ccy, err := parseMoney(raw)
		if err != nil {
			return 0, "", fmt.Errorf("unparseable amount %q", raw)
		}
		return v, ccy, nil
	}
	return 0, "", fmt.Errorf("no amount/debit column with a value")
}

// parseMoney handles "$1,234.56", "(1,234.56)" (parens for negative),
// "1234.56", "890.00 INR" (currency suffix), and plain integers. Returns
// the numeric value and the upper-cased currency code (empty when no
// recognisable suffix was present).
func parseMoney(s string) (float64, string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, "", fmt.Errorf("empty")
	}
	negative := false
	if strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")") {
		negative = true
		s = s[1 : len(s)-1]
	}

	// Strip and capture trailing 3-letter currency code, if any (Amex CA
	// emits "890.00 INR" / "31.26 USD" for foreign-currency transactions).
	currency := ""
	if len(s) >= 4 {
		tail := s[len(s)-3:]
		if isAlphaUpper(strings.ToUpper(tail)) && (s[len(s)-4] == ' ') {
			currency = strings.ToUpper(tail)
			s = strings.TrimSpace(s[:len(s)-4])
		}
	}

	s = strings.ReplaceAll(s, "$", "")
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, " ", "")
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, "", err
	}
	if negative {
		v = -v
	}
	return v, currency, nil
}

func isAlphaUpper(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < 'A' || r > 'Z' {
			return false
		}
	}
	return true
}

// parseDate accepts the common Canadian-bank formats.
func parseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	formats := []string{
		"2006-01-02",
		"2006/01/02",
		"01/02/2006",
		"02/01/2006",
		"01-02-2006",
		"02-01-2006",
		"Jan 02, 2006",
		"02-Jan-2006",
		"2-Jan-06",
		// Amex CA / RBC / Scotia statement variants — space-separated, no comma.
		"02 Jan 2006",
		"2 Jan 2006",
		"02 Jan 06",
		"2 Jan 06",
		"Jan 2 2006",
		"January 02, 2006",
		"January 2, 2006",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognised date format")
}

func truncateNote(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
