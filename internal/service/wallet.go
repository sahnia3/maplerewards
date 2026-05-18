package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"maplerewards/internal/model"
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
	cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	go s.cache.SetWallet(context.Background(), sessionID, cards) //nolint:errcheck
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
	go s.cache.InvalidateWallet(context.Background(), sessionID) //nolint:errcheck
	return nil
}

func (s *WalletService) RemoveCard(ctx context.Context, sessionID, cardID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if err := s.walletRepo.RemoveCard(ctx, user.ID, cardID); err != nil {
		return err
	}
	go s.cache.InvalidateWallet(context.Background(), sessionID) //nolint:errcheck
	return nil
}

func (s *WalletService) UpdateBalance(ctx context.Context, sessionID, cardID string, balance int64) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if err := s.walletRepo.UpdateBalance(ctx, user.ID, cardID, balance); err != nil {
		return err
	}
	go s.cache.InvalidateWallet(context.Background(), sessionID) //nolint:errcheck
	return nil
}

func (s *WalletService) UpdateCardDetails(ctx context.Context, sessionID, cardID string, req model.UpdateCardDetailsRequest) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if err := s.walletRepo.UpdateCardDetails(ctx, user.ID, cardID, req); err != nil {
		return err
	}
	go s.cache.InvalidateWallet(context.Background(), sessionID) //nolint:errcheck
	return nil
}

// LogSpend records a manual spend entry and updates monthly spend tracking for cap enforcement.
func (s *WalletService) LogSpend(ctx context.Context, sessionID string, req model.SpendLogRequest) (*model.SpendEntry, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}

	// Resolve category
	category, err := s.cardRepo.GetCategoryBySlug(ctx, req.CategorySlug)
	if err != nil {
		return nil, fmt.Errorf("category %q not found: %w", req.CategorySlug, err)
	}

	// Parse date or default to today
	spentAt := time.Now().Format("2006-01-02")
	if req.Date != "" {
		if _, err := time.Parse("2006-01-02", req.Date); err != nil {
			return nil, fmt.Errorf("invalid date format, use YYYY-MM-DD: %w", err)
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
			earnRate := multiplier.EarnRate
			if multiplier.EarnType == "cashback_pct" {
				// Cashback card: dollar value is direct %
				dollarValue = req.Amount * (earnRate / 100)
				pointsEarned = 0
			} else {
				// Points / miles card
				pointsEarned = req.Amount * earnRate
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
		UserID:       user.ID,
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

	// Atomically insert the spend entry and, only if it is a genuinely new
	// row, increment the monthly cap aggregate and welcome-bonus tracker —
	// all in one transaction. Previously the two follow-up writes were
	// fire-and-forget goroutines on context.Background() with discarded
	// errors: a crash lost cap/bonus progress, a deduped re-import
	// double-counted both, and failures were silent. The bonus UPDATE is a
	// no-op when the card has no bonus row, so applyBonus simply tracks
	// whether bonus tracking is wired at all.
	parsedDate, _ := time.Parse("2006-01-02", spentAt)
	month := time.Date(parsedDate.Year(), parsedDate.Month(), 1, 0, 0, 0, 0, time.UTC)
	saved, err := s.spendRepo.RecordSpend(ctx, entry, month, req.Amount, s.bonusRepo != nil)
	if err != nil {
		return nil, fmt.Errorf("failed to record spend: %w", err)
	}

	return saved, nil
}

// GetSpendHistory returns paginated spend entries for a user.
func (s *WalletService) GetSpendHistory(ctx context.Context, sessionID string, limit, offset int) ([]model.SpendEntry, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	return s.spendRepo.ListSpendEntries(ctx, user.ID, limit, offset)
}

// GetSpendStats returns aggregated spend statistics for a user.
func (s *WalletService) GetSpendStats(ctx context.Context, sessionID string) (*model.SpendStats, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
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
