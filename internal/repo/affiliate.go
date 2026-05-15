package repo

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AffiliateRepo handles the affiliate-link click ledger and lookup of the
// destination URL per card. Schema lives in migrations/000019_affiliate_links.
type AffiliateRepo struct {
	db *pgxpool.Pool
}

func NewAffiliateRepo(db *pgxpool.Pool) *AffiliateRepo {
	return &AffiliateRepo{db: db}
}

// GetAffiliateURL returns the configured affiliate_url for a card (or "" when
// unset, which means we have no commercial relationship for this card yet).
func (r *AffiliateRepo) GetAffiliateURL(ctx context.Context, cardID string) (string, error) {
	var url *string
	err := r.db.QueryRow(ctx, `SELECT affiliate_url FROM cards WHERE id = $1`, cardID).Scan(&url)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("affiliate url lookup: %w", err)
	}
	if url == nil {
		return "", nil
	}
	return *url, nil
}

// LogClick records a click in the ledger. userID may be empty for anonymous
// visitors — the column is nullable. Errors are returned but the handler
// should not 5xx on them; the redirect is more important than the ledger.
func (r *AffiliateRepo) LogClick(ctx context.Context, userID, cardID, referrer, userAgent string) error {
	var uid interface{}
	if userID != "" {
		uid = userID
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO affiliate_clicks (user_id, card_id, referrer, user_agent)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''))
	`, uid, cardID, referrer, userAgent)
	if err != nil {
		return fmt.Errorf("affiliate click log: %w", err)
	}
	return nil
}
