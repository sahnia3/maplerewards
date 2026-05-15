package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EmailVerifyRepo struct {
	pool *pgxpool.Pool
}

func NewEmailVerifyRepo(pool *pgxpool.Pool) *EmailVerifyRepo { return &EmailVerifyRepo{pool: pool} }

func (r *EmailVerifyRepo) InsertToken(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO email_verifications (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`, userID, tokenHash, expiresAt)
	return err
}

// FindUnconsumedByUser returns the most recent unconsumed (and within-TTL or
// expired-but-not-yet-cleaned-up) token row for the user. The service does
// the actual TTL check.
func (r *EmailVerifyRepo) FindUnconsumedByUser(ctx context.Context, userID string) (string, time.Time, error) {
	var hash string
	var expiresAt time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT token_hash, expires_at
		FROM email_verifications
		WHERE user_id = $1 AND consumed_at IS NULL
		ORDER BY created_at DESC
		LIMIT 1
	`, userID).Scan(&hash, &expiresAt)
	if err == pgx.ErrNoRows {
		return "", time.Time{}, fmt.Errorf("no pending verification")
	}
	return hash, expiresAt, err
}

// ConsumeToken marks all unconsumed rows for the user as consumed. Belt-and-
// suspenders cleanup so a re-issued token can't accidentally remain valid.
func (r *EmailVerifyRepo) ConsumeToken(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE email_verifications
		SET consumed_at = NOW()
		WHERE user_id = $1 AND consumed_at IS NULL
	`, userID)
	return err
}

func (r *EmailVerifyRepo) MarkUserVerified(ctx context.Context, userID string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET email_verified_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (r *EmailVerifyRepo) GetUserVerifiedStatus(ctx context.Context, userID string) (bool, string, error) {
	var verifiedAt *time.Time
	var email *string
	// Filter soft-deleted users: a deleted account's verification status
	// should not be visible to downstream callers.
	err := r.pool.QueryRow(ctx, `
		SELECT email_verified_at, email FROM users WHERE id = $1 AND deleted_at IS NULL
	`, userID).Scan(&verifiedAt, &email)
	if err != nil {
		return false, "", err
	}
	verified := verifiedAt != nil
	em := ""
	if email != nil {
		em = *email
	}
	return verified, em, nil
}
