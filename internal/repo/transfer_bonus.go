package repo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
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
		ON CONFLICT (from_program, to_program, bonus_percent, expires_at) DO UPDATE
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
	// Defense-in-depth on top of hardened ingest + migration 000046:
	//  - expires_at >= today only (no NULL → no eternal "ONGOING"; no past)
	//  - DISTINCT ON the natural route+percent, keeping the newest detection,
	//    so a stray duplicate can never reach the UI
	// then re-sorted newest-first for display and capped.
	rows, err := r.db.Query(ctx, `
		SELECT * FROM (
			SELECT DISTINCT ON (from_program, to_program, bonus_percent)
			       id, from_program, to_program, bonus_percent, starts_at, expires_at,
			       source_url, COALESCE(source_title,'') AS source_title,
			       COALESCE(summary,'') AS summary, ai_confidence, detected_at
			FROM transfer_bonus_events
			WHERE expires_at >= CURRENT_DATE
			  AND source_dead_at IS NULL
			ORDER BY from_program, to_program, bonus_percent, detected_at DESC
		) d
		ORDER BY d.detected_at DESC
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

// ActiveBonusForRoute returns the single best currently-running promo for a
// specific (from_program, to_program) route — highest bonus_percent first,
// newest detection as the tie-break — or nil when no live bonus covers the
// route. Same liveness filter as ListActive (expires_at >= today, citation not
// dead) so value engines never surface a stale or expired bonus. Read-only;
// invents nothing — it only reflects promos the sentinel already scraped.
func (r *TransferBonusRepo) ActiveBonusForRoute(ctx context.Context, fromSlug, toSlug string) (*TransferBonusEvent, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, from_program, to_program, bonus_percent, starts_at, expires_at,
		       source_url, COALESCE(source_title,''), COALESCE(summary,''),
		       ai_confidence, detected_at
		FROM transfer_bonus_events
		WHERE from_program = $1
		  AND to_program   = $2
		  AND expires_at >= CURRENT_DATE
		  AND source_dead_at IS NULL
		ORDER BY bonus_percent DESC, detected_at DESC
		LIMIT 1
	`, fromSlug, toSlug)
	var e TransferBonusEvent
	err := row.Scan(&e.ID, &e.FromProgram, &e.ToProgram, &e.BonusPercent,
		&e.StartsAt, &e.ExpiresAt, &e.SourceURL, &e.SourceTitle, &e.Summary,
		&e.AIConfidence, &e.DetectedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("active bonus for route %s→%s: %w", fromSlug, toSlug, err)
	}
	return &e, nil
}

// SourceRef is the minimal pair the source-health re-check needs.
type SourceRef struct {
	ID        string
	SourceURL string
}

// ListSourcesForRecheck returns every still-current promo (id, source_url)
// regardless of its current dead flag, so the worker can both mark newly-dead
// citations AND revive ones that came back (e.g. transient Cloudflare).
func (r *TransferBonusRepo) ListSourcesForRecheck(ctx context.Context) ([]SourceRef, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, source_url
		FROM transfer_bonus_events
		WHERE expires_at >= CURRENT_DATE
		  AND source_url ~ '^https?://'
	`)
	if err != nil {
		return nil, fmt.Errorf("list sources for recheck: %w", err)
	}
	defer rows.Close()
	var out []SourceRef
	for rows.Next() {
		var s SourceRef
		if err := rows.Scan(&s.ID, &s.SourceURL); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MarkSourceDead flags a promo whose citation no longer resolves so ListActive
// stops surfacing it. Idempotent — only stamps the first time.
func (r *TransferBonusRepo) MarkSourceDead(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE transfer_bonus_events
		SET source_dead_at = now()
		WHERE id = $1 AND source_dead_at IS NULL
	`, id)
	return err
}

// MarkSourceLive clears the dead flag when a previously-dead citation resolves
// again (transient block lifted), so the promo can return to the feed.
// Returns true only when a row actually flipped (was dead, now live) — so the
// caller's "revived" telemetry counts real recoveries, not every live promo.
func (r *TransferBonusRepo) MarkSourceLive(ctx context.Context, id string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE transfer_bonus_events
		SET source_dead_at = NULL
		WHERE id = $1 AND source_dead_at IS NOT NULL
	`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
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
		  AND expires_at >= CURRENT_DATE
		  AND source_dead_at IS NULL
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
