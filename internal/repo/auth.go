package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/model"
)

type AuthRepo struct {
	pool *pgxpool.Pool
}

func NewAuthRepo(pool *pgxpool.Pool) *AuthRepo {
	return &AuthRepo{pool: pool}
}

func (r *AuthRepo) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	var u model.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, session_id, password_hash, google_id, display_name,
		       is_pro, plan, auth_provider, stripe_customer_id, created_at, updated_at
		FROM users WHERE email = $1 AND deleted_at IS NULL
	`, email).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.Plan, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}

func (r *AuthRepo) GetUserByGoogleID(ctx context.Context, googleID string) (*model.User, error) {
	var u model.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, session_id, password_hash, google_id, display_name,
		       is_pro, plan, auth_provider, stripe_customer_id, created_at, updated_at
		FROM users WHERE google_id = $1 AND deleted_at IS NULL
	`, googleID).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.Plan, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by google id: %w", err)
	}
	return &u, nil
}

func (r *AuthRepo) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	var u model.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, session_id, password_hash, google_id, display_name,
		       is_pro, plan, auth_provider, stripe_customer_id, created_at, updated_at
		FROM users WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.Plan, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *AuthRepo) CreateAuthUser(ctx context.Context, email, passwordHash, displayName, sessionID string) (*model.User, error) {
	var u model.User
	err := r.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name, session_id, auth_provider, updated_at)
		VALUES ($1, $2, $3, $4, 'email', NOW())
		RETURNING id, email, session_id, password_hash, google_id, display_name,
		          is_pro, plan, auth_provider, stripe_customer_id, created_at, updated_at
	`, email, passwordHash, displayName, sessionID).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.Plan, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create auth user: %w", err)
	}
	return &u, nil
}

func (r *AuthRepo) UpsertGoogleUser(ctx context.Context, googleID, email, displayName, sessionID string) (*model.User, error) {
	var u model.User
	err := r.pool.QueryRow(ctx, `
		INSERT INTO users (google_id, email, display_name, session_id, auth_provider, updated_at)
		VALUES ($1, $2, $3, $4, 'google', NOW())
		ON CONFLICT (google_id) DO UPDATE SET
			email = COALESCE(EXCLUDED.email, users.email),
			display_name = COALESCE(EXCLUDED.display_name, users.display_name),
			updated_at = NOW()
		RETURNING id, email, session_id, password_hash, google_id, display_name,
		          is_pro, plan, auth_provider, stripe_customer_id, created_at, updated_at
	`, googleID, email, displayName, sessionID).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.Plan, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert google user: %w", err)
	}
	return &u, nil
}

func (r *AuthRepo) UpdateProfile(ctx context.Context, userID, displayName string) (*model.User, error) {
	var u model.User
	err := r.pool.QueryRow(ctx, `
		UPDATE users SET display_name = $2, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, email, session_id, password_hash, google_id, display_name,
		          is_pro, plan, auth_provider, stripe_customer_id, created_at, updated_at
	`, userID, displayName).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.Plan, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update profile: %w", err)
	}
	return &u, nil
}

// UpdatePasswordHash rewrites the user's bcrypt hash. Caller is responsible
// for verifying the current password and revoking refresh tokens.
func (r *AuthRepo) UpdatePasswordHash(ctx context.Context, userID, passwordHash string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET password_hash = $2, updated_at = NOW()
		WHERE id = $1
	`, userID, passwordHash)
	if err != nil {
		return fmt.Errorf("update password hash: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// MergeAnonymousUser transfers all data from an anonymous session to an authenticated user.
func (r *AuthRepo) MergeAnonymousUser(ctx context.Context, authUserID, anonUserID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin merge tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after a successful Commit

	// Transfer wallet cards (skip conflicts where auth user already has that card)
	_, err = tx.Exec(ctx, `
		UPDATE user_cards SET user_id = $1
		WHERE user_id = $2
		AND card_id NOT IN (SELECT card_id FROM user_cards WHERE user_id = $1)
	`, authUserID, anonUserID)
	if err != nil {
		return fmt.Errorf("merge user_cards: %w", err)
	}

	// Transfer spend entries
	_, err = tx.Exec(ctx, `
		UPDATE spend_entries SET user_id = $1 WHERE user_id = $2
	`, authUserID, anonUserID)
	if err != nil {
		return fmt.Errorf("merge spend_entries: %w", err)
	}

	// Transfer monthly spend aggregates
	_, err = tx.Exec(ctx, `
		UPDATE user_monthly_spend SET user_id = $1
		WHERE user_id = $2
		AND (card_id, category_id, month) NOT IN (
			SELECT card_id, category_id, month FROM user_monthly_spend WHERE user_id = $1
		)
	`, authUserID, anonUserID)
	if err != nil {
		return fmt.Errorf("merge user_monthly_spend: %w", err)
	}

	// Transfer welcome bonus tracking
	_, err = tx.Exec(ctx, `
		UPDATE user_card_bonuses SET user_id = $1
		WHERE user_id = $2
		AND card_id NOT IN (SELECT card_id FROM user_card_bonuses WHERE user_id = $1)
	`, authUserID, anonUserID)
	if err != nil {
		return fmt.Errorf("merge user_card_bonuses: %w", err)
	}

	// Delete remaining duplicate data for anon user. Errors here MUST be
	// returned, not discarded: a failed Exec aborts the pgx transaction, so
	// every later statement (incl. the users delete and Commit) fails with an
	// opaque "current transaction is aborted" and the whole merge silently
	// rolls back — the user loses their wallet/spend after signup with no
	// diagnosable cause. Surface the real error so the caller can retry.
	if _, err := tx.Exec(ctx, `DELETE FROM user_cards WHERE user_id = $1`, anonUserID); err != nil {
		return fmt.Errorf("merge cleanup user_cards: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM user_monthly_spend WHERE user_id = $1`, anonUserID); err != nil {
		return fmt.Errorf("merge cleanup user_monthly_spend: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM user_card_bonuses WHERE user_id = $1`, anonUserID); err != nil {
		return fmt.Errorf("merge cleanup user_card_bonuses: %w", err)
	}

	// Delete the anonymous user
	_, err = tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, anonUserID)
	if err != nil {
		return fmt.Errorf("delete anon user: %w", err)
	}

	return tx.Commit(ctx)
}

// StoreRefreshToken saves a hashed refresh token.
func (r *AuthRepo) StoreRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt interface{}) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`, userID, tokenHash, expiresAt)
	if err != nil {
		return fmt.Errorf("store refresh token: %w", err)
	}
	return nil
}

// GetRefreshToken looks up a non-expired token by hash, INCLUDING already
// revoked rows. Revoked rows must be returned so the service layer can run
// reuse-detection: a presented token whose row has revoked_at set is a replay
// of an already-rotated token (potential theft). Filtering revoked rows out
// here would make replay indistinguishable from an unknown token and silently
// disable the reuse-detection security control. Expiry is still filtered so a
// genuinely expired token reads as unknown.
func (r *AuthRepo) GetRefreshToken(ctx context.Context, tokenHash string) (*model.RefreshToken, error) {
	var t model.RefreshToken
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, token_hash, expires_at, created_at, revoked_at
		FROM refresh_tokens
		WHERE token_hash = $1 AND expires_at > NOW()
	`, tokenHash).Scan(
		&t.ID, &t.UserID, &t.TokenHash, &t.ExpiresAt, &t.CreatedAt, &t.RevokedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get refresh token: %w", err)
	}
	return &t, nil
}

// RevokeRefreshToken marks a token as revoked.
// RevokeRefreshToken atomically claims the rotation: it only flips a token
// that is still un-revoked, and reports whether THIS call did it. Two
// concurrent refreshes with the same token (common SPA double-fire) both
// pass the earlier reuse check, but only the one whose UPDATE affects a row
// may mint a new pair — the loser is told the token is invalid and retries
// with the winner's token. This closes the revoke-then-issue race that
// previously minted two valid refresh tokens and later tripped false
// reuse-detection (forced logout).
func (r *AuthRepo) RevokeRefreshToken(ctx context.Context, tokenHash string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = NOW()
		WHERE token_hash = $1 AND revoked_at IS NULL
	`, tokenHash)
	if err != nil {
		return false, fmt.Errorf("revoke refresh token: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// RevokeAllUserTokens revokes all refresh tokens for a user.
func (r *AuthRepo) RevokeAllUserTokens(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = NOW()
		WHERE user_id = $1 AND revoked_at IS NULL
	`, userID)
	if err != nil {
		return fmt.Errorf("revoke all user tokens: %w", err)
	}
	return nil
}

func (r *AuthRepo) SetUserPro(ctx context.Context, userID string, isPro bool) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users SET is_pro = $1, updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL
	`, isPro, userID)
	if err != nil {
		return fmt.Errorf("set user pro: %w", err)
	}
	return nil
}

// SetUserPlan persists the purchased tier (free|pro|pro_plus|lifetime) and
// keeps the is_pro access flag in sync in one atomic write: any paid plan
// grants Pro access, 'free' revokes it. This is the single source of truth
// for the relationship — callers never set is_pro and plan separately.
func (r *AuthRepo) SetUserPlan(ctx context.Context, userID, plan string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users SET plan = $1, is_pro = ($1 <> 'free'), updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL
	`, plan, userID)
	if err != nil {
		return fmt.Errorf("set user plan: %w", err)
	}
	return nil
}

func (r *AuthRepo) GetUserByStripeCustomerID(ctx context.Context, customerID string) (*model.User, error) {
	var u model.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, session_id, password_hash, google_id, display_name,
		       is_pro, plan, auth_provider, stripe_customer_id, created_at, updated_at
		FROM users WHERE stripe_customer_id = $1 AND deleted_at IS NULL
	`, customerID).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.Plan, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by stripe customer: %w", err)
	}
	return &u, nil
}

// SetEmailUnsubscribed records a CASL opt-out. Idempotent — only stamps the
// first time so the audit timestamp reflects the original request.
func (r *AuthRepo) SetEmailUnsubscribed(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users SET email_unsubscribed_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND email_unsubscribed_at IS NULL
	`, userID)
	if err != nil {
		return fmt.Errorf("set email unsubscribed: %w", err)
	}
	return nil
}

// IsEmailUnsubscribed reports whether the user has opted out of commercial
// email. Defaults to false (subscribed) for unknown users.
func (r *AuthRepo) IsEmailUnsubscribed(ctx context.Context, userID string) (bool, error) {
	var ts *time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT email_unsubscribed_at FROM users WHERE id = $1 AND deleted_at IS NULL`, userID).Scan(&ts)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check email unsubscribed: %w", err)
	}
	return ts != nil, nil
}

func (r *AuthRepo) SetStripeCustomerID(ctx context.Context, userID, customerID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users SET stripe_customer_id = $1, updated_at = NOW()
		WHERE id = $2
	`, customerID, userID)
	if err != nil {
		return fmt.Errorf("set stripe customer id: %w", err)
	}
	return nil
}

// RecordStripeEvent persists a Stripe webhook event ID for idempotency.
// Returns true if this is the first time we've seen this event ID,
// false if it was already processed (duplicate webhook delivery from
// Stripe's retry logic). Must only be called AFTER the event has been
// successfully processed — otherwise a transient failure would prevent
// Stripe's retry from re-attempting the work.
func (r *AuthRepo) RecordStripeEvent(ctx context.Context, eventID, eventType string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO stripe_events (event_id, event_type)
		VALUES ($1, $2)
		ON CONFLICT (event_id) DO NOTHING
	`, eventID, eventType)
	if err != nil {
		return false, fmt.Errorf("record stripe event: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// IsStripeEventProcessed reports whether the given Stripe event ID has
// already been successfully processed. Read-only lookup used at the top
// of the webhook handler to short-circuit duplicates without re-running
// the event handler.
func (r *AuthRepo) IsStripeEventProcessed(ctx context.Context, eventID string) (bool, error) {
	var exists bool
	// COMPLETED only — a merely-reserved (in-flight or rolled-back) row must
	// NOT count as processed, or a concurrent duplicate would 200 and let
	// Stripe stop retrying an event we never finished.
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM stripe_events WHERE event_id = $1 AND completed_at IS NOT NULL)
	`, eventID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check stripe event: %w", err)
	}
	return exists, nil
}

// MarkStripeEventCompleted stamps an event as successfully processed. Called
// by the webhook handler ONLY after HandleWebhookEvent returns nil.
func (r *AuthRepo) MarkStripeEventCompleted(ctx context.Context, eventID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE stripe_events SET completed_at = NOW() WHERE event_id = $1
	`, eventID)
	if err != nil {
		return fmt.Errorf("mark stripe event completed: %w", err)
	}
	return nil
}

// ReclaimStaleStripeEvent deletes a reserved-but-never-completed row older than
// 15 minutes — a reserve orphaned by a crash/redeploy mid-processing. Returns
// true if it reclaimed one, letting the handler reprocess instead of looping on
// a poison "still in-flight" 409 forever.
func (r *AuthRepo) ReclaimStaleStripeEvent(ctx context.Context, eventID string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM stripe_events
		WHERE event_id = $1
		  AND completed_at IS NULL
		  AND processed_at < NOW() - INTERVAL '15 minutes'
	`, eventID)
	if err != nil {
		return false, fmt.Errorf("reclaim stale stripe event: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// DeleteStripeEvent removes a previously-recorded event row. Used by the
// webhook handler when event processing fails AFTER RecordStripeEvent has
// already inserted the dedup row — without this, Stripe's retry would find
// the row, treat the event as done, and skip retry. The handler reserves
// the row first (atomic INSERT) and rolls it back (this DELETE) on failure.
func (r *AuthRepo) DeleteStripeEvent(ctx context.Context, eventID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM stripe_events WHERE event_id = $1`, eventID)
	if err != nil {
		return fmt.Errorf("delete stripe event: %w", err)
	}
	return nil
}

// DeleteUser soft-deletes a user account: marks deleted_at, scrambles the
// email so the address can be re-registered, revokes refresh tokens, and
// writes an audit-log entry. PIPEDA requires we honour deletion requests
// while a recovery window plus deletion log lets us answer compliance
// inquiries without losing operational data immediately. A separate cron
// job is responsible for hard-deleting rows older than the 30-day window.
func (r *AuthRepo) DeleteUser(ctx context.Context, userID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delete tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after a successful Commit

	// Read the email before scrambling so we can record it in the audit log.
	var emailAtDelete *string
	if err := tx.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&emailAtDelete); err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("user %s not found", userID)
		}
		return fmt.Errorf("read user email: %w", err)
	}

	// Revoke refresh tokens immediately (no benefit to keeping them).
	if _, err := tx.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("revoke refresh tokens: %w", err)
	}

	// Soft-delete: mark deleted_at, scramble the email so the address frees
	// up for re-registration, null out display_name + password_hash so the
	// soft-deleted record can't be used for login. Wallet/spend/credit data
	// stays linked for the recovery window.
	if _, err := tx.Exec(ctx, `
		UPDATE users
		SET deleted_at    = NOW(),
		    email         = 'deleted+' || id::text || '@maplerewards.archive',
		    password_hash = NULL,
		    google_id     = NULL,
		    display_name  = 'Deleted user',
		    updated_at    = NOW()
		WHERE id = $1
	`, userID); err != nil {
		return fmt.Errorf("soft delete user: %w", err)
	}

	// Audit log row — `user_id` is not FK so the log survives hard-delete.
	if _, err := tx.Exec(ctx, `
		INSERT INTO user_deletions_log (user_id, email_at_delete, requested_by)
		VALUES ($1, $2, 'user')
	`, userID, emailAtDelete); err != nil {
		return fmt.Errorf("write deletion audit log: %w", err)
	}

	return tx.Commit(ctx)
}

// ── Issuer-digest recipient enumeration ─────────────────────────────────────
// The worker walks this list weekly to dispatch the per-user issuer-change
// digest. Selecting on the partial index keeps the query cheap even as the
// user table grows — most rows are non-Pro and indexed out.

// IssuerDigestRecipient is one row of (userID, email, lastSentAt). LastSentAt
// is nil for first-time recipients.
type IssuerDigestRecipient struct {
	UserID     string
	Email      string
	LastSentAt *time.Time
}

// ListProDigestRecipientsDueBefore returns Pro users whose last issuer-digest
// is either never sent (null) or sent before `cutoff`. Soft-deleted users
// and Pro users with scrambled emails (post-delete) are excluded.
//
// Caller picks the cutoff (typically NOW() - 6 days for a weekly cadence with
// a 24h safety margin so a slightly-early sweep doesn't miss anyone).
func (r *AuthRepo) ListProDigestRecipientsDueBefore(ctx context.Context, cutoff time.Time, limit int) ([]IssuerDigestRecipient, error) {
	if limit <= 0 {
		limit = 500
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, email, last_issuer_digest_at
		FROM users
		WHERE is_pro = true
		  AND deleted_at IS NULL
		  AND email_unsubscribed_at IS NULL
		  AND (last_issuer_digest_at IS NULL OR last_issuer_digest_at < $1)
		ORDER BY last_issuer_digest_at NULLS FIRST
		LIMIT $2
	`, cutoff, limit)
	if err != nil {
		return nil, fmt.Errorf("list pro digest recipients: %w", err)
	}
	defer rows.Close()
	var out []IssuerDigestRecipient
	for rows.Next() {
		var rec IssuerDigestRecipient
		if err := rows.Scan(&rec.UserID, &rec.Email, &rec.LastSentAt); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// MarkIssuerDigestSent stamps the per-user last-sent timestamp so the next
// sweep skips this user until the cadence window opens again.
func (r *AuthRepo) MarkIssuerDigestSent(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users SET last_issuer_digest_at = NOW()
		WHERE id = $1
	`, userID)
	if err != nil {
		return fmt.Errorf("mark issuer digest sent: %w", err)
	}
	return nil
}

// MissedRewardsDigestRecipient extends the issuer-digest recipient shape with
// session_id, which the MissedRewardsService needs to look up wallet/spend
// scoped to the same logical user. SessionID is non-nullable on users so it's
// always set.
type MissedRewardsDigestRecipient struct {
	UserID     string
	SessionID  string
	Email      string
	LastSentAt *time.Time
}

// ListProMissedRewardsRecipientsDueBefore returns Pro users whose last missed-
// rewards-digest is null or sent before `cutoff`. Tracked independently of
// the issuer digest so the two emails don't suppress each other on weeks
// where only one has content.
func (r *AuthRepo) ListProMissedRewardsRecipientsDueBefore(ctx context.Context, cutoff time.Time, limit int) ([]MissedRewardsDigestRecipient, error) {
	if limit <= 0 {
		limit = 500
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, session_id, email, last_missed_rewards_digest_at
		FROM users
		WHERE is_pro = true
		  AND deleted_at IS NULL
		  AND email IS NOT NULL
		  AND email_unsubscribed_at IS NULL
		  AND (last_missed_rewards_digest_at IS NULL OR last_missed_rewards_digest_at < $1)
		ORDER BY last_missed_rewards_digest_at NULLS FIRST
		LIMIT $2
	`, cutoff, limit)
	if err != nil {
		return nil, fmt.Errorf("list pro missed-rewards recipients: %w", err)
	}
	defer rows.Close()
	var out []MissedRewardsDigestRecipient
	for rows.Next() {
		var rec MissedRewardsDigestRecipient
		if err := rows.Scan(&rec.UserID, &rec.SessionID, &rec.Email, &rec.LastSentAt); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// MarkMissedRewardsDigestSent stamps the per-user last-sent timestamp for
// the missed-rewards digest.
func (r *AuthRepo) MarkMissedRewardsDigestSent(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users SET last_missed_rewards_digest_at = NOW()
		WHERE id = $1
	`, userID)
	if err != nil {
		return fmt.Errorf("mark missed-rewards digest sent: %w", err)
	}
	return nil
}
