package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type StackRepo struct {
	db *pgxpool.Pool
}

func NewStackRepo(db *pgxpool.Pool) *StackRepo { return &StackRepo{db: db} }

func (r *StackRepo) ListMerchants(ctx context.Context) ([]model.Merchant, error) {
	rows, err := r.db.Query(ctx, `SELECT slug, name, COALESCE(category_slug,''), COALESCE(primary_url,'') FROM merchants ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Merchant
	for rows.Next() {
		var m model.Merchant
		if err := rows.Scan(&m.Slug, &m.Name, &m.CategorySlug, &m.PrimaryURL); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *StackRepo) GetMerchant(ctx context.Context, slug string) (*model.Merchant, error) {
	var m model.Merchant
	err := r.db.QueryRow(ctx,
		`SELECT slug, name, COALESCE(category_slug,''), COALESCE(primary_url,'') FROM merchants WHERE slug = $1`, slug,
	).Scan(&m.Slug, &m.Name, &m.CategorySlug, &m.PrimaryURL)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *StackRepo) BestPortalRate(ctx context.Context, merchantSlug string) (*model.PortalRate, error) {
	var p model.PortalRate
	var scrapedAt time.Time
	err := r.db.QueryRow(ctx, `
		SELECT portal, merchant_slug, rate_pct, COALESCE(source_url,''), scraped_at
		FROM portal_rates
		WHERE merchant_slug = $1 AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
		ORDER BY rate_pct DESC LIMIT 1
	`, merchantSlug).Scan(&p.Portal, &p.Merchant, &p.RatePct, &p.SourceURL, &scrapedAt)
	if err != nil {
		return nil, err
	}
	p.ScrapedAt = scrapedAt.Format(time.RFC3339)
	return &p, nil
}

func (r *StackRepo) ActiveOffersForMerchant(ctx context.Context, merchantSlug string) ([]model.NetworkOffer, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, network, merchant_slug, title, reward_type, reward_value, min_spend, card_filter, valid_to, source, COALESCE(source_url,'')
		FROM network_offers
		WHERE merchant_slug = $1 AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
		ORDER BY reward_value DESC
	`, merchantSlug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.NetworkOffer
	for rows.Next() {
		var o model.NetworkOffer
		var validTo *time.Time
		if err := rows.Scan(&o.ID, &o.Network, &o.Merchant, &o.Title, &o.RewardType,
			&o.RewardValue, &o.MinSpend, &o.CardFilter, &validTo, &o.Source, &o.SourceURL); err != nil {
			return nil, err
		}
		if validTo != nil {
			s := validTo.Format("2006-01-02")
			o.ValidTo = &s
		}
		out = append(out, o)
	}
	return out, rows.Err()
}
