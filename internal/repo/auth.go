package repo

import (
	"context"
	"fmt"

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
		       is_pro, auth_provider, stripe_customer_id, created_at, updated_at
		FROM users WHERE email = $1
	`, email).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
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
		       is_pro, auth_provider, stripe_customer_id, created_at, updated_at
		FROM users WHERE google_id = $1
	`, googleID).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
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
		       is_pro, auth_provider, stripe_customer_id, created_at, updated_at
		FROM users WHERE id = $1
	`, id).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
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
		          is_pro, auth_provider, stripe_customer_id, created_at, updated_at
	`, email, passwordHash, displayName, sessionID).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
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
		          is_pro, auth_provider, stripe_customer_id, created_at, updated_at
	`, googleID, email, displayName, sessionID).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
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
		WHERE id = $1
		RETURNING id, email, session_id, password_hash, google_id, display_name,
		          is_pro, auth_provider, stripe_customer_id, created_at, updated_at
	`, userID, displayName).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update profile: %w", err)
	}
	return &u, nil
}

// MergeAnonymousUser transfers all data from an anonymous session to an authenticated user.
func (r *AuthRepo) MergeAnonymousUser(ctx context.Context, authUserID, anonUserID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin merge tx: %w", err)
	}
	defer tx.Rollback(ctx)

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

	// Delete remaining duplicate data for anon user
	_, _ = tx.Exec(ctx, `DELETE FROM user_cards WHERE user_id = $1`, anonUserID)
	_, _ = tx.Exec(ctx, `DELETE FROM user_monthly_spend WHERE user_id = $1`, anonUserID)
	_, _ = tx.Exec(ctx, `DELETE FROM user_card_bonuses WHERE user_id = $1`, anonUserID)

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

// GetRefreshToken looks up a non-revoked, non-expired token by hash.
func (r *AuthRepo) GetRefreshToken(ctx context.Context, tokenHash string) (*model.RefreshToken, error) {
	var t model.RefreshToken
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, token_hash, expires_at, created_at, revoked_at
		FROM refresh_tokens
		WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
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
func (r *AuthRepo) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1
	`, tokenHash)
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
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
		WHERE id = $2
	`, isPro, userID)
	if err != nil {
		return fmt.Errorf("set user pro: %w", err)
	}
	return nil
}

func (r *AuthRepo) GetUserByStripeCustomerID(ctx context.Context, customerID string) (*model.User, error) {
	var u model.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, session_id, password_hash, google_id, display_name,
		       is_pro, auth_provider, stripe_customer_id, created_at, updated_at
		FROM users WHERE stripe_customer_id = $1
	`, customerID).Scan(
		&u.ID, &u.Email, &u.SessionID, &u.PasswordHash, &u.GoogleID, &u.DisplayName,
		&u.IsPro, &u.AuthProvider, &u.StripeCustomerID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by stripe customer: %w", err)
	}
	return &u, nil
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

// DeleteUser permanently removes a user and all associated data (cascading).
func (r *AuthRepo) DeleteUser(ctx context.Context, userID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delete tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete in dependency order
	_, _ = tx.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, userID)
	_, _ = tx.Exec(ctx, `DELETE FROM spend_entries WHERE user_id = $1`, userID)
	_, _ = tx.Exec(ctx, `DELETE FROM user_monthly_spend WHERE user_id = $1`, userID)
	_, _ = tx.Exec(ctx, `DELETE FROM user_card_bonuses WHERE user_id = $1`, userID)
	_, _ = tx.Exec(ctx, `DELETE FROM user_cards WHERE user_id = $1`, userID)

	_, err = tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}

	return tx.Commit(ctx)
}
