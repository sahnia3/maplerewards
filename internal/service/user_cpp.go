package service

import (
	"context"
	"fmt"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// userCPPWalletRepo is the minimal wallet surface the service needs to resolve a
// session to its owning user (DI per .claude/rules/go-service.md).
type userCPPWalletRepo interface {
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
}

// userCPPStore is the repo surface for per-user CPP overrides. Satisfied by
// repo.UserCPPRepo.
type userCPPStore interface {
	ListByUser(ctx context.Context, userID string) ([]repo.UserCPP, error)
	Upsert(ctx context.Context, userID, programSlug, segment string, cppCAD float64) (*repo.UserCPP, error)
	Delete(ctx context.Context, userID, programSlug, segment string) error
	LookupCPP(ctx context.Context, userID, programSlug, segment string) (float64, bool, error)
}

// programLister lets the service validate a submitted program_slug against the
// active catalog so a user can't seed an override for a program we don't price.
type userCPPProgramRepo interface {
	ListPrograms(ctx context.Context) ([]model.LoyaltyProgram, error)
}

// UserCPPOverride is the API-facing shape of one override.
type UserCPPOverride struct {
	ProgramSlug string  `json:"program_slug"`
	ProgramName string  `json:"program_name,omitempty"`
	Segment     string  `json:"segment"`
	CPPCAD      float64 `json:"cpp_cad"`
}

// maxUserCPP bounds a submitted value. No real Canadian points currency is worth
// more than a few cents per point; a value above this is a fat-finger or an
// attempt to poison the engine math, so reject it.
const maxUserCPP = 100.0

// UserCPPService manages a signed-in user's custom CPP overrides and exposes the
// "prefer user_cpp, fall back to base" lookup the value engines consult.
type UserCPPService struct {
	wallet  userCPPWalletRepo
	store   userCPPStore
	program userCPPProgramRepo
}

func NewUserCPPService(wallet userCPPWalletRepo, store userCPPStore, program userCPPProgramRepo) *UserCPPService {
	return &UserCPPService{wallet: wallet, store: store, program: program}
}

// List returns every override the session's user holds, enriched with the
// program display name where the slug is in the active catalog.
func (s *UserCPPService) List(ctx context.Context, sessionID string) ([]UserCPPOverride, error) {
	userID, err := s.resolveUser(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	rows, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	names := s.programNames(ctx)
	out := make([]UserCPPOverride, 0, len(rows))
	for _, r := range rows {
		out = append(out, UserCPPOverride{
			ProgramSlug: r.ProgramSlug,
			ProgramName: names[r.ProgramSlug],
			Segment:     r.Segment,
			CPPCAD:      r.CPPCAD,
		})
	}
	return out, nil
}

// Set creates or replaces one override. segment defaults to "base". The value is
// supplied by the user — we validate the range and the program, but invent
// nothing.
func (s *UserCPPService) Set(ctx context.Context, sessionID, programSlug, segment string, cppCAD float64) (*UserCPPOverride, error) {
	userID, err := s.resolveUser(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if programSlug == "" {
		return nil, fmt.Errorf("program_slug required")
	}
	if segment == "" {
		segment = "base"
	}
	if cppCAD < 0 || cppCAD > maxUserCPP {
		return nil, fmt.Errorf("cpp_cad must be between 0 and %g", maxUserCPP)
	}
	// Only allow overrides for programs we actually price, so the value lands
	// somewhere the engines will read it.
	names := s.programNames(ctx)
	name, ok := names[programSlug]
	if !ok {
		return nil, fmt.Errorf("unknown program_slug")
	}
	row, err := s.store.Upsert(ctx, userID, programSlug, segment, cppCAD)
	if err != nil {
		return nil, err
	}
	return &UserCPPOverride{
		ProgramSlug: row.ProgramSlug,
		ProgramName: name,
		Segment:     row.Segment,
		CPPCAD:      row.CPPCAD,
	}, nil
}

// Delete removes one override.
func (s *UserCPPService) Delete(ctx context.Context, sessionID, programSlug, segment string) error {
	userID, err := s.resolveUser(ctx, sessionID)
	if err != nil {
		return err
	}
	if segment == "" {
		segment = "base"
	}
	return s.store.Delete(ctx, userID, programSlug, segment)
}

func (s *UserCPPService) resolveUser(ctx context.Context, sessionID string) (string, error) {
	user, err := s.wallet.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return "", fmt.Errorf("session not found")
	}
	return user.ID, nil
}

func (s *UserCPPService) programNames(ctx context.Context) map[string]string {
	out := make(map[string]string)
	programs, err := s.program.ListPrograms(ctx)
	if err != nil {
		return out
	}
	for _, p := range programs {
		out[p.Slug] = p.Name
	}
	return out
}

// ── Engine lookup ────────────────────────────────────────────────────────────
//
// UserCPPLookup is the read-only surface the value engines (optimizer,
// sweet-spot, simulator, portfolio) consult to prefer a user's own CPP over the
// seeded program base. Satisfied by repo.UserCPPRepo. Optional everywhere — a
// nil lookup means "no overrides", so the engines price exactly as before.
type UserCPPLookup interface {
	LookupCPP(ctx context.Context, userID, programSlug, segment string) (float64, bool, error)
}

// UserCPP fetches the user's override for one program + segment via the given
// lookup, returning (value, true) when present. A nil lookup, empty userID, or
// any error yields (0, false) so callers degrade silently to the base CPP — a
// missing override must never break scoring. Exported so every engine package
// member shares ONE "prefer user_cpp then base" resolution path.
func UserCPP(ctx context.Context, lookup UserCPPLookup, userID, programSlug, segment string) (float64, bool) {
	if lookup == nil || userID == "" || programSlug == "" {
		return 0, false
	}
	if segment == "" {
		segment = "base"
	}
	cpp, ok, err := lookup.LookupCPP(ctx, userID, programSlug, segment)
	if err != nil || !ok {
		return 0, false
	}
	return cpp, true
}
