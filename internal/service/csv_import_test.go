package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

func TestCSVImport_RBC_SignedAmount(t *testing.T) {
	// RBC: single Amount column, debit = negative.
	csv := `Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$
Visa,1234,2026-04-12,,FRESHCO #123,,-87.45,
Visa,1234,2026-04-13,,PAYMENT - THANK YOU,,250.00,
Visa,1234,2026-04-15,,SHELL CANADA,,-52.10,`
	svc := NewCSVImportService(nil)
	preview, txns, err := svc.Parse(strings.NewReader(csv))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if preview.ParsedRows != 2 {
		t.Fatalf("expected 2 spend rows (credit ignored), got %d", preview.ParsedRows)
	}
	if txns[0].Amount != 87.45 {
		t.Fatalf("expected first amount 87.45, got %v", txns[0].Amount)
	}
	if txns[1].Amount != 52.10 {
		t.Fatalf("expected second amount 52.10, got %v", txns[1].Amount)
	}
}

func TestCSVImport_TD_DebitCreditColumns(t *testing.T) {
	// TD-style: separate Withdrawals + Deposits columns.
	csv := `Date,Description,Withdrawals,Deposits,Balance
2026-04-12,LOBLAWS #5601,124.50,,1500.00
2026-04-13,DIRECT DEPOSIT,,500.00,2000.00
2026-04-14,COSTCO WHOLESALE,238.99,,1761.01`
	svc := NewCSVImportService(nil)
	_, txns, err := svc.Parse(strings.NewReader(csv))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if len(txns) != 2 {
		t.Fatalf("expected 2 spend rows, got %d", len(txns))
	}
	if txns[0].Amount != 124.50 || txns[0].Description != "LOBLAWS #5601" {
		t.Fatalf("unexpected first txn: %+v", txns[0])
	}
}

func TestCSVImport_DateFormats(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"2026-04-12", "2026-04-12"},
		{"2026/04/12", "2026-04-12"},
		{"04/12/2026", "2026-04-12"},
		{"Apr 12, 2026", "2026-04-12"},
		{"12-Apr-2026", "2026-04-12"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			ts, err := parseDate(c.in)
			if err != nil {
				t.Fatalf("parseDate(%q) failed: %v", c.in, err)
			}
			if got := ts.Format("2006-01-02"); got != c.want {
				t.Fatalf("parseDate(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestCSVImport_MoneyFormats(t *testing.T) {
	cases := []struct {
		in      string
		want    float64
		wantCcy string
	}{
		{"$1,234.56", 1234.56, ""},
		{"1234.56", 1234.56, ""},
		{"(1,234.56)", -1234.56, ""},
		{"$0.99", 0.99, ""},
		{"-25.00", -25.00, ""},
		{"890.00 INR", 890.00, "INR"},
		{"31.26 USD", 31.26, "USD"},
		{"1,020.00 INR", 1020.00, "INR"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			v, ccy, err := parseMoney(c.in)
			if err != nil {
				t.Fatalf("parseMoney(%q) failed: %v", c.in, err)
			}
			if v != c.want {
				t.Fatalf("parseMoney(%q) = %v, want %v", c.in, v, c.want)
			}
			if ccy != c.wantCcy {
				t.Fatalf("parseMoney(%q) currency = %q, want %q", c.in, ccy, c.wantCcy)
			}
		})
	}
}

func TestCSVImport_RejectsCSVWithoutDateColumn(t *testing.T) {
	csv := `Description,Amount
COSTCO,-50`
	svc := NewCSVImportService(nil)
	_, _, err := svc.Parse(strings.NewReader(csv))
	if err == nil {
		t.Fatal("expected error when date column missing")
	}
}

func TestCSVImport_TolersateExtraSummaryRows(t *testing.T) {
	csv := `Date,Description,Amount
2026-04-12,COBALT GROCERY,-50.00
2026-04-13,SHELL,-25.00
TOTAL,,75.00`
	svc := NewCSVImportService(nil)
	preview, _, err := svc.Parse(strings.NewReader(csv))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	// "TOTAL" row has unparseable date — should be warned but not abort.
	if preview.ParsedRows != 2 {
		t.Fatalf("expected 2 spend rows, got %d (warnings: %v)", preview.ParsedRows, preview.Warnings)
	}
	if len(preview.Warnings) == 0 {
		t.Fatalf("expected at least one warning for bad date row")
	}
}

// ── Commit (atomic batched persist) ─────────────────────────────────────────
//
// These cover the production-hardening change: Commit now persists the whole
// import in ONE transaction via WalletService.LogSpendBatch →
// SpendRepository.RecordSpendBatch, instead of looping per-row LogSpend. The
// mocks below (function-field / map-backed, per .claude/rules/go-tests.md)
// stand in for the wallet/card/spend repos so we can drive Commit end-to-end.

const (
	csvTestSession = "sess-csv"
	csvTestUser    = "user-csv"
	csvTestCard    = "card-csv"
)

// csvSpendRepo models the transactional spend repo. RecordSpendBatch is the
// atomic boundary: it appends to `committed` ONLY if it processes every row
// without hitting failOnRow. When failOnRow >= 0 it returns an error and
// `committed` stays empty — exactly mirroring the real begin→insert→commit
// rolling back as a unit. `batchCalls` proves the batch path (not per-row
// RecordSpend) was taken; `rollbacks` counts simulated aborts.
type csvSpendRepo struct {
	mu         sync.Mutex
	committed  []repo.BatchSpendRow
	batchCalls int
	recordRows int // rows handed to RecordSpend (the OLD per-row path) — must stay 0
	rollbacks  int
	failOnRow  int // -1 = never fail
}

func (m *csvSpendRepo) GetMonthlySpend(context.Context, string, string, time.Time) (map[string]float64, error) {
	return map[string]float64{}, nil
}
func (m *csvSpendRepo) GetSpendSince(context.Context, string, string, time.Time) (map[string]float64, error) {
	return map[string]float64{}, nil
}
func (m *csvSpendRepo) UpsertMonthlySpend(context.Context, string, string, string, time.Time, float64) error {
	return nil
}
func (m *csvSpendRepo) GetCapGroupForCard(context.Context, string, string) (*model.CapGroup, error) {
	return nil, errors.New("no cap group")
}
func (m *csvSpendRepo) CreateSpendEntry(_ context.Context, e model.SpendEntry) (*model.SpendEntry, error) {
	return &e, nil
}
func (m *csvSpendRepo) RecordSpend(_ context.Context, e model.SpendEntry, _ time.Time, _ float64, _ bool) (*model.SpendEntry, error) {
	// The atomic import must NOT use the per-row path. Track any call so a
	// regression back to the loop is caught.
	m.mu.Lock()
	m.recordRows++
	m.mu.Unlock()
	return &e, nil
}
func (m *csvSpendRepo) RecordSpendBatch(_ context.Context, rows []repo.BatchSpendRow, _ bool) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.batchCalls++
	// Simulate a DB error mid-batch: the whole tx rolls back, nothing persists.
	if m.failOnRow >= 0 && m.failOnRow < len(rows) {
		m.rollbacks++
		return 0, errors.New("simulated db error on row")
	}
	m.committed = append(m.committed, rows...)
	return len(rows), nil
}
func (m *csvSpendRepo) ListSpendEntries(context.Context, string, int, int) ([]model.SpendEntry, error) {
	return nil, nil
}
func (m *csvSpendRepo) GetSpendStats(context.Context, string) (*model.SpendStats, error) {
	return &model.SpendStats{}, nil
}
func (m *csvSpendRepo) GetPointsSeries(context.Context, string, int) (*model.PointsSeries, error) {
	return &model.PointsSeries{Months: []model.PointsMonth{}}, nil
}

// csvWalletRepo: a session that owns exactly csvTestCard.
type csvWalletRepo struct{}

func (csvWalletRepo) CreateUser(context.Context, string) (*model.User, error) { return nil, nil }
func (csvWalletRepo) GetUserBySession(_ context.Context, sid string) (*model.User, error) {
	if sid != csvTestSession {
		return nil, nil
	}
	return &model.User{ID: csvTestUser, SessionID: sid}, nil
}
func (csvWalletRepo) GetUserCards(context.Context, string) ([]model.UserCard, error) {
	return []model.UserCard{{CardID: csvTestCard, UserID: csvTestUser}}, nil
}
func (csvWalletRepo) AddCard(context.Context, string, string) (*model.UserCard, error) {
	return nil, nil
}
func (csvWalletRepo) RemoveCard(context.Context, string, string) error { return nil }
func (csvWalletRepo) UpdateBalance(context.Context, string, string, int64) error {
	return nil
}
func (csvWalletRepo) UpdateCardDetails(context.Context, string, string, model.UpdateCardDetailsRequest) error {
	return nil
}

// csvCardRepo resolves any slug to a category and returns a simple cashback
// multiplier so buildSpendEntry computes a non-zero value.
type csvCardRepo struct{}

func (csvCardRepo) ListCards(context.Context) ([]model.Card, error) { return nil, nil }
func (csvCardRepo) GetCard(_ context.Context, id string) (*model.Card, error) {
	return &model.Card{ID: id, Name: "Test Card"}, nil
}
func (csvCardRepo) ListCategories(context.Context) ([]model.Category, error) { return nil, nil }
func (csvCardRepo) GetCategoryBySlug(_ context.Context, slug string) (*model.Category, error) {
	return &model.Category{ID: "cat-" + slug, Slug: slug, Name: slug}, nil
}
func (csvCardRepo) GetCategoryByMCC(context.Context, int) (*model.Category, error) {
	return nil, errors.New("n/a")
}
func (csvCardRepo) GetMultiplierForCard(context.Context, string, string) (*model.CardMultiplier, error) {
	return &model.CardMultiplier{EarnRate: 1, EarnType: "cashback_pct", FallbackEarnRate: 1}, nil
}
func (csvCardRepo) GetEverythingElseMultiplier(context.Context, string) (*model.CardMultiplier, error) {
	return &model.CardMultiplier{EarnRate: 1, EarnType: "cashback_pct", FallbackEarnRate: 1}, nil
}
func (csvCardRepo) ListMultipliersForCard(context.Context, string) ([]model.MultiplierRow, error) {
	return nil, nil
}
func (csvCardRepo) GetProgramBySlug(context.Context, string) (*model.LoyaltyProgram, error) {
	return nil, errors.New("n/a")
}

// csvNopCache always misses so GetWallet falls through to the repo.
type csvNopCache struct{}

func (csvNopCache) GetValuation(context.Context, string, string) (float64, error) {
	return 0, errors.New("miss")
}
func (csvNopCache) SetValuation(context.Context, string, string, float64) error { return nil }
func (csvNopCache) GetWallet(context.Context, string, any) error                { return errors.New("miss") }
func (csvNopCache) SetWallet(context.Context, string, any) error                { return nil }
func (csvNopCache) InvalidateWallet(context.Context, string) error              { return nil }

// newCSVCommitSvc wires a CSVImportService over a real WalletService backed by
// the mocks, with the supplied spend repo so a test can inject a batch failure.
func newCSVCommitSvc(spend *csvSpendRepo) *CSVImportService {
	wallet := NewWalletService(csvWalletRepo{}, csvCardRepo{}, spend, nil, csvNopCache{})
	return NewCSVImportService(wallet)
}

// (a) ATOMICITY: a DB error inside the batch rolls everything back — zero rows
// committed, Commit returns an error with created == 0, and the per-row path
// was never used.
func TestCSVImport_Commit_AtomicRollbackOnError(t *testing.T) {
	spend := &csvSpendRepo{failOnRow: 1} // fail as if row index 1 errored
	svc := newCSVCommitSvc(spend)

	txns := []ParsedTxn{
		{Date: "2026-04-12", Description: "FRESHCO", Amount: 50, Category: "groceries"},
		{Date: "2026-04-13", Description: "SHELL", Amount: 25, Category: "gas"},
		{Date: "2026-04-14", Description: "COSTCO", Amount: 80, Category: "groceries"},
	}
	created, err := svc.Commit(context.Background(), csvTestSession, csvTestCard, "", txns)
	if err == nil {
		t.Fatal("expected an error when the batch fails")
	}
	if created != 0 {
		t.Fatalf("all-or-nothing violated: created=%d, want 0", created)
	}
	if len(spend.committed) != 0 {
		t.Fatalf("rollback violated: %d rows persisted, want 0", len(spend.committed))
	}
	if spend.rollbacks != 1 {
		t.Fatalf("expected exactly 1 rolled-back batch, got %d", spend.rollbacks)
	}
	if spend.batchCalls != 1 {
		t.Fatalf("expected exactly 1 batch attempt (single tx), got %d", spend.batchCalls)
	}
	if spend.recordRows != 0 {
		t.Fatalf("per-row RecordSpend path must not be used; got %d calls", spend.recordRows)
	}
}

// (b) HAPPY PATH: all valid rows persist in ONE batch (one tx), not per-row.
func TestCSVImport_Commit_PersistsAllRowsInOneBatch(t *testing.T) {
	spend := &csvSpendRepo{failOnRow: -1}
	svc := newCSVCommitSvc(spend)

	txns := []ParsedTxn{
		{Date: "2026-04-12", Description: "FRESHCO", Amount: 50, Category: "groceries"},
		{Date: "2026-04-13", Description: "SHELL", Amount: 25, Category: "gas"},
		{Date: "2026-04-14", Description: "COSTCO", Amount: 80, Category: "groceries"},
	}
	created, err := svc.Commit(context.Background(), csvTestSession, csvTestCard, "", txns)
	if err != nil {
		t.Fatalf("commit failed: %v", err)
	}
	if created != 3 {
		t.Fatalf("expected 3 rows created, got %d", created)
	}
	if len(spend.committed) != 3 {
		t.Fatalf("expected 3 rows persisted, got %d", len(spend.committed))
	}
	if spend.batchCalls != 1 {
		t.Fatalf("expected exactly 1 batch (single tx for the whole import), got %d", spend.batchCalls)
	}
	if spend.recordRows != 0 {
		t.Fatalf("per-row RecordSpend path must not be used; got %d calls", spend.recordRows)
	}
	// Empty auto-category falls back to the supplied slug — verify the fallback
	// reaches the persisted rows.
	if got := spend.committed[0].Entry.CategorySlug; got != "groceries" {
		t.Fatalf("expected first row category 'groceries', got %q", got)
	}
}

// (b') FALLBACK CATEGORY: a row with an empty auto-category uses the supplied
// fallback slug.
func TestCSVImport_Commit_EmptyCategoryUsesFallback(t *testing.T) {
	spend := &csvSpendRepo{failOnRow: -1}
	svc := newCSVCommitSvc(spend)

	txns := []ParsedTxn{{Date: "2026-04-12", Description: "MYSTERY MERCHANT", Amount: 10, Category: ""}}
	created, err := svc.Commit(context.Background(), csvTestSession, csvTestCard, "everything-else", txns)
	if err != nil {
		t.Fatalf("commit failed: %v", err)
	}
	if created != 1 || len(spend.committed) != 1 {
		t.Fatalf("expected 1 row persisted, got created=%d committed=%d", created, len(spend.committed))
	}
	if got := spend.committed[0].Entry.CategorySlug; got != "everything-else" {
		t.Fatalf("expected fallback category 'everything-else', got %q", got)
	}
}

// (c) IDOR / validation unchanged: a card not in the wallet is rejected with
// ErrCardNotInWallet and nothing is persisted — identical to before.
func TestCSVImport_Commit_RejectsCardNotInWallet(t *testing.T) {
	spend := &csvSpendRepo{failOnRow: -1}
	svc := newCSVCommitSvc(spend)

	txns := []ParsedTxn{{Date: "2026-04-12", Description: "FRESHCO", Amount: 50, Category: "groceries"}}
	_, err := svc.Commit(context.Background(), csvTestSession, "some-other-card", "", txns)
	if !errors.Is(err, ErrCardNotInWallet) {
		t.Fatalf("expected ErrCardNotInWallet, got %v", err)
	}
	if len(spend.committed) != 0 || spend.batchCalls != 0 {
		t.Fatalf("nothing should persist for a non-owned card; committed=%d batchCalls=%d", len(spend.committed), spend.batchCalls)
	}
}

// (d) ROW CAP: more than maxCSVRows transactions are rejected before any DB
// write. (The handler/Parse cap a real upload; this is Commit's defense-in-depth.)
func TestCSVImport_Commit_RejectsOverCap(t *testing.T) {
	spend := &csvSpendRepo{failOnRow: -1}
	svc := newCSVCommitSvc(spend)

	txns := make([]ParsedTxn, maxCSVRows+1)
	for i := range txns {
		txns[i] = ParsedTxn{Date: "2026-04-12", Description: "X", Amount: 1, Category: "groceries"}
	}
	created, err := svc.Commit(context.Background(), csvTestSession, csvTestCard, "", txns)
	if err == nil {
		t.Fatalf("expected an over-cap rejection for %d rows", len(txns))
	}
	if created != 0 || len(spend.committed) != 0 || spend.batchCalls != 0 {
		t.Fatalf("over-cap import must not touch the DB; created=%d committed=%d batchCalls=%d", created, len(spend.committed), spend.batchCalls)
	}
	if !strings.Contains(err.Error(), "maximum") {
		t.Fatalf("expected a clear 'maximum' error, got %v", err)
	}
}

// (e) EMPTY FILE: zero transactions persist nothing and succeed with created=0
// (no spurious batch / tx).
func TestCSVImport_Commit_EmptyTxns(t *testing.T) {
	spend := &csvSpendRepo{failOnRow: -1}
	svc := newCSVCommitSvc(spend)

	created, err := svc.Commit(context.Background(), csvTestSession, csvTestCard, "", nil)
	if err != nil {
		t.Fatalf("empty import should not error, got %v", err)
	}
	if created != 0 {
		t.Fatalf("expected created=0 for empty import, got %d", created)
	}
	if spend.batchCalls != 0 || len(spend.committed) != 0 {
		t.Fatalf("empty import must not open a tx; batchCalls=%d committed=%d", spend.batchCalls, len(spend.committed))
	}
}

// Empty-FILE at the Parse layer (already covered by Parse tests for <2 rows,
// re-asserted here for the import flow): a header-only CSV yields no data rows.
func TestCSVImport_Parse_EmptyFileRejected(t *testing.T) {
	_, _, err := NewCSVImportService(nil).Parse(strings.NewReader("Date,Description,Amount\n"))
	if err == nil {
		t.Fatal("expected an error for a header-only (no data rows) CSV")
	}
}
