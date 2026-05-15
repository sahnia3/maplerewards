package service

import (
	"context"
	"fmt"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// LoyaltyAccountService manages user-tracked loyalty balances for programs
// the user holds *without* a co-branded card in their wallet (Marriott
// Bonvoy, Hilton Honors, etc.). Card-tied balances live on user_cards and
// are unaffected.
//
// The service derives `days_to_expiry` and a human-readable rule note for
// each account so the /pro-tools tile can highlight at-risk balances. The
// derivation rules:
//
//   - If the user supplied an explicit expires_at, use it.
//   - Else if the program has an inactivity rule and the user supplied
//     last_activity, expires_at = last_activity + inactivity_months.
//   - Else expiry is unknown (rule note explains why).
type LoyaltyAccountService struct {
	walletRepo  WalletRepository
	accountRepo *repo.LoyaltyAccountRepo
}

func NewLoyaltyAccountService(walletRepo WalletRepository, accountRepo *repo.LoyaltyAccountRepo) *LoyaltyAccountService {
	return &LoyaltyAccountService{walletRepo: walletRepo, accountRepo: accountRepo}
}

func (s *LoyaltyAccountService) List(ctx context.Context, sessionID string) ([]model.LoyaltyAccount, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("session not found")
	}
	accounts, err := s.accountRepo.ListByUser(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	for i := range accounts {
		s.enrich(ctx, &accounts[i])
	}
	if accounts == nil {
		accounts = []model.LoyaltyAccount{}
	}
	return accounts, nil
}

func (s *LoyaltyAccountService) Create(ctx context.Context, sessionID string, req model.CreateLoyaltyAccountRequest) (*model.LoyaltyAccount, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("session not found")
	}
	if req.Balance < 0 {
		return nil, fmt.Errorf("balance must be ≥ 0")
	}
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		if _, err := time.Parse("2006-01-02", *req.ExpiresAt); err != nil {
			return nil, fmt.Errorf("expires_at must be YYYY-MM-DD")
		}
	}
	if req.LastActivity != nil && *req.LastActivity != "" {
		if _, err := time.Parse("2006-01-02", *req.LastActivity); err != nil {
			return nil, fmt.Errorf("last_activity must be YYYY-MM-DD")
		}
	}
	account, err := s.accountRepo.Create(ctx, user.ID, req)
	if err != nil {
		return nil, err
	}
	s.enrich(ctx, account)
	return account, nil
}

func (s *LoyaltyAccountService) Update(ctx context.Context, sessionID, accountID string, req model.UpdateLoyaltyAccountRequest) (*model.LoyaltyAccount, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("session not found")
	}
	account, err := s.accountRepo.Update(ctx, user.ID, accountID, req)
	if err != nil {
		return nil, err
	}
	s.enrich(ctx, account)
	return account, nil
}

func (s *LoyaltyAccountService) Delete(ctx context.Context, sessionID, accountID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return fmt.Errorf("session not found")
	}
	return s.accountRepo.Delete(ctx, user.ID, accountID)
}

// enrich populates the derived `days_to_expiry` + rule note. The DB write
// stays minimal so the user can update last_activity without us baking a
// stale expires_at into the row.
func (s *LoyaltyAccountService) enrich(ctx context.Context, a *model.LoyaltyAccount) {
	rule, _ := s.accountRepo.GetExpiryRule(ctx, a.ProgramSlug)

	// Compute effective expiry: explicit > derived from last_activity.
	var effective *time.Time
	if a.ExpiresAt != nil && *a.ExpiresAt != "" {
		if t, err := time.Parse("2006-01-02", *a.ExpiresAt); err == nil {
			effective = &t
		}
	}
	if effective == nil && rule != nil && rule.InactivityMonths != nil &&
		a.LastActivity != nil && *a.LastActivity != "" {
		if t, err := time.Parse("2006-01-02", *a.LastActivity); err == nil {
			derived := t.AddDate(0, *rule.InactivityMonths, 0)
			effective = &derived
			s := derived.Format("2006-01-02")
			a.ExpiresAt = &s
		}
	}

	if effective != nil {
		days := int(time.Until(*effective).Hours() / 24)
		a.DaysToExpiry = &days
	}

	if rule != nil {
		note := rule.Notes
		if note == "" && rule.InactivityMonths != nil {
			note = fmt.Sprintf("Expires %d months after last activity.", *rule.InactivityMonths)
		}
		if note == "" {
			note = "No published inactivity expiry."
		}
		a.ExpiryRuleNote = &note
	}
}
