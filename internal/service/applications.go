package service

import (
	"context"
	"fmt"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// applicationRepository abstracts the card-application data access the service
// needs (DI per .claude/rules/go-service.md "accept interfaces"). *repo.Application‑
// Repo satisfies it, so the main.go call site is unchanged; tests supply a
// function-field mock.
type applicationRepository interface {
	List(ctx context.Context, userID string) ([]repo.CardApplication, error)
	Create(ctx context.Context, userID, cardID, appliedAt, status, notes string) (*repo.CardApplication, error)
	Delete(ctx context.Context, userID, applicationID string) error
	ListIssuerRules(ctx context.Context) ([]repo.IssuerRule, error)
	LastApplicationForIssuer(ctx context.Context, userID, issuer string) (time.Time, error)
	CountApplicationsForIssuerSince(ctx context.Context, userID, issuer string, since time.Time) (int, error)
}

// ApplicationService manages the user's card-application history and
// evaluates eligibility against per-issuer cooldown rules. The data model
// is conservative: rules are seeded from community-reported issuer policies,
// which means we warn but never block — a user who's confident the rule
// doesn't apply to them can still record a new application.
type ApplicationService struct {
	appRepo    applicationRepository
	walletRepo WalletRepository
	cardRepo   CardRepository
}

func NewApplicationService(appRepo applicationRepository, walletRepo WalletRepository, cardRepo CardRepository) *ApplicationService {
	return &ApplicationService{appRepo: appRepo, walletRepo: walletRepo, cardRepo: cardRepo}
}

// EligibilityResult is the per-card eligibility verdict for a specific user.
//
// Severity:
//   - "ok"      — no known issuer rule blocks an application today.
//   - "warn"    — within issuer cooldown; applying may be denied.
//   - "unknown" — we have no rule for this issuer; treat as ok with caveat.
type EligibilityResult struct {
	CardID        string     `json:"card_id"`
	Severity      string     `json:"severity"`
	Reason        string     `json:"reason"`
	EligibleAt    *time.Time `json:"eligible_at,omitempty"`
	LastAppliedAt *time.Time `json:"last_applied_at,omitempty"`
	IssuerRule    string     `json:"issuer_rule,omitempty"`
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
	return s.evalEligibility(ctx, user.ID, card, rules)
}

// CheckEligibilityBatch returns the eligibility verdict for many cards under one
// session, fetching issuer rules ONCE and reusing the same per-card decision
// helper as CheckEligibility (no duplicated cooldown logic). Used by the churn
// planner to avoid re-loading the rules table per catalog candidate. Results are
// keyed by card id; an anonymous session yields an "ok" verdict for every card.
func (s *ApplicationService) CheckEligibilityBatch(ctx context.Context, sessionID string, cardIDs []string) (map[string]*EligibilityResult, error) {
	out := make(map[string]*EligibilityResult, len(cardIDs))

	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session lookup: %w", err)
	}
	if user == nil {
		for _, id := range cardIDs {
			out[id] = &EligibilityResult{CardID: id, Severity: "ok", Reason: "No known restriction."}
		}
		return out, nil
	}

	// Rules table loaded ONCE for the whole batch (the N+1 churn was paying for).
	rules, err := s.appRepo.ListIssuerRules(ctx)
	if err != nil {
		return nil, fmt.Errorf("rules lookup: %w", err)
	}

	for _, cardID := range cardIDs {
		card, err := s.cardRepo.GetCard(ctx, cardID)
		if err != nil {
			return nil, fmt.Errorf("card lookup: %w", err)
		}
		if card == nil {
			out[cardID] = &EligibilityResult{CardID: cardID, Severity: "ok", Reason: "No known restriction."}
			continue
		}
		res, err := s.evalEligibility(ctx, user.ID, card, rules)
		if err != nil {
			return nil, err
		}
		out[cardID] = res
	}
	return out, nil
}

// evalEligibility applies the issuer cooldown / max-per-year rules to one card
// for one user, given the already-loaded rules table. This is the single source
// of the cooldown decision shared by CheckEligibility and CheckEligibilityBatch.
func (s *ApplicationService) evalEligibility(ctx context.Context, userID string, card *model.Card, rules []repo.IssuerRule) (*EligibilityResult, error) {
	res := &EligibilityResult{CardID: card.ID, Severity: "ok", Reason: "No known restriction."}

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
		last, err := s.appRepo.LastApplicationForIssuer(ctx, userID, card.Issuer)
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
				// Ceiling of remaining time in days; the old floor+1 over-reported
				// by a day when the remainder was an exact multiple of 24h.
				day := 24 * time.Hour
				daysLeft := int((cooldown - gap + day - 1) / day)
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
		count, err := s.appRepo.CountApplicationsForIssuerSince(ctx, userID, card.Issuer, windowStart)
		if err != nil {
			return nil, err
		}
		if count >= maxPerYear {
			if maxNote != "" {
				res.IssuerRule = maxNote
			}
			maxReason := fmt.Sprintf("You've recorded %d %s application(s) in the last 12 months; %s limits to ~%d per year. A new application now may be auto-declined.",
				count, card.Issuer, card.Issuer, maxPerYear)
			if res.EligibleAt != nil {
				// Cooldown also fired (within-window warn): keep BOTH reasons so the
				// binding constraint stays visible, and the cooldown EligibleAt
				// remains a valid earliest-clear lower bound (no longer a mismatch).
				res.Reason = res.Reason + " " + maxReason
			} else {
				res.Reason = maxReason
			}
			res.Severity = "warn"
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
