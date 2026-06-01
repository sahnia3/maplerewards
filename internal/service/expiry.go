package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// Repo dependencies are interfaces (DI per .claude/rules/go-service.md).
type expiryWalletRepo interface {
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
}

type expiryAccountRepo interface {
	ListByUser(ctx context.Context, userID string) ([]model.LoyaltyAccount, error)
}

type expiryRuleRepo interface {
	ListExpiryRules(ctx context.Context) ([]repo.ExpiryRule, error)
}

type expiryProgramRepo interface {
	ListPrograms(ctx context.Context) ([]model.LoyaltyProgram, error)
}

// ExpiryGuardianService warns when a user's tracked loyalty-program points are
// about to expire and tells them the cheapest way to reset the clock. Read-only
// over loyalty_accounts (balances + last activity), loyalty_expiry_rules (the
// per-program inactivity / fixed-expiry policy), and loyalty_programs.base_cpp
// (to value points-at-risk in CAD).
type ExpiryGuardianService struct {
	wallet   expiryWalletRepo
	accounts expiryAccountRepo
	rules    expiryRuleRepo
	programs expiryProgramRepo
}

func NewExpiryGuardianService(wallet expiryWalletRepo, accounts expiryAccountRepo, rules expiryRuleRepo, programs expiryProgramRepo) *ExpiryGuardianService {
	return &ExpiryGuardianService{wallet: wallet, accounts: accounts, rules: rules, programs: programs}
}

// Assess builds the points-expiry report for the wallet behind sessionID.
func (s *ExpiryGuardianService) Assess(ctx context.Context, sessionID string) (*model.ExpiryReport, error) {
	report := &model.ExpiryReport{GeneratedYear: time.Now().Year(), Accounts: []model.ExpiryAccount{}}

	user, err := s.wallet.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("expiry: lookup user: %w", err)
	}
	if user == nil {
		return report, nil
	}

	accounts, err := s.accounts.ListByUser(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("expiry: load accounts: %w", err)
	}
	rules, err := s.rules.ListExpiryRules(ctx)
	if err != nil {
		return nil, fmt.Errorf("expiry: load rules: %w", err)
	}
	programs, err := s.programs.ListPrograms(ctx)
	if err != nil {
		return nil, fmt.Errorf("expiry: load programs: %w", err)
	}

	ruleBySlug := make(map[string]repo.ExpiryRule, len(rules))
	for _, r := range rules {
		ruleBySlug[r.ProgramSlug] = r
	}
	cppBySlug := make(map[string]float64, len(programs))
	for _, p := range programs {
		cppBySlug[p.Slug] = p.BaseCPP
	}

	now := time.Now()
	for _, a := range accounts {
		rule, hasRule := ruleBySlug[a.ProgramSlug]

		effective := effectiveExpiry(a, rule, hasRule)
		var effStr *string
		var days *int
		if effective != nil {
			s := effective.Format("2006-01-02")
			effStr = &s
			d := int(math.Floor(effective.Sub(now).Hours() / 24))
			days = &d
		}

		atRisk := expiryRound(float64(a.Balance) * cppBySlug[a.ProgramSlug] / 100)
		risk := classifyExpiry(days)
		suggestion := resetSuggestion(rule, hasRule)

		report.Accounts = append(report.Accounts, model.ExpiryAccount{
			ProgramSlug:     a.ProgramSlug,
			ProgramName:     a.ProgramName,
			AccountLabel:    a.AccountLabel,
			Balance:         a.Balance,
			EffectiveExpiry: effStr,
			DaysToExpiry:    days,
			PointsAtRiskCAD: atRisk,
			Risk:            risk,
			ResetSuggestion: suggestion,
		})

		report.TotalPointsAtRiskCAD += atRisk
		if risk == "critical" || risk == "warning" {
			report.AccountsExpiringSoon++
		}
	}

	// Soonest expiry first; never-expiry (nil days) sorts last.
	sort.SliceStable(report.Accounts, func(i, j int) bool {
		di, dj := report.Accounts[i].DaysToExpiry, report.Accounts[j].DaysToExpiry
		switch {
		case di == nil && dj == nil:
			return false
		case di == nil:
			return false
		case dj == nil:
			return true
		default:
			return *di < *dj
		}
	})

	report.TotalPointsAtRiskCAD = expiryRound(report.TotalPointsAtRiskCAD)
	return report, nil
}

// effectiveExpiry derives the date a balance effectively expires: explicit
// expires_at wins; else last_activity + inactivity_months when the program is
// inactivity-based and we have a last-activity date; else nil (never expires).
func effectiveExpiry(a model.LoyaltyAccount, rule repo.ExpiryRule, hasRule bool) *time.Time {
	if a.ExpiresAt != nil && *a.ExpiresAt != "" {
		if t, err := time.Parse("2006-01-02", *a.ExpiresAt); err == nil {
			return &t
		}
	}
	if hasRule && rule.InactivityMonths != nil && a.LastActivity != nil && *a.LastActivity != "" {
		if t, err := time.Parse("2006-01-02", *a.LastActivity); err == nil {
			derived := t.AddDate(0, *rule.InactivityMonths, 0)
			return &derived
		}
	}
	return nil
}

// classifyExpiry buckets days-to-expiry into a risk band. nil days => never.
func classifyExpiry(days *int) string {
	if days == nil {
		return "none"
	}
	switch {
	case *days < 30:
		return "critical"
	case *days < 90:
		return "warning"
	case *days < 180:
		return "watch"
	default:
		return "ok"
	}
}

// resetSuggestion returns a factual, program-agnostic line on how to reset the
// expiry clock. No invented program-specific offers.
func resetSuggestion(rule repo.ExpiryRule, hasRule bool) string {
	if hasRule && rule.InactivityMonths != nil {
		return fmt.Sprintf("Any earn or redeem resets the %d-month clock.", *rule.InactivityMonths)
	}
	if hasRule && rule.FixedMonthsFromEarn != nil {
		return "Points expire on a fixed schedule — plan a redemption."
	}
	return "No published inactivity expiry — points do not lapse from inactivity."
}

func expiryRound(v float64) float64 { return math.Round(v*100) / 100 }
