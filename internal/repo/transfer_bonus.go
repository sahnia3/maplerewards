package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TransferBonusEvent is one detected promotion in the transfer-bonus log.
// FromProgram / ToProgram are canonical program slugs (aeroplan, amex-mr-ca,
// ba-avios, …). BonusPercent is a percentage value (30.00 for "+30%").
type TransferBonusEvent struct {
	ID            string     `json:"id"`
	FromProgram   string     `json:"from_program"`
	ToProgram     string     `json:"to_program"`
	BonusPercent  float64    `json:"bonus_percent"`
	StartsAt      *time.Time `json:"starts_at,omitempty"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	SourceURL     string     `json:"source_url"`
	SourceTitle   string     `json:"source_title,omitempty"`
	Summary       string     `json:"summary,omitempty"`
	AIConfidence  *float64   `json:"ai_confidence,omitempty"`
	DetectedAt    time.Time  `json:"detected_at"`
}

type TransferBonusRepo struct {
	db *pgxpool.Pool
}

func NewTransferBonusRepo(db *pgxpool.Pool) *TransferBonusRepo {
	return &TransferBonusRepo{db: db}
}

// Upsert writes a promo by natural key (from, to, expires). The same Tavily
// run can return the same promo multiple times across re-scans; ON CONFLICT
// refreshes the description + source URL but never bumps detected_at, so
// "first-detected" alerts only fire once.
func (r *TransferBonusRepo) Upsert(ctx context.Context, e TransferBonusEvent) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO transfer_bonus_events
			(from_program, to_program, bonus_percent, starts_at, expires_at,
			 source_url, source_title, summary, ai_confidence)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (from_program, to_program, expires_at) DO UPDATE
		SET bonus_percent = EXCLUDED.bonus_percent,
		    source_url    = EXCLUDED.source_url,
		    source_title  = EXCLUDED.source_title,
		    summary       = EXCLUDED.summary,
		    ai_confidence = EXCLUDED.ai_confidence
	`, e.FromProgram, e.ToProgram, e.BonusPercent, e.StartsAt, e.ExpiresAt,
		e.SourceURL, e.SourceTitle, e.Summary, e.AIConfidence)
	if err != nil {
		return fmt.Errorf("upsert transfer bonus: %w", err)
	}
	return nil
}

// ListActive returns currently-running promos (expires_at NULL OR >= today),
// newest-detected first. Caller picks a `limit` ceiling — 50 is a sane default
// for public catalog rendering.
func (r *TransferBonusRepo) ListActive(ctx context.Context, limit int) ([]TransferBonusEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, from_program, to_program, bonus_percent, starts_at, expires_at,
		       source_url, COALESCE(source_title,''), COALESCE(summary,''),
		       ai_confidence, detected_at
		FROM transfer_bonus_events
		WHERE expires_at IS NULL OR expires_at >= CURRENT_DATE
		ORDER BY detected_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list active transfer bonuses: %w", err)
	}
	defer rows.Close()
	var out []TransferBonusEvent
	for rows.Next() {
		var e TransferBonusEvent
		if err := rows.Scan(&e.ID, &e.FromProgram, &e.ToProgram, &e.BonusPercent,
			&e.StartsAt, &e.ExpiresAt, &e.SourceURL, &e.SourceTitle, &e.Summary,
			&e.AIConfidence, &e.DetectedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ListForFromProgram returns active promos with a specific source program —
// the worker uses this to fan out user-specific alerts ("you hold MR; this
// MR → Aeroplan 30% bonus is worth $X to you").
func (r *TransferBonusRepo) ListForFromProgram(ctx context.Context, fromSlug string) ([]TransferBonusEvent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, from_program, to_program, bonus_percent, starts_at, expires_at,
		       source_url, COALESCE(source_title,''), COALESCE(summary,''),
		       ai_confidence, detected_at
		FROM transfer_bonus_events
		WHERE from_program = $1
		  AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
		ORDER BY detected_at DESC
	`, fromSlug)
	if err != nil {
		return nil, fmt.Errorf("list promos by from_program: %w", err)
	}
	defer rows.Close()
	var out []TransferBonusEvent
	for rows.Next() {
		var e TransferBonusEvent
		if err := rows.Scan(&e.ID, &e.FromProgram, &e.ToProgram, &e.BonusPercent,
			&e.StartsAt, &e.ExpiresAt, &e.SourceURL, &e.SourceTitle, &e.Summary,
			&e.AIConfidence, &e.DetectedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
