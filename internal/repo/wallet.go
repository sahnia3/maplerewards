package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type WalletRepo struct {
	db *pgxpool.Pool
}

func NewWalletRepo(db *pgxpool.Pool) *WalletRepo {
	return &WalletRepo{db: db}
}

func (r *WalletRepo) CreateUser(ctx context.Context, sessionID string) (*model.User, error) {
	u := &model.User{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (session_id) VALUES ($1)
		ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id
		RETURNING id, email, session_id, created_at
	`, sessionID).Scan(&u.ID, &u.Email, &u.SessionID, &u.CreatedAt)
	return u, err
}

func (r *WalletRepo) GetUserBySession(ctx context.Context, sessionID string) (*model.User, error) {
	u := &model.User{}
	err := r.db.QueryRow(ctx, `
		SELECT id, email, session_id, created_at
		FROM users WHERE session_id = $1
	`, sessionID).Scan(&u.ID, &u.Email, &u.SessionID, &u.CreatedAt)
	return u, err
}

func (r *WalletRepo) GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			uc.id, uc.user_id, uc.card_id, uc.point_balance, uc.added_at,
			c.id, c.name, c.issuer, c.network, c.loyalty_program_id,
			c.annual_fee, c.welcome_bonus_points, c.welcome_bonus_min_spend,
			c.welcome_bonus_months, c.is_active, c.created_at,
			lp.id, lp.name, lp.slug, lp.currency_name, lp.program_type,
			lp.base_cpp, lp.is_active, lp.updated_at
		FROM user_cards uc
		JOIN cards c ON c.id = uc.card_id
		JOIN loyalty_programs lp ON lp.id = c.loyalty_program_id
		WHERE uc.user_id = $1
		ORDER BY uc.added_at
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userCards []model.UserCard
	for rows.Next() {
		var uc model.UserCard
		uc.Card = &model.Card{LoyaltyProgram: &model.LoyaltyProgram{}}
		if err := rows.Scan(
			&uc.ID, &uc.UserID, &uc.CardID, &uc.PointBalance, &uc.AddedAt,
			&uc.Card.ID, &uc.Card.Name, &uc.Card.Issuer, &uc.Card.Network, &uc.Card.LoyaltyProgramID,
			&uc.Card.AnnualFee, &uc.Card.WelcomeBonusPoints, &uc.Card.WelcomeBonusMinSpend,
			&uc.Card.WelcomeBonusMonths, &uc.Card.IsActive, &uc.Card.CreatedAt,
			&uc.Card.LoyaltyProgram.ID, &uc.Card.LoyaltyProgram.Name, &uc.Card.LoyaltyProgram.Slug,
			&uc.Card.LoyaltyProgram.CurrencyName, &uc.Card.LoyaltyProgram.ProgramType,
			&uc.Card.LoyaltyProgram.BaseCPP, &uc.Card.LoyaltyProgram.IsActive,
			&uc.Card.LoyaltyProgram.UpdatedAt,
		); err != nil {
			return nil, err
		}
		userCards = append(userCards, uc)
	}
	return userCards, rows.Err()
}

func (r *WalletRepo) AddCard(ctx context.Context, userID, cardID string) (*model.UserCard, error) {
	uc := &model.UserCard{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO user_cards (user_id, card_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, card_id) DO UPDATE SET card_id = EXCLUDED.card_id
		RETURNING id, user_id, card_id, point_balance, added_at
	`, userID, cardID).Scan(&uc.ID, &uc.UserID, &uc.CardID, &uc.PointBalance, &uc.AddedAt)
	return uc, err
}

func (r *WalletRepo) RemoveCard(ctx context.Context, userID, cardID string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM user_cards WHERE user_id = $1 AND card_id = $2
	`, userID, cardID)
	return err
}

func (r *WalletRepo) UpdateBalance(ctx context.Context, userID, cardID string, balance int64) error {
	_, err := r.db.Exec(ctx, `
		UPDATE user_cards SET point_balance = $3
		WHERE user_id = $1 AND card_id = $2
	`, userID, cardID, balance)
	return err
}
