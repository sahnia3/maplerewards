package service

import (
	"context"
	"fmt"
	"time"

	"maplerewards/internal/repo"
)

// ApplicationService manages the user's card-application history and
// evaluates eligibility against per-issuer cooldown rules. The data model
// is conservative: rules are seeded from community-reported issuer policies,
// which means we warn but never block — a user who's confident the rule
// doesn't apply to them can still record a new application.
type ApplicationService struct {
	appRepo    *repo.ApplicationRepo
	walletRepo WalletRepository
	cardRepo   CardRepository
}

func NewApplicationService(appRepo *repo.ApplicationRepo, walletRepo WalletRepository, cardRepo CardRepository) *ApplicationService {
	return &ApplicationService{appRepo: appRepo, walletRepo: walletRepo, cardRepo: cardRepo}
}

// EligibilityResult is the per-card eligibility verdict for a specific user.
//
// Severity:
//   - "ok"      — no known issuer rule blocks an application today.
//   - "warn"    — within issuer cooldown; applying may be denied.
//   - "unknown" — we have no rule for this issuer; treat as ok with caveat.
type EligibilityResult struct {
	CardID      string     `json:"card_id"`
	Severity    string     `json:"severity"`
	Reason      string     `json:"reason"`
	EligibleAt  *time.Time `json:"eligible_at,omitempty"`
	LastAppliedAt *time.Time `json:"last_applied_at,omitempty"`
	IssuerRule  string     `json:"issuer_rule,omitempty"`
}

// CheckEligibility returns the eligibility verdict for a session+card pair.
// Treats anonymous sessions as "ok" since there's no history to check against.
func (s *ApplicationService) CheckEligibility(ctx context.Context, sessionID, cardID string) (*EligibilityResult, error) {
	res := &EligibilityResult{CardID: cardID, Severity: "ok", Reason: "No known restriction."}

	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session lookup: %w", err)
	}
	if user == nil {
		return res, nil
	}

	card, err := s.cardRepo.GetCard(ctx, cardID)
	if err != nil {
		return nil, fmt.Errorf("card lookup: %w", err)
	}
	if card == nil {
		return res, nil
	}

	rules, err := s.appRepo.ListIssuerRules(ctx)
	if err != nil {
		return nil, fmt.Errorf("rules lookup: %w", err)
	}
	var cooldownDays, maxPerYear int
	var cooldownNote, maxNote string
	for _, r := range rules {
		if r.Issuer != card.Issuer {
			continue
		}
		switch r.RuleType {
		case "cooldown_days":
			cooldownDays, cooldownNote = r.Value, r.Notes
		case "max_per_year":
			maxPerYear, maxNote = r.Value, r.Notes
		}
	}
	if cooldownDays == 0 && maxPerYear == 0 {
		res.Severity = "unknown"
		res.Reason = "No documented cooldown rule for " + card.Issuer + " — proceed at your own risk."
		return res, nil
	}

	// Cooldown rule — time since the last application to this issuer.
	if cooldownDays > 0 {
		last, err := s.appRepo.LastApplicationForIssuer(ctx, user.ID, card.Issuer)
		if err != nil {
			return nil, err
		}
		res.IssuerRule = cooldownNote
		if last.IsZero() {
			res.Reason = fmt.Sprintf("%s typically requires %d days between approvals. No prior application on file.", card.Issuer, cooldownDays)
		} else {
			res.LastAppliedAt = &last
			gap := time.Since(last)
			cooldown := time.Duration(cooldownDays) * 24 * time.Hour
			if gap < cooldown {
				eligibleAt := last.Add(cooldown)
				daysLeft := int(cooldown-gap)/int(24*time.Hour) + 1
				res.Severity = "warn"
				res.EligibleAt = &eligibleAt
				res.Reason = fmt.Sprintf("Last %s application was %d day(s) ago. The typical cooldown is %d days — wait ~%d more day(s) to clear it.",
					card.Issuer, int(gap.Hours()/24), cooldownDays, daysLeft)
			} else {
				res.Reason = fmt.Sprintf("Last %s application was %d day(s) ago — past the %d-day cooldown.",
					card.Issuer, int(gap.Hours()/24), cooldownDays)
			}
		}
	}

	// Max-per-year rule — applications to this issuer in the trailing 12 months.
	if maxPerYear > 0 {
		windowStart := time.Now().AddDate(-1, 0, 0)
		count, err := s.appRepo.CountApplicationsForIssuerSince(ctx, user.ID, card.Issuer, windowStart)
		if err != nil {
			return nil, err
		}
		if count >= maxPerYear {
			res.Severity = "warn"
			if maxNote != "" {
				res.IssuerRule = maxNote
			}
			res.Reason = fmt.Sprintf("You've recorded %d %s application(s) in the last 12 months; %s limits to ~%d per year. A new application now may be auto-declined.",
				count, card.Issuer, card.Issuer, maxPerYear)
		}
	}
	return res, nil
}

// List returns the user's full application history.
func (s *ApplicationService) List(ctx context.Context, sessionID string) ([]repo.CardApplication, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return []repo.CardApplication{}, nil
	}
	return s.appRepo.List(ctx, user.ID)
}

// Record persists a new application row.
func (s *ApplicationService) Record(ctx context.Context, sessionID, cardID, appliedAt, status, notes string) (*repo.CardApplication, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("session not found")
	}
	return s.appRepo.Create(ctx, user.ID, cardID, appliedAt, status, notes)
}

func (s *ApplicationService) Delete(ctx context.Context, sessionID, applicationID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("session not found")
	}
	return s.appRepo.Delete(ctx, user.ID, applicationID)
}
