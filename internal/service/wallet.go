package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type WalletService struct {
	walletRepo WalletRepository
	cardRepo   CardRepository
	spendRepo  SpendRepository
	bonusRepo  BonusRepository
	cache      ValuationCache
}

func NewWalletService(walletRepo WalletRepository, cardRepo CardRepository, spendRepo SpendRepository, bonusRepo BonusRepository, c ValuationCache) *WalletService {
	return &WalletService{walletRepo: walletRepo, cardRepo: cardRepo, spendRepo: spendRepo, bonusRepo: bonusRepo, cache: c}
}

// CreateWallet generates an anonymous session and persists it.
func (s *WalletService) CreateWallet(ctx context.Context) (*model.User, error) {
	sessionID, err := generateSessionID()
	if err != nil {
		return nil, err
	}
	return s.walletRepo.CreateUser(ctx, sessionID)
}

// GetWallet returns the user's cards, using Redis as a read-through cache.
func (s *WalletService) GetWallet(ctx context.Context, sessionID string) ([]model.UserCard, error) {
	var cached []model.UserCard
	if err := s.cache.GetWallet(ctx, sessionID, &cached); err == nil {
		return cached, nil
	}

	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("session not found")
	}
	cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	// Repopulate synchronously (a fast Redis SET) rather than in a detached
	// background goroutine. A detached repopulate could land arbitrarily late —
	// after a concurrent write's invalidation — and re-cache stale data for the
	// full TTL. Doing it inline bounds the write to this request so the cache
	// layer's delayed double-delete reliably clears any racing repopulate.
	_ = s.cache.SetWallet(ctx, sessionID, cards)
	return cards, nil
}

func (s *WalletService) AddCard(ctx context.Context, sessionID, cardID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("session lookup: %w", err)
	}
	if user == nil {
		return fmt.Errorf("session not found")
	}
	if _, err := s.walletRepo.AddCard(ctx, user.ID, cardID); err != nil {
		return err
	}
	s.invalidateWallet(ctx, sessionID)
	return nil
}

func (s *WalletService) RemoveCard(ctx context.Context, sessionID, cardID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("session not found")
	}
	if err := s.walletRepo.RemoveCard(ctx, user.ID, cardID); err != nil {
		return err
	}
	s.invalidateWallet(ctx, sessionID)
	return nil
}

func (s *WalletService) UpdateBalance(ctx context.Context, sessionID, cardID string, balance int64) error {
	if balance < 0 {
		return fmt.Errorf("point balance cannot be negative")
	}
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("session not found")
	}
	if err := s.walletRepo.UpdateBalance(ctx, user.ID, cardID, balance); err != nil {
		return err
	}
	s.invalidateWallet(ctx, sessionID)
	return nil
}

func (s *WalletService) UpdateCardDetails(ctx context.Context, sessionID, cardID string, req model.UpdateCardDetailsRequest) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("session not found")
	}
	if err := s.walletRepo.UpdateCardDetails(ctx, user.ID, cardID, req); err != nil {
		return err
	}
	s.invalidateWallet(ctx, sessionID)
	return nil
}

// invalidateWallet clears the wallet cache synchronously on the write path.
// Async (`go ...`) invalidation raced the client's post-save refetch and
// re-served the stale pre-edit balance — the P0.2 "shows 0 after refresh"
// symptom (docs/LAUNCH-ISSUES.md). The DB write already succeeded, so a
// cache-invalidation failure is logged (degrades to ≤TTL staleness) rather
// than failing the request.
func (s *WalletService) invalidateWallet(ctx context.Context, sessionID string) {
	if err := s.cache.InvalidateWallet(ctx, sessionID); err != nil {
		slog.Error("wallet cache invalidation failed", "session", sessionID, "err", err)
	}
}

// cappedPurchaseRate returns the cap-bounded effective earn rate for a single
// purchase of `amount` in `categoryID` on `cardID`, using per-purchase
// semantics (prior accumulated spend treated as 0). It mirrors the optimizer's
// scoreCard switch exactly — shared cap group, then per-multiplier cap, then
// the unconditional safety guardrail for multipliers with no modelled cap — so
// a persisted spend entry can never store an uncapped spend×rate, and the
// stored "actual" value stays consistent with the optimizer's "optimal".
func (s *WalletService) cappedPurchaseRate(ctx context.Context, cardID, categoryID string, amount float64, m *model.CardMultiplier) float64 {
	if cg, err := s.spendRepo.GetCapGroupForCard(ctx, cardID, categoryID); err == nil && cg != nil {
		rate, _, _ := calculateBlendedRate(amount, 0, cg.CapAmount, cg.CapPeriod, m.EarnRate, m.FallbackEarnRate)
		return rate
	}
	if m.CapAmount != nil && *m.CapAmount > 0 {
		rate, _, _ := calculateBlendedRate(amount, 0, *m.CapAmount, safeStr(m.CapPeriod), m.EarnRate, m.FallbackEarnRate)
		return rate
	}
	rate, _, _ := calculateBlendedRate(amount, 0, defaultUnverifiedAnnualCap, "annual", m.EarnRate, m.FallbackEarnRate)
	return rate
}

// LogSpend records a manual spend entry and updates monthly spend tracking for cap enforcement.
func (s *WalletService) LogSpend(ctx context.Context, sessionID string, req model.SpendLogRequest) (*model.SpendEntry, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("session not found")
	}

	entry, month, err := s.buildSpendEntry(ctx, user.ID, req)
	if err != nil {
		return nil, err
	}

	// Atomically insert the spend entry and, only if it is a genuinely new
	// row, increment the monthly cap aggregate and welcome-bonus tracker —
	// all in one transaction. Previously the two follow-up writes were
	// fire-and-forget goroutines on context.Background() with discarded
	// errors: a crash lost cap/bonus progress, a deduped re-import
	// double-counted both, and failures were silent. The bonus UPDATE is a
	// no-op when the card has no bonus row, so applyBonus simply tracks
	// whether bonus tracking is wired at all.
	saved, err := s.spendRepo.RecordSpend(ctx, entry, month, req.Amount, s.bonusRepo != nil)
	if err != nil {
		return nil, fmt.Errorf("failed to record spend: %w", err)
	}

	return saved, nil
}

// LogSpendBatch records many spend entries (one CSV import) in ONE transaction
// on ONE DB connection. It is the atomic, pool-safe replacement for looping
// LogSpend: looping opened a fresh per-row transaction (RecordSpend) and so a
// large file could pin the whole connection pool, while a mid-file failure left
// a partially-imported wallet. Here every accepted row is computed first, then
// the entire DB write runs through SpendRepository.RecordSpendBatch as a single
// begin→insert-all→commit (rolled back as a unit on any error).
//
// Per-row value math is identical to LogSpend (shared buildSpendEntry), so a
// row imported via CSV stores the same capped points/dollar value it would if
// logged manually. Returns the number of rows newly inserted (deduped rows are
// not counted), matching LogSpend's per-row created semantics.
func (s *WalletService) LogSpendBatch(ctx context.Context, sessionID string, reqs []model.SpendLogRequest) (int, error) {
	if len(reqs) == 0 {
		return 0, nil
	}
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return 0, fmt.Errorf("session not found: %w", err)
	}
	if user == nil {
		return 0, fmt.Errorf("session not found")
	}

	rows := make([]repo.BatchSpendRow, 0, len(reqs))
	for _, req := range reqs {
		entry, month, bErr := s.buildSpendEntry(ctx, user.ID, req)
		if bErr != nil {
			// Validation/computation happens before any DB write, so a bad
			// request aborts the import without persisting anything.
			return 0, bErr
		}
		rows = append(rows, repo.BatchSpendRow{Entry: entry, Month: month, BonusAmount: req.Amount})
	}

	created, err := s.spendRepo.RecordSpendBatch(ctx, rows, s.bonusRepo != nil)
	if err != nil {
		return 0, fmt.Errorf("failed to record spend batch: %w", err)
	}
	return created, nil
}

// buildSpendEntry resolves the category, parses/defaults the date, and computes
// the cap-bounded points/dollar value for a single spend request. Shared by
// LogSpend and LogSpendBatch so the per-row value math (and the round-on-write
// money discipline) can never drift between the manual and CSV paths. Returns
// the entry and its month bucket for the monthly-spend aggregate.
func (s *WalletService) buildSpendEntry(ctx context.Context, userID string, req model.SpendLogRequest) (model.SpendEntry, time.Time, error) {
	// Resolve category
	category, err := s.cardRepo.GetCategoryBySlug(ctx, req.CategorySlug)
	if err != nil {
		return model.SpendEntry{}, time.Time{}, fmt.Errorf("category %q not found: %w", req.CategorySlug, err)
	}

	// Parse date or default to today
	spentAt := time.Now().Format("2006-01-02")
	if req.Date != "" {
		if _, err := time.Parse("2006-01-02", req.Date); err != nil {
			return model.SpendEntry{}, time.Time{}, fmt.Errorf("invalid date format, use YYYY-MM-DD: %w", err)
		}
		spentAt = req.Date
	}

	// Compute points earned and dollar value using card multiplier + program CPP
	var pointsEarned, dollarValue float64
	if card, cardErr := s.cardRepo.GetCard(ctx, req.CardID); cardErr == nil && card != nil {
		multiplier, multErr := s.cardRepo.GetMultiplierForCard(ctx, req.CardID, category.ID)
		if multErr != nil {
			multiplier, _ = s.cardRepo.GetEverythingElseMultiplier(ctx, req.CardID)
		}
		if multiplier != nil {
			// Cap-bound the earn for THIS purchase (per-purchase semantics,
			// prior spend = 0) — identical to how the optimizer scores "best
			// card for this purchase" and the missed-rewards replay. Without
			// this, a single large entry persisted an uncapped spend×rate: the
			// same credibility-destroying over-projection the optimizer
			// remediation bounded, but on the write path, where the stored
			// value is shown to the user AND feeds the missed-rewards report.
			effRate := s.cappedPurchaseRate(ctx, req.CardID, category.ID, req.Amount, multiplier)
			if multiplier.EarnType == "cashback_pct" {
				// Cashback card: dollar value is direct %
				dollarValue = req.Amount * (effRate / 100)
				pointsEarned = 0
			} else {
				// Points / miles card
				pointsEarned = req.Amount * effRate
				cpp := 1.0 // default 1¢/pt
				if card.LoyaltyProgram != nil && card.LoyaltyProgram.BaseCPP > 0 {
					cpp = card.LoyaltyProgram.BaseCPP
				}
				dollarValue = pointsEarned * (cpp / 100)
			}
		}
	}

	// Round the derived dollar value to whole cents BEFORE persisting. Every
	// stored row is then exactly representable, so any later SUM (in SQL or
	// Go) stays clean — kills the "thousands of $0.10s sum to $X.0000001"
	// drift at its source rather than papering over it at display time.
	dollarValue = roundMoney(dollarValue)

	entry := model.SpendEntry{
		UserID:       userID,
		CardID:       req.CardID,
		CategoryID:   category.ID,
		CategorySlug: category.Slug,
		CategoryName: category.Name,
		Amount:       req.Amount,
		PointsEarned: pointsEarned,
		DollarValue:  dollarValue,
		SpentAt:      spentAt,
		Note:         req.Note,
	}

	parsedDate, _ := time.Parse("2006-01-02", spentAt)
	month := time.Date(parsedDate.Year(), parsedDate.Month(), 1, 0, 0, 0, 0, time.UTC)
	return entry, month, nil
}

// GetSpendHistory returns paginated spend entries for a user.
func (s *WalletService) GetSpendHistory(ctx context.Context, sessionID string, limit, offset int) ([]model.SpendEntry, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("session not found")
	}
	return s.spendRepo.ListSpendEntries(ctx, user.ID, limit, offset)
}

// GetSpendStats returns aggregated spend statistics for a user.
func (s *WalletService) GetSpendStats(ctx context.Context, sessionID string) (*model.SpendStats, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("session not found")
	}
	return s.spendRepo.GetSpendStats(ctx, user.ID)
}

func generateSessionID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
