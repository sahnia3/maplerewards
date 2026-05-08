package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

// CreditRepo handles per-card credit definitions and per-user redemption tracking.
type CreditRepo struct {
	db *pgxpool.Pool
}

func NewCreditRepo(db *pgxpool.Pool) *CreditRepo {
	return &CreditRepo{db: db}
}

// ListUserCardCredits returns every credit definition attached to a card the
// user holds, joined with this anniversary year's redemption status (if any),
// plus the card's annual fee renewal date for the countdown.
func (r *CreditRepo) ListUserCardCredits(ctx context.Context, userID string) ([]model.CardCreditStatus, error) {
	year := time.Now().Year()
	rows, err := r.db.Query(ctx, `
		SELECT
			ccd.id, ccd.card_id, c.name, c.annual_fee,
			uc.fee_renewal_date,
			ccd.name, COALESCE(ccd.description, ''), ccd.value_cad, ccd.recurrence, ccd.sort_order,
			COALESCE(ucc.id::text, ''),
			COALESCE(ucc.redeemed_amount, 0),
			ucc.redeemed_at,
			COALESCE(ucc.note, '')
		FROM user_cards uc
		JOIN cards c              ON c.id = uc.card_id
		JOIN card_credit_defs ccd ON ccd.card_id = uc.card_id
		LEFT JOIN user_card_credits ucc
			ON ucc.card_credit_def_id = ccd.id
			AND ucc.user_id = uc.user_id
			AND ucc.anniversary_year = $2
		WHERE uc.user_id = $1
		ORDER BY c.name, ccd.sort_order, ccd.name
	`, userID, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.CardCreditStatus
	for rows.Next() {
		var s model.CardCreditStatus
		var renewal *time.Time
		var redeemedAt *time.Time
		if err := rows.Scan(
			&s.CreditDefID, &s.CardID, &s.CardName, &s.CardAnnualFee,
			&renewal,
			&s.Name, &s.Description, &s.ValueCAD, &s.Recurrence, &s.SortOrder,
			&s.UserCreditID,
			&s.RedeemedAmount,
			&redeemedAt,
			&s.Note,
		); err != nil {
			return nil, err
		}
		s.AnniversaryYear = year
		if renewal != nil {
			iso := renewal.Format("2006-01-02")
			s.FeeRenewalDate = &iso
			days := int(time.Until(*renewal).Hours() / 24)
			s.DaysToRenewal = &days
		}
		if redeemedAt != nil {
			iso := redeemedAt.Format("2006-01-02T15:04:05Z07:00")
			s.RedeemedAt = &iso
		}
		s.Remaining = s.ValueCAD - s.RedeemedAmount
		if s.Remaining < 0 {
			s.Remaining = 0
		}
		switch {
		case s.RedeemedAmount <= 0:
			s.Status = "unused"
		case s.RedeemedAmount >= s.ValueCAD:
			s.Status = "redeemed"
		default:
			s.Status = "partial"
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// UpsertRedemption records (or updates) a user's redemption against a credit
// definition for the current anniversary year.
func (r *CreditRepo) UpsertRedemption(ctx context.Context, userID, creditDefID string, amount float64, note string) (*model.CardCreditStatus, error) {
	year := time.Now().Year()
	now := time.Now()
	_, err := r.db.Exec(ctx, `
		INSERT INTO user_card_credits (user_id, card_credit_def_id, anniversary_year, redeemed_amount, redeemed_at, note)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))
		ON CONFLICT (user_id, card_credit_def_id, anniversary_year) DO UPDATE
			SET redeemed_amount = EXCLUDED.redeemed_amount,
			    redeemed_at    = EXCLUDED.redeemed_at,
			    note           = EXCLUDED.note
	`, userID, creditDefID, year, amount, now, note)
	if err != nil {
		return nil, err
	}
	// Return the fresh row alongside its def for the response.
	var s model.CardCreditStatus
	var renewal *time.Time
	var redeemedAt *time.Time
	err = r.db.QueryRow(ctx, `
		SELECT
			ccd.id, ccd.card_id, c.name, c.annual_fee,
			uc.fee_renewal_date,
			ccd.name, COALESCE(ccd.description, ''), ccd.value_cad, ccd.recurrence, ccd.sort_order,
			ucc.id::text,
			ucc.redeemed_amount,
			ucc.redeemed_at,
			COALESCE(ucc.note, '')
		FROM user_card_credits ucc
		JOIN card_credit_defs ccd ON ccd.id = ucc.card_credit_def_id
		JOIN cards c              ON c.id = ccd.card_id
		LEFT JOIN user_cards uc   ON uc.user_id = ucc.user_id AND uc.card_id = ccd.card_id
		WHERE ucc.user_id = $1 AND ucc.card_credit_def_id = $2 AND ucc.anniversary_year = $3
	`, userID, creditDefID, year).Scan(
		&s.CreditDefID, &s.CardID, &s.CardName, &s.CardAnnualFee,
		&renewal,
		&s.Name, &s.Description, &s.ValueCAD, &s.Recurrence, &s.SortOrder,
		&s.UserCreditID,
		&s.RedeemedAmount,
		&redeemedAt,
		&s.Note,
	)
	if err != nil {
		return nil, err
	}
	s.AnniversaryYear = year
	if renewal != nil {
		iso := renewal.Format("2006-01-02")
		s.FeeRenewalDate = &iso
		days := int(time.Until(*renewal).Hours() / 24)
		s.DaysToRenewal = &days
	}
	if redeemedAt != nil {
		iso := redeemedAt.Format("2006-01-02T15:04:05Z07:00")
		s.RedeemedAt = &iso
	}
	s.Remaining = s.ValueCAD - s.RedeemedAmount
	if s.Remaining < 0 {
		s.Remaining = 0
	}
	switch {
	case s.RedeemedAmount <= 0:
		s.Status = "unused"
	case s.RedeemedAmount >= s.ValueCAD:
		s.Status = "redeemed"
	default:
		s.Status = "partial"
	}
	return &s, nil
}
