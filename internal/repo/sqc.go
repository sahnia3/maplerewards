package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

// SQCRepo serves Aeroplan SQC accrual data + tier thresholds for the projector.
type SQCRepo struct {
	db *pgxpool.Pool
}

func NewSQCRepo(db *pgxpool.Pool) *SQCRepo {
	return &SQCRepo{db: db}
}

// GetUserSQCContext returns:
//   - aeroplan-cobranded cards in the user's wallet with their dollars_per_sqc rate
//   - calendar-year spend on those cards (totals by card)
//   - all 2026 status tier thresholds
func (r *SQCRepo) GetUserSQCContext(ctx context.Context, userID string, year int) ([]model.SQCCardContribution, []model.SQCTier, error) {
	yearStart := time.Date(year, time.January, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(year+1, time.January, 1, 0, 0, 0, 0, time.UTC)

	// Aeroplan-cobranded cards in wallet w/ year-to-date spend on them.
	rows, err := r.db.Query(ctx, `
		SELECT
			uc.card_id,
			c.name,
			c.dollars_per_sqc,
			COALESCE(SUM(se.amount) FILTER (WHERE se.spent_at >= $2 AND se.spent_at < $3), 0) AS ytd_spend
		FROM user_cards uc
		JOIN cards c ON c.id = uc.card_id
		LEFT JOIN spend_entries se ON se.card_id = uc.card_id AND se.user_id = uc.user_id
		WHERE uc.user_id = $1
		  AND c.dollars_per_sqc IS NOT NULL
		GROUP BY uc.card_id, c.name, c.dollars_per_sqc
		ORDER BY c.dollars_per_sqc ASC, c.name ASC
	`, userID, yearStart, yearEnd)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var cards []model.SQCCardContribution
	for rows.Next() {
		var c model.SQCCardContribution
		if err := rows.Scan(&c.CardID, &c.CardName, &c.DollarsPerSQC, &c.YTDSpend); err != nil {
			return nil, nil, err
		}
		if c.DollarsPerSQC > 0 {
			c.SQCEarned = int(c.YTDSpend) / c.DollarsPerSQC
		}
		cards = append(cards, c)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// Status tier thresholds.
	tierRows, err := r.db.Query(ctx, `
		SELECT status_level, sqc_required, COALESCE(min_revenue_cad, 0)
		FROM aeroplan_status_thresholds
		WHERE effective_year = $1
		ORDER BY sqc_required ASC
	`, year)
	if err != nil {
		return cards, nil, err
	}
	defer tierRows.Close()

	var tiers []model.SQCTier
	for tierRows.Next() {
		var t model.SQCTier
		if err := tierRows.Scan(&t.StatusLevel, &t.SQCRequired, &t.MinRevenueCAD); err != nil {
			return cards, nil, err
		}
		tiers = append(tiers, t)
	}
	return cards, tiers, tierRows.Err()
}
