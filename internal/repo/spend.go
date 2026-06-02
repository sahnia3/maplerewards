package repo

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type SpendRepo struct {
	db *pgxpool.Pool
}

func NewSpendRepo(db *pgxpool.Pool) *SpendRepo {
	return &SpendRepo{db: db}
}

// GetMonthlySpend returns total spend by category for a user+card in a given month.
func (r *SpendRepo) GetMonthlySpend(ctx context.Context, userID, cardID string, month time.Time) (map[string]float64, error) {
	rows, err := r.db.Query(ctx, `
		SELECT category_id, total_spend
		FROM user_monthly_spend
		WHERE user_id = $1 AND card_id = $2 AND month = $3
	`, userID, cardID, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]float64)
	for rows.Next() {
		var catID string
		var spend float64
		if err := rows.Scan(&catID, &spend); err != nil {
			return nil, err
		}
		result[catID] = spend
	}
	return result, rows.Err()
}

// GetSpendSince returns total spend by category for a user+card accumulated
// since a given month-bucket (inclusive). Period-aware cap accumulation uses
// this: month-start for `monthly` caps, year-start for `annual` caps — so an
// annual cap correctly accumulates year-to-date instead of only the current
// month (docs/OPTIMIZER-CAP-AUDIT.md §"Secondary code bug").
func (r *SpendRepo) GetSpendSince(ctx context.Context, userID, cardID string, since time.Time) (map[string]float64, error) {
	rows, err := r.db.Query(ctx, `
		SELECT category_id, COALESCE(SUM(total_spend), 0)
		FROM user_monthly_spend
		WHERE user_id = $1 AND card_id = $2 AND month >= $3
		GROUP BY category_id
	`, userID, cardID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]float64)
	for rows.Next() {
		var catID string
		var spend float64
		if err := rows.Scan(&catID, &spend); err != nil {
			return nil, err
		}
		result[catID] = spend
	}
	return result, rows.Err()
}

// UpsertMonthlySpend adds an amount to the monthly spend total for a user+card+category.
func (r *SpendRepo) UpsertMonthlySpend(ctx context.Context, userID, cardID, categoryID string, month time.Time, amount float64) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO user_monthly_spend (user_id, card_id, category_id, month, total_spend, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (user_id, card_id, category_id, month)
		DO UPDATE SET total_spend = user_monthly_spend.total_spend + $5, updated_at = NOW()
	`, userID, cardID, categoryID, month, amount)
	return err
}

// RecordSpend atomically inserts a spend entry and, only when a NEW row was
// actually created, increments the monthly-spend aggregate and (optionally)
// the welcome-bonus tracker — all in a single transaction.
//
// This replaces the old pattern of one synchronous insert plus two
// fire-and-forget goroutines with context.Background() and discarded errors,
// which had three failure modes:
//   - crash/return between the writes silently lost cap & bonus progress;
//   - a deduped re-import (ON CONFLICT) still ran the goroutines, DOUBLE
//     counting monthly spend and bonus progress on every retry;
//   - errors were swallowed, so corruption was undiagnosable.
// Here the monthly/bonus updates run iff the entry was genuinely inserted,
// and any failure rolls the whole thing back.
func (r *SpendRepo) RecordSpend(
	ctx context.Context,
	entry model.SpendEntry,
	month time.Time,
	bonusAmount float64,
	applyBonus bool,
) (*model.SpendEntry, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after a successful Commit

	var createdAt time.Time
	newlyInserted := true
	err = tx.QueryRow(ctx, `
		INSERT INTO spend_entries (user_id, card_id, category_id, amount, points_earned, dollar_value, spent_at, note)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id, card_id, category_id, spent_at, amount, (COALESCE(note, ''))) DO NOTHING
		RETURNING id, created_at
	`, entry.UserID, entry.CardID, entry.CategoryID, entry.Amount,
		entry.PointsEarned, entry.DollarValue, entry.SpentAt, entry.Note,
	).Scan(&entry.ID, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		// Dedup conflict — the entry already exists. Fetch it, and do NOT
		// re-increment monthly/bonus (that was the double-count bug).
		newlyInserted = false
		if fErr := tx.QueryRow(ctx, `
			SELECT id, created_at FROM spend_entries
			WHERE user_id = $1 AND card_id = $2 AND category_id = $3 AND spent_at = $4
			  AND amount = $5 AND COALESCE(note,'') = COALESCE($6,'')
			LIMIT 1
		`, entry.UserID, entry.CardID, entry.CategoryID, entry.SpentAt, entry.Amount, entry.Note,
		).Scan(&entry.ID, &createdAt); fErr != nil {
			return &entry, fErr
		}
	} else if err != nil {
		return &entry, err
	}
	entry.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")

	if newlyInserted {
		if _, err = tx.Exec(ctx, `
			INSERT INTO user_monthly_spend (user_id, card_id, category_id, month, total_spend, updated_at)
			VALUES ($1, $2, $3, $4, $5, NOW())
			ON CONFLICT (user_id, card_id, category_id, month)
			DO UPDATE SET total_spend = user_monthly_spend.total_spend + $5, updated_at = NOW()
		`, entry.UserID, entry.CardID, entry.CategoryID, month, entry.Amount); err != nil {
			return &entry, err
		}
		if applyBonus {
			if _, err = tx.Exec(ctx, `
				UPDATE user_card_bonuses
				SET current_spend = current_spend + $3,
				    is_completed = CASE
						WHEN current_spend + $3 >= min_spend THEN true
						ELSE is_completed
					END,
					completed_at = CASE
						WHEN current_spend + $3 >= min_spend AND completed_at IS NULL THEN CURRENT_DATE
						ELSE completed_at
					END
				WHERE user_id = $1 AND card_id = $2
			`, entry.UserID, entry.CardID, bonusAmount); err != nil {
				return &entry, err
			}
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return &entry, err
	}
	return &entry, nil
}

// BatchSpendRow is one fully-computed spend entry plus the side-effect inputs
// (month bucket + welcome-bonus amount) RecordSpendBatch needs to mirror
// RecordSpend's per-row semantics. The service computes points/dollar value
// per row BEFORE handing the slice off; the repo only persists.
type BatchSpendRow struct {
	Entry       model.SpendEntry
	Month       time.Time
	BonusAmount float64
}

// RecordSpendBatch persists a whole CSV import in ONE transaction on ONE
// acquired connection, pipelining the work with pgx batches. It is the atomic,
// connection-efficient replacement for looping RecordSpend (one tx + ~3 queries
// per row, which pinned the pool and left a half-imported wallet on a mid-file
// failure).
//
// All-or-nothing: a single tx is opened up front and Rollback is deferred, so
// ANY error below returns before Commit and ZERO rows persist. Only the final
// Commit makes the inserts durable.
//
// It preserves RecordSpend's dedup semantics exactly: the inserts use
// ON CONFLICT DO NOTHING + RETURNING, so a re-imported (deduped) row produces
// no RETURNING row, and the monthly-aggregate / welcome-bonus updates run ONLY
// for rows that were genuinely inserted — never for deduped ones (the original
// double-count fix). Two SendBatch round-trips total (inserts, then the
// conditional aggregates), not 2N, all on the same connection.
//
// Returns the number of rows newly inserted (deduped rows are not counted),
// matching the per-row created-count Commit reported before.
func (r *SpendRepo) RecordSpendBatch(ctx context.Context, rows []BatchSpendRow, applyBonus bool) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after a successful Commit

	// Batch 1: queue every insert. ON CONFLICT DO NOTHING means a deduped row
	// returns no row, so we learn per-row whether it was newly inserted.
	insertBatch := &pgx.Batch{}
	for _, row := range rows {
		e := row.Entry
		insertBatch.Queue(`
			INSERT INTO spend_entries (user_id, card_id, category_id, amount, points_earned, dollar_value, spent_at, note)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (user_id, card_id, category_id, spent_at, amount, (COALESCE(note, ''))) DO NOTHING
			RETURNING id
		`, e.UserID, e.CardID, e.CategoryID, e.Amount, e.PointsEarned, e.DollarValue, e.SpentAt, e.Note)
	}

	insertRes := tx.SendBatch(ctx, insertBatch)
	newlyInserted := make([]bool, len(rows))
	created := 0
	for i := range rows {
		var id string
		scanErr := insertRes.QueryRow().Scan(&id)
		if scanErr == nil {
			newlyInserted[i] = true
			created++
		} else if !errors.Is(scanErr, pgx.ErrNoRows) {
			// A real error (not a dedup skip). Close drains the batch; the
			// deferred Rollback then discards every queued insert.
			insertRes.Close() //nolint:errcheck
			return 0, scanErr
		}
	}
	// Must close (drain) the first batch before sending a second on the same tx.
	if err := insertRes.Close(); err != nil {
		return 0, err
	}

	// Batch 2: for newly-inserted rows only, increment the monthly-spend
	// aggregate and (optionally) the welcome-bonus tracker — identical to
	// RecordSpend, but pipelined. Deduped rows are skipped, so a retried import
	// never double-counts.
	aggBatch := &pgx.Batch{}
	queued := 0
	for i, row := range rows {
		if !newlyInserted[i] {
			continue
		}
		e := row.Entry
		aggBatch.Queue(`
			INSERT INTO user_monthly_spend (user_id, card_id, category_id, month, total_spend, updated_at)
			VALUES ($1, $2, $3, $4, $5, NOW())
			ON CONFLICT (user_id, card_id, category_id, month)
			DO UPDATE SET total_spend = user_monthly_spend.total_spend + $5, updated_at = NOW()
		`, e.UserID, e.CardID, e.CategoryID, row.Month, e.Amount)
		queued++
		if applyBonus {
			aggBatch.Queue(`
				UPDATE user_card_bonuses
				SET current_spend = current_spend + $3,
				    is_completed = CASE
						WHEN current_spend + $3 >= min_spend THEN true
						ELSE is_completed
					END,
					completed_at = CASE
						WHEN current_spend + $3 >= min_spend AND completed_at IS NULL THEN CURRENT_DATE
						ELSE completed_at
					END
				WHERE user_id = $1 AND card_id = $2
			`, e.UserID, e.CardID, row.BonusAmount)
			queued++
		}
	}

	if queued > 0 {
		aggRes := tx.SendBatch(ctx, aggBatch)
		for i := 0; i < queued; i++ {
			if _, execErr := aggRes.Exec(); execErr != nil {
				aggRes.Close() //nolint:errcheck
				return 0, execErr
			}
		}
		if err := aggRes.Close(); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return created, nil
}

// GetCapGroupForCard returns the cap group that contains the given category for a card, if any.
func (r *SpendRepo) GetCapGroupForCard(ctx context.Context, cardID, categoryID string) (*model.CapGroup, error) {
	var cg model.CapGroup
	err := r.db.QueryRow(ctx, `
		SELECT cg.id, cg.card_id, cg.name, cg.cap_amount, cg.cap_period
		FROM cap_groups cg
		JOIN cap_group_categories cgc ON cgc.cap_group_id = cg.id
		WHERE cg.card_id = $1 AND cgc.category_id = $2
	`, cardID, categoryID).Scan(&cg.ID, &cg.CardID, &cg.Name, &cg.CapAmount, &cg.CapPeriod)
	if err != nil {
		return nil, err
	}

	// Load all category IDs in this cap group
	rows, err := r.db.Query(ctx, `
		SELECT category_id FROM cap_group_categories WHERE cap_group_id = $1
	`, cg.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var catID string
		if err := rows.Scan(&catID); err != nil {
			return nil, err
		}
		cg.CategoryIDs = append(cg.CategoryIDs, catID)
	}
	return &cg, rows.Err()
}

// CreateSpendEntry inserts a new spend entry record. The ON CONFLICT clause
// uses the dedup index on (user_id, card_id, spent_at, amount, COALESCE(note,''))
// — re-importing the same statement is a no-op rather than a duplicate.
// When a conflict skips the insert, RETURNING produces no row, so we fall
// back to fetching the existing row by the same key so the caller still
// gets a valid SpendEntry pointer.
func (r *SpendRepo) CreateSpendEntry(ctx context.Context, entry model.SpendEntry) (*model.SpendEntry, error) {
	var createdAt time.Time
	err := r.db.QueryRow(ctx, `
		INSERT INTO spend_entries (user_id, card_id, category_id, amount, points_earned, dollar_value, spent_at, note)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id, card_id, category_id, spent_at, amount, (COALESCE(note, ''))) DO NOTHING
		RETURNING id, created_at
	`, entry.UserID, entry.CardID, entry.CategoryID, entry.Amount,
		entry.PointsEarned, entry.DollarValue, entry.SpentAt, entry.Note,
	).Scan(&entry.ID, &createdAt)
	if err == nil {
		entry.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")
		return &entry, nil
	}

	// pgx returns ErrNoRows when ON CONFLICT skipped the insert. Fetch the
	// existing row by the dedup key so the caller has a valid result.
	// Use errors.Is, not string-matching the message (the rest of the repo
	// layer uses the sentinel; a pgx wording change would silently break
	// CSV-import dedup otherwise).
	if errors.Is(err, pgx.ErrNoRows) {
		fetchErr := r.db.QueryRow(ctx, `
			SELECT id, created_at
			FROM spend_entries
			WHERE user_id = $1 AND card_id = $2 AND category_id = $3 AND spent_at = $4
			  AND amount = $5 AND COALESCE(note,'') = COALESCE($6,'')
			LIMIT 1
		`, entry.UserID, entry.CardID, entry.CategoryID, entry.SpentAt, entry.Amount, entry.Note,
		).Scan(&entry.ID, &createdAt)
		if fetchErr == nil {
			entry.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")
			return &entry, nil
		}
	}
	return &entry, err
}

// ListSpendEntries returns spend entries for a user, ordered by most recent.
func (r *SpendRepo) ListSpendEntries(ctx context.Context, userID string, limit, offset int) ([]model.SpendEntry, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			se.id, se.user_id, se.card_id, c.name,
			se.category_id, cat.slug, cat.name,
			se.amount, se.points_earned, se.dollar_value,
			se.spent_at, se.created_at, COALESCE(se.note, '')
		FROM spend_entries se
		JOIN cards c ON c.id = se.card_id
		JOIN categories cat ON cat.id = se.category_id
		WHERE se.user_id = $1
		ORDER BY se.spent_at DESC, se.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.SpendEntry
	for rows.Next() {
		var e model.SpendEntry
		var spentAt time.Time
		var createdAt time.Time
		if err := rows.Scan(
			&e.ID, &e.UserID, &e.CardID, &e.CardName,
			&e.CategoryID, &e.CategorySlug, &e.CategoryName,
			&e.Amount, &e.PointsEarned, &e.DollarValue,
			&spentAt, &createdAt, &e.Note,
		); err != nil {
			return nil, err
		}
		e.SpentAt = spentAt.Format("2006-01-02")
		e.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// SpendMonthsObserved returns how many distinct calendar months the user has
// logged spend in (across all cards/categories). The churn planner divides
// total spend by this to estimate average monthly spend capacity, so a user
// who logged $9k across 3 months reads as $3k/mo, not $9k/mo. Zero when the
// user has no spend history at all.
func (r *SpendRepo) SpendMonthsObserved(ctx context.Context, userID string) (int, error) {
	var months int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT month)
		FROM user_monthly_spend
		WHERE user_id = $1
	`, userID).Scan(&months)
	if err != nil {
		return 0, err
	}
	return months, nil
}

// GetSpendStats returns aggregated spend statistics for a user.
func (r *SpendRepo) GetSpendStats(ctx context.Context, userID string) (*model.SpendStats, error) {
	stats := &model.SpendStats{}

	// Overall totals
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(dollar_value), 0),
		       COALESCE(SUM(points_earned), 0), COUNT(*)
		FROM spend_entries WHERE user_id = $1
	`, userID).Scan(&stats.TotalSpend, &stats.TotalValue, &stats.TotalPoints, &stats.EntryCount)
	if err != nil {
		return nil, err
	}
	if stats.TotalSpend > 0 {
		// Round the derived ratio to 2dp so the API doesn't emit
		// 3.33333333%. SUM() over NUMERIC is exact upstream; only the
		// division needs taming.
		stats.AvgReturn = math.Round((stats.TotalValue/stats.TotalSpend)*100*100) / 100
	}

	// By category
	catRows, err := r.db.Query(ctx, `
		SELECT cat.name, COALESCE(SUM(se.amount), 0), COALESCE(SUM(se.dollar_value), 0), COUNT(*)
		FROM spend_entries se
		JOIN categories cat ON cat.id = se.category_id
		WHERE se.user_id = $1
		GROUP BY cat.name ORDER BY SUM(se.amount) DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer catRows.Close()

	for catRows.Next() {
		var cs model.CategoryStat
		if err := catRows.Scan(&cs.CategoryName, &cs.TotalSpend, &cs.TotalValue, &cs.EntryCount); err != nil {
			return nil, err
		}
		stats.ByCategory = append(stats.ByCategory, cs)
	}

	// By card
	cardRows, err := r.db.Query(ctx, `
		SELECT c.name, COALESCE(SUM(se.amount), 0), COALESCE(SUM(se.dollar_value), 0),
		       CASE WHEN SUM(se.amount) > 0 THEN (SUM(se.dollar_value) / SUM(se.amount)) * 100 ELSE 0 END
		FROM spend_entries se
		JOIN cards c ON c.id = se.card_id
		WHERE se.user_id = $1
		GROUP BY c.name ORDER BY SUM(se.dollar_value) DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer cardRows.Close()

	for cardRows.Next() {
		var cs model.CardStat
		if err := cardRows.Scan(&cs.CardName, &cs.TotalSpend, &cs.TotalValue, &cs.AvgReturn); err != nil {
			return nil, err
		}
		stats.ByCard = append(stats.ByCard, cs)
	}

	return stats, nil
}
