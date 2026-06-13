package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WaitlistSignup is one row of waitlist_signups. ReferredBy and Source are
// pointers because both columns are nullable.
type WaitlistSignup struct {
	ID           string
	Email        string
	ReferralCode string
	ReferredBy   *string
	Source       *string
	CreatedAt    time.Time
}

type WaitlistRepo struct {
	pool *pgxpool.Pool
}

func NewWaitlistRepo(pool *pgxpool.Pool) *WaitlistRepo { return &WaitlistRepo{pool: pool} }

// Insert adds a signup. If the email is already on the list (ON CONFLICT
// (email) DO NOTHING) the EXISTING row is returned with created=false, making
// repeat signups idempotent — the caller re-surfaces the original position and
// referral code instead of erroring.
func (r *WaitlistRepo) Insert(ctx context.Context, email, referralCode string, referredBy, source *string) (*WaitlistSignup, bool, error) {
	row := WaitlistSignup{}
	err := r.pool.QueryRow(ctx, `
		INSERT INTO waitlist_signups (email, referral_code, referred_by, source)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (email) DO NOTHING
		RETURNING id, email, referral_code, referred_by, source, created_at
	`, email, referralCode, referredBy, source).
		Scan(&row.ID, &row.Email, &row.ReferralCode, &row.ReferredBy, &row.Source, &row.CreatedAt)
	if err == nil {
		return &row, true, nil
	}
	if err != pgx.ErrNoRows {
		return nil, false, err
	}

	// Conflict path: DO NOTHING inserted no row, so RETURNING yielded nothing.
	// Fetch and return the existing signup for this email.
	err = r.pool.QueryRow(ctx, `
		SELECT id, email, referral_code, referred_by, source, created_at
		FROM waitlist_signups
		WHERE email = $1
	`, email).
		Scan(&row.ID, &row.Email, &row.ReferralCode, &row.ReferredBy, &row.Source, &row.CreatedAt)
	if err != nil {
		return nil, false, err
	}
	return &row, false, nil
}

// CountBefore returns how many signups landed strictly before createdAt —
// the caller derives the 1-based queue position from it.
func (r *WaitlistRepo) CountBefore(ctx context.Context, createdAt time.Time) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM waitlist_signups WHERE created_at < $1
	`, createdAt).Scan(&n)
	return n, err
}

// CountReferrals returns how many signups credited the given referral code.
func (r *WaitlistRepo) CountReferrals(ctx context.Context, code string) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM waitlist_signups WHERE referred_by = $1
	`, code).Scan(&n)
	return n, err
}

// CountTotal returns the full waitlist size (the M in "You're #N of M").
func (r *WaitlistRepo) CountTotal(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM waitlist_signups`).Scan(&n)
	return n, err
}

// CodeExists reports whether a referral code belongs to an existing signup.
// The service uses it to silently drop invalid ?ref= values.
func (r *WaitlistRepo) CodeExists(ctx context.Context, code string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM waitlist_signups WHERE referral_code = $1)
	`, code).Scan(&exists)
	return exists, err
}
