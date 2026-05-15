package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PushSubscription is the persisted form of a browser's web-push registration.
// Field names match the W3C PushSubscription JSON sent from the client so the
// repo can be hydrated directly from the request body.
type PushSubscription struct {
	ID         string     `json:"id,omitempty"`
	UserID     string     `json:"user_id,omitempty"`
	Endpoint   string     `json:"endpoint"`
	P256dh     string     `json:"p256dh"`
	Auth       string     `json:"auth"`
	UserAgent  string     `json:"user_agent,omitempty"`
	CreatedAt  time.Time  `json:"created_at,omitempty"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

type PushRepo struct {
	db *pgxpool.Pool
}

func NewPushRepo(db *pgxpool.Pool) *PushRepo { return &PushRepo{db: db} }

// Upsert inserts or refreshes a subscription. Endpoint is the natural key:
// the same browser re-subscribing produces the same endpoint, so we update
// keys + user binding in-place rather than create a duplicate row.
func (r *PushRepo) Upsert(ctx context.Context, sub PushSubscription) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (endpoint) DO UPDATE
		SET user_id    = EXCLUDED.user_id,
		    p256dh     = EXCLUDED.p256dh,
		    auth       = EXCLUDED.auth,
		    user_agent = EXCLUDED.user_agent
	`, sub.UserID, sub.Endpoint, sub.P256dh, sub.Auth, sub.UserAgent)
	if err != nil {
		return fmt.Errorf("upsert push subscription: %w", err)
	}
	return nil
}

// ListForUser returns every subscription that belongs to the user. A user
// may have multiple (laptop + phone + tablet) — the worker fans out to all.
func (r *PushRepo) ListForUser(ctx context.Context, userID string) ([]PushSubscription, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, user_id, endpoint, p256dh, auth, COALESCE(user_agent,''), created_at, last_used_at
		FROM push_subscriptions
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list push subscriptions: %w", err)
	}
	defer rows.Close()
	var out []PushSubscription
	for rows.Next() {
		var s PushSubscription
		if err := rows.Scan(&s.ID, &s.UserID, &s.Endpoint, &s.P256dh, &s.Auth, &s.UserAgent, &s.CreatedAt, &s.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// DeleteByEndpoint removes a subscription. Called either when the user
// explicitly unsubscribes or when a push send returns 404/410 (the push
// service telling us the subscription is dead).
func (r *PushRepo) DeleteByEndpoint(ctx context.Context, userID, endpoint string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2
	`, userID, endpoint)
	if err != nil {
		return fmt.Errorf("delete push subscription: %w", err)
	}
	return nil
}

// MarkUsed stamps last_used_at after a successful send. Lets ops trace which
// subscriptions are still active vs. which haven't fired in a year.
func (r *PushRepo) MarkUsed(ctx context.Context, endpoint string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1
	`, endpoint)
	return err
}

// ListForAwardWatch returns push subscriptions for the user that owns a
// given award_watch row — analogous to AwardWatchRepo.GetAlertRecipient but
// for the push channel.
func (r *PushRepo) ListForAwardWatch(ctx context.Context, watchID string) ([]PushSubscription, error) {
	rows, err := r.db.Query(ctx, `
		SELECT ps.id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth,
		       COALESCE(ps.user_agent,''), ps.created_at, ps.last_used_at
		FROM push_subscriptions ps
		JOIN award_watch aw ON aw.user_id = ps.user_id
		JOIN users u ON u.id = ps.user_id
		WHERE aw.id = $1 AND u.deleted_at IS NULL
	`, watchID)
	if err != nil {
		return nil, fmt.Errorf("list push subs for watch: %w", err)
	}
	defer rows.Close()
	var out []PushSubscription
	for rows.Next() {
		var s PushSubscription
		if err := rows.Scan(&s.ID, &s.UserID, &s.Endpoint, &s.P256dh, &s.Auth, &s.UserAgent, &s.CreatedAt, &s.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
