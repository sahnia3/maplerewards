package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserCPP is one per-user cents-per-point override row. cpp_cad is the value the
// user supplied for a given program + redemption segment; the value engines
// prefer it over the seeded program-level base CPP (AU-5).
type UserCPP struct {
	ID          string
	UserID      string
	ProgramSlug string
	Segment     string
	CPPCAD      float64
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type UserCPPRepo struct {
	pool *pgxpool.Pool
}

func NewUserCPPRepo(pool *pgxpool.Pool) *UserCPPRepo { return &UserCPPRepo{pool: pool} }

// ListByUser returns every override the user holds, ordered for stable display.
func (r *UserCPPRepo) ListByUser(ctx context.Context, userID string) ([]UserCPP, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, program_slug, segment, cpp_cad, created_at, updated_at
		FROM user_cpp
		WHERE user_id = $1
		ORDER BY program_slug, segment
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []UserCPP
	for rows.Next() {
		var u UserCPP
		if err := rows.Scan(&u.ID, &u.UserID, &u.ProgramSlug, &u.Segment, &u.CPPCAD, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// Upsert sets (or replaces) the user's override for one program + segment.
func (r *UserCPPRepo) Upsert(ctx context.Context, userID, programSlug, segment string, cppCAD float64) (*UserCPP, error) {
	var u UserCPP
	err := r.pool.QueryRow(ctx, `
		INSERT INTO user_cpp (user_id, program_slug, segment, cpp_cad)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, program_slug, segment) DO UPDATE
		    SET cpp_cad    = EXCLUDED.cpp_cad,
		        updated_at = NOW()
		RETURNING id, user_id, program_slug, segment, cpp_cad, created_at, updated_at
	`, userID, programSlug, segment, cppCAD).
		Scan(&u.ID, &u.UserID, &u.ProgramSlug, &u.Segment, &u.CPPCAD, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// Delete removes one override by program + segment. Scoped to the owning user so
// a forged program_slug can never touch another user's row.
func (r *UserCPPRepo) Delete(ctx context.Context, userID, programSlug, segment string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM user_cpp WHERE user_id = $1 AND program_slug = $2 AND segment = $3`,
		userID, programSlug, segment)
	return err
}

// LookupCPP returns the user's override for one program + segment, or (0, false)
// when none exists. The value engines use this to prefer the user's number and
// fall back to the seeded base when absent.
func (r *UserCPPRepo) LookupCPP(ctx context.Context, userID, programSlug, segment string) (float64, bool, error) {
	var cpp float64
	err := r.pool.QueryRow(ctx,
		`SELECT cpp_cad FROM user_cpp WHERE user_id = $1 AND program_slug = $2 AND segment = $3`,
		userID, programSlug, segment).Scan(&cpp)
	if err == pgx.ErrNoRows {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return cpp, true, nil
}
