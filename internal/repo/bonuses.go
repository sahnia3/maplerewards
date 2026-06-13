package repo

import (
	"context"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type BonusRepo struct {
	db *pgxpool.Pool
}

func NewBonusRepo(db *pgxpool.Pool) *BonusRepo {
	return &BonusRepo{db: db}
}

// inclusiveDaysLeft returns the number of calendar days remaining until the
// deadline, counting the deadline day itself (so a deadline of "today" yields
// 1, not 0). Both times are normalized to their UTC calendar date first, so a
// mid-day `now` does not truncate a fractional day off the count. The result is
// floored at 0 once the deadline day has passed.
func inclusiveDaysLeft(now, deadline time.Time) int {
	nowDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	deadlineDate := time.Date(deadline.Year(), deadline.Month(), deadline.Day(), 0, 0, 0, 0, time.UTC)
	daysLeft := int(deadlineDate.Sub(nowDate).Hours()/24) + 1
	if daysLeft < 0 {
		daysLeft = 0
	}
	return daysLeft
}

// GetUserBonuses returns all bonus tracking rows for a user, with card info and computed progress.
func (r *BonusRepo) GetUserBonuses(ctx context.Context, userID string) ([]model.WelcomeBonus, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			ucb.id, ucb.user_id, ucb.card_id,
			c.name, c.issuer,
			ucb.activated_at, ucb.deadline_at,
			ucb.min_spend, ucb.current_spend,
			ucb.bonus_points, ucb.is_completed, ucb.completed_at
		FROM user_card_bonuses ucb
		JOIN cards c ON c.id = ucb.card_id
		WHERE ucb.user_id = $1
		ORDER BY ucb.is_completed ASC, ucb.deadline_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	now := time.Now()
	var bonuses []model.WelcomeBonus
	for rows.Next() {
		var b model.WelcomeBonus
		var activatedAt, deadlineAt time.Time
		var completedAt *time.Time

		if err := rows.Scan(
			&b.ID, &b.UserID, &b.CardID,
			&b.CardName, &b.CardIssuer,
			&activatedAt, &deadlineAt,
			&b.MinSpend, &b.CurrentSpend,
			&b.BonusPoints, &b.IsCompleted, &completedAt,
		); err != nil {
			return nil, err
		}

		b.ActivatedAt = activatedAt.Format("2006-01-02")
		b.DeadlineAt = deadlineAt.Format("2006-01-02")

		if completedAt != nil {
			s := completedAt.Format("2006-01-02")
			b.CompletedAt = &s
		}

		// Compute progress
		if b.MinSpend > 0 {
			b.Progress = math.Min(b.CurrentSpend/b.MinSpend, 1.0)
		}

		// Compute days left (inclusive calendar-day count: the deadline day
		// itself counts, so "deadline today" => 1 day left, not 0).
		if !b.IsCompleted {
			b.DaysLeft = inclusiveDaysLeft(now, deadlineAt)
		}

		bonuses = append(bonuses, b)
	}
	return bonuses, rows.Err()
}

// ActivateBonus creates a bonus tracking row for a user's card, using the card's welcome bonus details.
func (r *BonusRepo) ActivateBonus(ctx context.Context, userID, cardID string) (*model.WelcomeBonus, error) {
	var b model.WelcomeBonus
	var activatedAt, deadlineAt time.Time

	err := r.db.QueryRow(ctx, `
		WITH ins AS (
			INSERT INTO user_card_bonuses (user_id, card_id, deadline_at, min_spend, bonus_points)
			SELECT $1, $2,
				CURRENT_DATE + (c.welcome_bonus_months || ' months')::interval,
				c.welcome_bonus_min_spend,
				c.welcome_bonus_points
			FROM cards c WHERE c.id = $2
			ON CONFLICT (user_id, card_id) DO UPDATE
				SET user_id = user_card_bonuses.user_id
			RETURNING id, user_id, card_id, activated_at, deadline_at, min_spend, current_spend, bonus_points, is_completed
		)
		SELECT ins.id, ins.user_id, ins.card_id, c.name, c.issuer,
		       ins.activated_at, ins.deadline_at, ins.min_spend, ins.current_spend,
		       ins.bonus_points, ins.is_completed
		FROM ins
		JOIN cards c ON c.id = ins.card_id
	`, userID, cardID).Scan(
		&b.ID, &b.UserID, &b.CardID,
		&b.CardName, &b.CardIssuer,
		&activatedAt, &deadlineAt,
		&b.MinSpend, &b.CurrentSpend, &b.BonusPoints, &b.IsCompleted,
	)
	if err != nil {
		return nil, err
	}

	b.ActivatedAt = activatedAt.Format("2006-01-02")
	b.DeadlineAt = deadlineAt.Format("2006-01-02")

	if b.MinSpend > 0 {
		b.Progress = math.Min(b.CurrentSpend/b.MinSpend, 1.0)
	}

	b.DaysLeft = inclusiveDaysLeft(time.Now(), deadlineAt)

	return &b, nil
}

// UpdateBonusSpend adds a spend amount to the bonus tracking row and checks completion.
func (r *BonusRepo) UpdateBonusSpend(ctx context.Context, userID, cardID string, amount float64) error {
	_, err := r.db.Exec(ctx, `
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
	`, userID, cardID, amount)
	return err
}
