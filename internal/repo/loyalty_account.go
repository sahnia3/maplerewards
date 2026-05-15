package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/model"
)

type LoyaltyAccountRepo struct {
	db *pgxpool.Pool
}

func NewLoyaltyAccountRepo(db *pgxpool.Pool) *LoyaltyAccountRepo {
	return &LoyaltyAccountRepo{db: db}
}

// ExpiryRule is the per-program inactivity policy seeded in
// loyalty_expiry_rules. The service uses it to derive expires_at when the
// user supplies last_activity but not an explicit date.
type ExpiryRule struct {
	ProgramSlug          string
	InactivityMonths     *int
	FixedMonthsFromEarn  *int
	Notes                string
}

func (r *LoyaltyAccountRepo) GetExpiryRule(ctx context.Context, programSlug string) (*ExpiryRule, error) {
	var er ExpiryRule
	err := r.db.QueryRow(ctx, `
		SELECT program_slug, inactivity_months, fixed_months_from_earn, COALESCE(notes,'')
		FROM loyalty_expiry_rules WHERE program_slug = $1
	`, programSlug).Scan(&er.ProgramSlug, &er.InactivityMonths, &er.FixedMonthsFromEarn, &er.Notes)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &er, nil
}

func (r *LoyaltyAccountRepo) Create(ctx context.Context, userID string, req model.CreateLoyaltyAccountRequest) (*model.LoyaltyAccount, error) {
	if req.ProgramSlug == "" {
		return nil, fmt.Errorf("program_slug required")
	}
	row := r.db.QueryRow(ctx, `
		INSERT INTO loyalty_accounts
		    (user_id, program_slug, account_label, balance, expires_at, last_activity, notes)
		VALUES ($1, $2, $3, $4, $5::date, $6::date, $7)
		ON CONFLICT (user_id, program_slug, COALESCE(account_label, '')) DO UPDATE
		    SET balance       = EXCLUDED.balance,
		        expires_at    = COALESCE(EXCLUDED.expires_at, loyalty_accounts.expires_at),
		        last_activity = COALESCE(EXCLUDED.last_activity, loyalty_accounts.last_activity),
		        notes         = COALESCE(EXCLUDED.notes, loyalty_accounts.notes),
		        updated_at    = NOW()
		RETURNING id
	`, userID, req.ProgramSlug, req.AccountLabel, req.Balance, req.ExpiresAt, req.LastActivity, req.Notes)
	var id string
	if err := row.Scan(&id); err != nil {
		return nil, fmt.Errorf("upsert loyalty account: %w", err)
	}
	return r.GetByID(ctx, userID, id)
}

func (r *LoyaltyAccountRepo) GetByID(ctx context.Context, userID, accountID string) (*model.LoyaltyAccount, error) {
	rows, err := r.queryUserAccounts(ctx, userID, accountID)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("loyalty account not found")
	}
	return &rows[0], nil
}

func (r *LoyaltyAccountRepo) ListByUser(ctx context.Context, userID string) ([]model.LoyaltyAccount, error) {
	return r.queryUserAccounts(ctx, userID, "")
}

func (r *LoyaltyAccountRepo) queryUserAccounts(ctx context.Context, userID, singleID string) ([]model.LoyaltyAccount, error) {
	q := `
		SELECT la.id, la.user_id, la.program_slug, COALESCE(lp.name, la.program_slug),
		       la.account_label, la.balance, la.expires_at, la.last_activity, la.notes
		FROM loyalty_accounts la
		LEFT JOIN loyalty_programs lp ON lp.slug = la.program_slug
		WHERE la.user_id = $1 %s
		ORDER BY la.expires_at NULLS LAST, lp.name
	`
	args := []any{userID}
	filter := ""
	if singleID != "" {
		filter = "AND la.id = $2"
		args = append(args, singleID)
	}
	rows, err := r.db.Query(ctx, fmt.Sprintf(q, filter), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.LoyaltyAccount
	for rows.Next() {
		var a model.LoyaltyAccount
		var expires, lastAct *time.Time
		if err := rows.Scan(&a.ID, &a.UserID, &a.ProgramSlug, &a.ProgramName,
			&a.AccountLabel, &a.Balance, &expires, &lastAct, &a.Notes); err != nil {
			return nil, err
		}
		if expires != nil {
			s := expires.Format("2006-01-02")
			a.ExpiresAt = &s
		}
		if lastAct != nil {
			s := lastAct.Format("2006-01-02")
			a.LastActivity = &s
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *LoyaltyAccountRepo) Update(ctx context.Context, userID, accountID string, req model.UpdateLoyaltyAccountRequest) (*model.LoyaltyAccount, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE loyalty_accounts
		SET balance       = COALESCE($3, balance),
		    expires_at    = COALESCE($4::date, expires_at),
		    last_activity = COALESCE($5::date, last_activity),
		    notes         = COALESCE($6, notes),
		    updated_at    = NOW()
		WHERE id = $1 AND user_id = $2
	`, accountID, userID, req.Balance, req.ExpiresAt, req.LastActivity, req.Notes)
	if err != nil {
		return nil, fmt.Errorf("update loyalty account: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("loyalty account not found")
	}
	return r.GetByID(ctx, userID, accountID)
}

func (r *LoyaltyAccountRepo) Delete(ctx context.Context, userID, accountID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM loyalty_accounts WHERE id = $1 AND user_id = $2`, accountID, userID)
	return err
}
