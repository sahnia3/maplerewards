package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/model"
)

// IssuerPageRepo backs the diff-watch system. Two tables:
//   - issuer_pages         — the curated URLs we monitor + their last-known
//                            content snapshot for diffing
//   - issuer_page_changes  — every detected change, with AI summary
type IssuerPageRepo struct {
	db *pgxpool.Pool
}

func NewIssuerPageRepo(db *pgxpool.Pool) *IssuerPageRepo { return &IssuerPageRepo{db: db} }

// PageWithSnapshot is the worker's view: it needs the full last_text to diff
// against, which we don't surface via the public API.
type PageWithSnapshot struct {
	model.IssuerPage
	LastText string
}

// ListActiveWithSnapshots returns up to `limit` active pages, oldest-checked
// first, including the full last_text snapshot for diffing.
func (r *IssuerPageRepo) ListActiveWithSnapshots(ctx context.Context, limit int) ([]PageWithSnapshot, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, label, url, program_slug, card_id::text, is_active,
		       last_checked_at, last_hash, COALESCE(last_text,''), check_failures
		FROM issuer_pages
		WHERE is_active = true
		ORDER BY last_checked_at NULLS FIRST
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PageWithSnapshot
	for rows.Next() {
		var p PageWithSnapshot
		var lastChecked *time.Time
		if err := rows.Scan(&p.ID, &p.Label, &p.URL, &p.ProgramSlug, &p.CardID, &p.IsActive,
			&lastChecked, &p.LastHash, &p.LastText, &p.CheckFailures); err != nil {
			return nil, err
		}
		if lastChecked != nil {
			s := lastChecked.Format(time.RFC3339)
			p.LastCheckedAt = &s
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// RecordSnapshot stamps a new hash/text snapshot + last_checked_at. Called
// whether or not the page changed — we always update last_checked_at to keep
// the round-robin in `ListActiveWithSnapshots` fair.
func (r *IssuerPageRepo) RecordSnapshot(ctx context.Context, pageID, hash, text string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE issuer_pages
		SET last_checked_at = NOW(),
		    last_hash       = $2,
		    last_text       = $3,
		    check_failures  = 0
		WHERE id = $1
	`, pageID, hash, text)
	if err != nil {
		return fmt.Errorf("record issuer page snapshot: %w", err)
	}
	return nil
}

// RecordCheckOnly bumps last_checked_at when nothing changed (no new hash).
func (r *IssuerPageRepo) RecordCheckOnly(ctx context.Context, pageID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE issuer_pages
		SET last_checked_at = NOW()
		WHERE id = $1
	`, pageID)
	return err
}

// RecordCheckFailure increments the failure counter; the worker can disable
// chronically failing pages once the counter passes a threshold.
func (r *IssuerPageRepo) RecordCheckFailure(ctx context.Context, pageID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE issuer_pages
		SET check_failures = check_failures + 1,
		    last_checked_at = NOW()
		WHERE id = $1
	`, pageID)
	return err
}

// InsertChange persists a detected page change.
func (r *IssuerPageRepo) InsertChange(ctx context.Context, pageID, summary, snippet string, confidence *float64) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO issuer_page_changes (page_id, diff_summary, diff_snippet, ai_confidence)
		VALUES ($1, $2, $3, $4)
	`, pageID, summary, snippet, confidence)
	if err != nil {
		return fmt.Errorf("insert issuer page change: %w", err)
	}
	return nil
}

// RecordChangeAndSnapshot atomically inserts a detected page change AND advances
// the stored snapshot (last_hash/last_text) in a single transaction. Both writes
// commit together or neither does. This prevents the failure mode where the
// change row is inserted but the snapshot save fails: without atomicity the
// stored hash never advances, so the next sweep re-detects the identical "new"
// hash, re-inserts a duplicate change, and re-emails it in the weekly digest —
// forever, until the snapshot finally persists.
func (r *IssuerPageRepo) RecordChangeAndSnapshot(ctx context.Context, pageID, summary, snippet string, confidence *float64, hash, text string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin record-change tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after a successful Commit

	if _, err := tx.Exec(ctx, `
		INSERT INTO issuer_page_changes (page_id, diff_summary, diff_snippet, ai_confidence)
		VALUES ($1, $2, $3, $4)
	`, pageID, summary, snippet, confidence); err != nil {
		return fmt.Errorf("insert issuer page change: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE issuer_pages
		SET last_checked_at = NOW(),
		    last_hash       = $2,
		    last_text       = $3,
		    check_failures  = 0
		WHERE id = $1
	`, pageID, hash, text); err != nil {
		return fmt.Errorf("record issuer page snapshot: %w", err)
	}

	return tx.Commit(ctx)
}

// ListChangesForUserSince returns issuer-page changes that affect cards in
// the user's wallet, detected since `since`. The join is:
//
//	user_cards (user's owned cards)
//	  → cards (the card definitions)
//	    → issuer_pages (pages tagged with that card_id OR matching program)
//	      → issuer_page_changes (the actual diffs)
//
// We accept both card_id matches (direct, e.g. an Amex Cobalt page) AND
// program_slug matches (broader, e.g. an Aeroplan program-wide announcement
// that hits anyone holding any Aeroplan card). Dedupe by change.id.
func (r *IssuerPageRepo) ListChangesForUserSince(ctx context.Context, userID string, since time.Time, limit int) ([]model.IssuerPageChange, error) {
	if limit <= 0 {
		limit = 25
	}
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT c.id, c.page_id, p.label, p.url, p.program_slug,
		       c.detected_at, c.diff_summary, c.diff_snippet, c.ai_confidence
		FROM issuer_page_changes c
		JOIN issuer_pages p ON p.id = c.page_id
		JOIN cards card ON
		    (p.card_id IS NOT NULL AND p.card_id = card.id)
		    OR (p.program_slug IS NOT NULL AND p.program_slug = (
		        SELECT slug FROM loyalty_programs lp WHERE lp.id = card.loyalty_program_id
		    ))
		JOIN user_cards uc ON uc.card_id = card.id
		WHERE uc.user_id = $1
		  AND c.detected_at >= $2
		ORDER BY c.detected_at DESC
		LIMIT $3
	`, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("list issuer changes for user: %w", err)
	}
	defer rows.Close()
	var out []model.IssuerPageChange
	for rows.Next() {
		var ch model.IssuerPageChange
		var detectedAt time.Time
		if err := rows.Scan(&ch.ID, &ch.PageID, &ch.PageLabel, &ch.PageURL, &ch.ProgramSlug,
			&detectedAt, &ch.DiffSummary, &ch.DiffSnippet, &ch.AIConfidence); err != nil {
			return nil, err
		}
		ch.DetectedAt = detectedAt.Format(time.RFC3339)
		out = append(out, ch)
	}
	return out, rows.Err()
}

// ListRecentChanges returns the most recent N changes joined with their
// parent page metadata for UI display.
func (r *IssuerPageRepo) ListRecentChanges(ctx context.Context, limit int) ([]model.IssuerPageChange, error) {
	if limit <= 0 {
		limit = 30
	}
	rows, err := r.db.Query(ctx, `
		SELECT c.id, c.page_id, p.label, p.url, p.program_slug,
		       c.detected_at, c.diff_summary, c.diff_snippet, c.ai_confidence
		FROM issuer_page_changes c
		JOIN issuer_pages p ON p.id = c.page_id
		ORDER BY c.detected_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.IssuerPageChange
	for rows.Next() {
		var ch model.IssuerPageChange
		var detectedAt time.Time
		if err := rows.Scan(&ch.ID, &ch.PageID, &ch.PageLabel, &ch.PageURL, &ch.ProgramSlug,
			&detectedAt, &ch.DiffSummary, &ch.DiffSnippet, &ch.AIConfidence); err != nil {
			return nil, err
		}
		ch.DetectedAt = detectedAt.Format(time.RFC3339)
		out = append(out, ch)
	}
	return out, rows.Err()
}
