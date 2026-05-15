package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/model"
)

type CardOfferRepo struct {
	db *pgxpool.Pool
}

func NewCardOfferRepo(db *pgxpool.Pool) *CardOfferRepo { return &CardOfferRepo{db: db} }

func (r *CardOfferRepo) Create(ctx context.Context, userID string, req model.CreateCardOfferRequest) (*model.CardOffer, error) {
	row := r.db.QueryRow(ctx, `
		INSERT INTO card_offers
		    (user_id, card_id, source, merchant, description, earn_amount, min_spend,
		     activated_at, expires_at, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10)
		RETURNING id
	`, userID, req.CardID, req.Source, req.Merchant, req.Description,
		req.EarnAmount, req.MinSpend, req.ActivatedAt, req.ExpiresAt, req.Notes)
	var id string
	if err := row.Scan(&id); err != nil {
		return nil, fmt.Errorf("insert card offer: %w", err)
	}
	return r.GetByID(ctx, userID, id)
}

func (r *CardOfferRepo) GetByID(ctx context.Context, userID, offerID string) (*model.CardOffer, error) {
	rows, err := r.queryUserOffers(ctx, userID, offerID, false)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("offer not found")
	}
	return &rows[0], nil
}

// ListByUser returns the user's offers. activeOnly filters out expired-or-used.
func (r *CardOfferRepo) ListByUser(ctx context.Context, userID string, activeOnly bool) ([]model.CardOffer, error) {
	return r.queryUserOffers(ctx, userID, "", activeOnly)
}

func (r *CardOfferRepo) queryUserOffers(ctx context.Context, userID, singleID string, activeOnly bool) ([]model.CardOffer, error) {
	q := `
		SELECT o.id, o.user_id, o.card_id, c.name,
		       o.source, o.merchant, o.description, o.earn_amount, o.min_spend,
		       o.activated_at, o.expires_at, o.is_used, o.used_at, o.notes
		FROM card_offers o
		JOIN cards c ON c.id = o.card_id
		WHERE o.user_id = $1
		  %s
		  %s
		ORDER BY o.expires_at NULLS LAST, o.created_at DESC
	`
	args := []any{userID}
	idFilter, activeFilter := "", ""
	if singleID != "" {
		idFilter = "AND o.id = $2"
		args = append(args, singleID)
	}
	if activeOnly {
		activeFilter = "AND o.is_used = false AND (o.expires_at IS NULL OR o.expires_at >= CURRENT_DATE)"
	}
	rows, err := r.db.Query(ctx, fmt.Sprintf(q, idFilter, activeFilter), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.CardOffer
	for rows.Next() {
		var o model.CardOffer
		var activatedAt, expiresAt, usedAt *time.Time
		if err := rows.Scan(&o.ID, &o.UserID, &o.CardID, &o.CardName,
			&o.Source, &o.Merchant, &o.Description, &o.EarnAmount, &o.MinSpend,
			&activatedAt, &expiresAt, &o.IsUsed, &usedAt, &o.Notes); err != nil {
			return nil, err
		}
		if activatedAt != nil {
			s := activatedAt.Format("2006-01-02")
			o.ActivatedAt = &s
		}
		if expiresAt != nil {
			s := expiresAt.Format("2006-01-02")
			o.ExpiresAt = &s
			days := int(time.Until(expiresAt.Add(24 * time.Hour)).Hours() / 24)
			o.DaysToExpiry = &days
		}
		if usedAt != nil {
			s := usedAt.Format("2006-01-02")
			o.UsedAt = &s
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// MarkUsed flips is_used and stamps used_at = today.
func (r *CardOfferRepo) MarkUsed(ctx context.Context, userID, offerID string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE card_offers
		SET is_used = true,
		    used_at = CURRENT_DATE,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, offerID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("offer not found")
	}
	return nil
}

func (r *CardOfferRepo) Delete(ctx context.Context, userID, offerID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM card_offers WHERE id = $1 AND user_id = $2`, offerID, userID)
	return err
}
