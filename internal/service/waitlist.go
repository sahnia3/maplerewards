package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"maplerewards/internal/repo"
)

// ErrInvalidWaitlistEmail is returned when the submitted email fails the
// format check. Handlers branch on it to return a 400 instead of a 500.
var ErrInvalidWaitlistEmail = errors.New("invalid email address")

// Pragmatic format check (no service-wide email helper exists to reuse):
// one @, no whitespace, and a dotted domain. Deliverability is proven by the
// launch email itself, not by the regex.
var waitlistEmailRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// WaitlistRepository abstracts waitlist_signups data access.
type WaitlistRepository interface {
	Insert(ctx context.Context, email, referralCode string, referredBy, source *string) (*repo.WaitlistSignup, bool, error)
	CountBefore(ctx context.Context, createdAt time.Time) (int, error)
	CountReferrals(ctx context.Context, code string) (int, error)
	CountTotal(ctx context.Context) (int, error)
	CodeExists(ctx context.Context, code string) (bool, error)
}

type WaitlistService struct {
	repo WaitlistRepository
}

func NewWaitlistService(r WaitlistRepository) *WaitlistService {
	return &WaitlistService{repo: r}
}

// WaitlistJoinResult is what the handler needs to render the success state.
// Created distinguishes a fresh signup (201) from an idempotent repeat (200).
type WaitlistJoinResult struct {
	Position      int
	ReferralCode  string
	ReferralCount int
	Total         int
	Created       bool
}

// Join adds an email to the waitlist (idempotently — a repeat email returns
// the original row's position and referral code) and resolves the optional
// ref code, crediting it only when it belongs to a real signup.
func (s *WaitlistService) Join(ctx context.Context, email, ref, source string) (*WaitlistJoinResult, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || len(email) > 254 || !waitlistEmailRe.MatchString(email) {
		return nil, ErrInvalidWaitlistEmail
	}

	// Resolve the referrer code. Invalid or unknown codes are dropped
	// silently — a bad ?ref= must never block a signup.
	var referredBy *string
	if code := strings.ToLower(strings.TrimSpace(ref)); code != "" {
		exists, err := s.repo.CodeExists(ctx, code)
		if err != nil {
			slog.Warn("waitlist: referral code lookup failed, ignoring ref", "err", err)
		} else if exists {
			referredBy = &code
		}
	}

	var sourcePtr *string
	if src := strings.TrimSpace(source); src != "" {
		if len(src) > 100 {
			src = src[:100]
		}
		sourcePtr = &src
	}

	// referral_code is 4 random bytes, so a unique-constraint collision is
	// possible (if vanishingly rare) — retry with a fresh code rather than
	// failing the signup. Email conflicts never error (ON CONFLICT DO
	// NOTHING returns the existing row), so any insert error here is either
	// a code collision or a genuine DB failure; one extra attempt is cheap
	// in both cases.
	var (
		row     *repo.WaitlistSignup
		created bool
		err     error
	)
	for attempt := 0; attempt < 3; attempt++ {
		var code string
		code, err = generateRandomHex(4) // 8 hex chars
		if err != nil {
			return nil, fmt.Errorf("generating referral code: %w", err)
		}
		row, created, err = s.repo.Insert(ctx, email, code, referredBy, sourcePtr)
		if err == nil {
			break
		}
		slog.Warn("waitlist: insert failed, retrying", "attempt", attempt+1, "err", err)
	}
	if err != nil {
		return nil, fmt.Errorf("inserting waitlist signup: %w", err)
	}

	before, err := s.repo.CountBefore(ctx, row.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("counting position: %w", err)
	}
	total, err := s.repo.CountTotal(ctx)
	if err != nil {
		return nil, fmt.Errorf("counting total: %w", err)
	}
	referrals, err := s.repo.CountReferrals(ctx, row.ReferralCode)
	if err != nil {
		return nil, fmt.Errorf("counting referrals: %w", err)
	}

	return &WaitlistJoinResult{
		Position:      before + 1,
		ReferralCode:  row.ReferralCode,
		ReferralCount: referrals,
		Total:         total,
		Created:       created,
	}, nil
}
