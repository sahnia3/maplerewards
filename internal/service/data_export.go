package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// DataExportService produces a single-blob JSON dump of every row a user owns.
// PIPEDA Art. 13 and GDPR Art. 15 require we provide this on request. The
// shape is human-scannable JSON (not Stripe-style envelope) so users can grep
// through their own data without tooling.
//
// Strategy: query each user-keyed table directly. We bypass the per-feature
// services (which often inject business logic — promotion gating, valuation
// caches) because the export should reflect raw stored facts, not what the
// product chose to surface today.
type DataExportService struct {
	pool       *pgxpool.Pool
	walletRepo WalletRepository
	authRepo   *repo.AuthRepo
}

func NewDataExportService(pool *pgxpool.Pool, walletRepo WalletRepository, authRepo *repo.AuthRepo) *DataExportService {
	return &DataExportService{pool: pool, walletRepo: walletRepo, authRepo: authRepo}
}

// ExportPayload is the wire shape returned by /account/export. Designed to
// round-trip — every field has a clear name and types are concrete rather
// than driver-typed (e.g. timestamps are RFC3339 strings).
type ExportPayload struct {
	GeneratedAt string                 `json:"generated_at"`
	UserID      string                 `json:"user_id"`
	Profile     map[string]any         `json:"profile"`
	Wallet      []model.UserCard       `json:"wallet"`
	Spend       []map[string]any       `json:"spend_history"`
	Applications []map[string]any      `json:"card_applications"`
	WelcomeBonuses []map[string]any    `json:"welcome_bonuses"`
	LoyaltyAccounts []map[string]any   `json:"loyalty_accounts"`
	AwardWatches []map[string]any      `json:"award_watches"`
	ChatConversations []map[string]any `json:"chat_conversations"`
	Note        string                 `json:"note"`
}

// Export gathers every row across the user-keyed tables. Read-only — never
// mutates state. Order of operations: profile first (fail fast on bad
// user_id), then each table in independent queries so a single-table
// failure can be surfaced clearly without leaking partial data.
func (s *DataExportService) Export(ctx context.Context, userID string) (*ExportPayload, error) {
	if userID == "" {
		return nil, fmt.Errorf("user_id required")
	}

	user, err := s.authRepo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}

	payload := &ExportPayload{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		UserID:      userID,
		Profile: map[string]any{
			"email":         deref(user.Email),
			"display_name":  deref(user.DisplayName),
			"auth_provider": user.AuthProvider,
			"is_pro":        user.IsPro,
			"created_at":    user.CreatedAt.Format(time.RFC3339),
			"updated_at":    user.UpdatedAt.Format(time.RFC3339),
		},
		Note: "This is a complete snapshot of the personal data Maple Rewards holds about your account. " +
			"Cards in our catalog (e.g. names, multipliers) are public reference data — what's listed " +
			"under 'wallet' is YOUR data linking your account to those cards.",
	}

	cards, err := s.walletRepo.GetUserCards(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("wallet: %w", err)
	}
	payload.Wallet = cards

	payload.Spend = collectRows(ctx, s.pool, `
		SELECT se.id, se.card_id, c.name AS card_name, se.category_id,
		       cat.name AS category_name, se.amount, se.points_earned,
		       se.dollar_value, se.spent_at, se.note, se.created_at
		FROM spend_entries se
		LEFT JOIN cards c ON c.id = se.card_id
		LEFT JOIN categories cat ON cat.id = se.category_id
		WHERE se.user_id = $1 ORDER BY se.spent_at DESC
	`, userID)
	payload.Applications = collectRows(ctx, s.pool, `
		SELECT a.id, a.card_id, c.name AS card_name, a.applied_at, a.status, a.notes, a.created_at
		FROM card_applications a
		LEFT JOIN cards c ON c.id = a.card_id
		WHERE a.user_id = $1 ORDER BY a.applied_at DESC
	`, userID)
	payload.WelcomeBonuses = collectRows(ctx, s.pool, `
		SELECT id, card_id, activated_at, deadline_at, min_spend, current_spend,
		       bonus_points, is_completed, completed_at, created_at
		FROM user_card_bonuses WHERE user_id = $1
	`, userID)
	payload.LoyaltyAccounts = collectRows(ctx, s.pool, `
		SELECT id, program_slug, account_label, balance, expires_at, last_activity, notes, created_at
		FROM loyalty_accounts WHERE user_id = $1
	`, userID)
	payload.AwardWatches = collectRows(ctx, s.pool, `
		SELECT id, origin, destination, depart_date, flex_days, cabin, max_points,
		       program_slug, is_active, last_checked_at, last_min_points,
		       last_alert_at, last_alert_message, created_at
		FROM award_watch WHERE user_id = $1
	`, userID)
	payload.ChatConversations = collectRows(ctx, s.pool, `
		SELECT c.id, c.title, c.created_at,
		       COALESCE(json_agg(json_build_object('role', m.role, 'content', m.content, 'created_at', m.created_at)
		                         ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]') AS messages
		FROM chat_conversations c
		LEFT JOIN chat_messages m ON m.conversation_id = c.id
		WHERE c.user_id = $1
		GROUP BY c.id
		ORDER BY c.created_at DESC
	`, userID)

	return payload, nil
}

// collectRows runs a SELECT and returns each row as a map[string]any so the
// export can include tables whose schemas evolve without re-stamping a Go
// model. Failures are swallowed: the export returns what it could gather
// rather than 500'ing on a single missing table (e.g. when a feature hasn't
// been wired in dev).
func collectRows(ctx context.Context, pool *pgxpool.Pool, query string, args ...any) []map[string]any {
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		// Non-fatal so one broken table can't sink the whole export — but log
		// loudly. Silently swallowing is exactly what let a column-name drift
		// drop entire categories (loyalty_accounts/award_watch/bonuses) from
		// users' DSAR exports unnoticed.
		slog.Error("data_export.collectRows: query failed; table omitted from export", "err", err, "query", query)
		return []map[string]any{}
	}
	defer rows.Close()
	out := []map[string]any{}
	descs := rows.FieldDescriptions()
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			continue
		}
		row := make(map[string]any, len(descs))
		for i, fd := range descs {
			v := vals[i]
			// Normalize timestamp values to RFC3339 strings so the JSON is
			// human-readable rather than the driver's default tagged form.
			if t, ok := v.(time.Time); ok {
				v = t.UTC().Format(time.RFC3339)
			}
			row[string(fd.Name)] = v
		}
		out = append(out, row)
	}
	return out
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// MarshalIndent helper — exposed for handler convenience so the wire
// representation is consistently pretty-printed. The cost is a few extra
// bytes; the trade is users can open the file in any editor.
func (p *ExportPayload) MarshalIndent() ([]byte, error) {
	return json.MarshalIndent(p, "", "  ")
}
