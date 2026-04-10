package service

import (
	"context"
	"time"

	"maplerewards/internal/model"
)

// CardRepository abstracts card & category data access.
type CardRepository interface {
	ListCards(ctx context.Context) ([]model.Card, error)
	GetCard(ctx context.Context, id string) (*model.Card, error)
	ListCategories(ctx context.Context) ([]model.Category, error)
	GetCategoryBySlug(ctx context.Context, slug string) (*model.Category, error)
	GetCategoryByMCC(ctx context.Context, mcc int) (*model.Category, error)
	GetMultiplierForCard(ctx context.Context, cardID, categoryID string) (*model.CardMultiplier, error)
	GetEverythingElseMultiplier(ctx context.Context, cardID string) (*model.CardMultiplier, error)
}

// WalletRepository abstracts user wallet data access.
type WalletRepository interface {
	CreateUser(ctx context.Context, sessionID string) (*model.User, error)
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
	GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error)
	AddCard(ctx context.Context, userID, cardID string) (*model.UserCard, error)
	RemoveCard(ctx context.Context, userID, cardID string) error
	UpdateBalance(ctx context.Context, userID, cardID string, balance int64) error
	UpdateCardDetails(ctx context.Context, userID, cardID string, req model.UpdateCardDetailsRequest) error
}

// ValuationRepository abstracts CPP (cents per point) lookups.
type ValuationRepository interface {
	GetCPP(ctx context.Context, programSlug, segment string) (float64, error)
}

// TransferRepository abstracts transfer partner route lookups.
type TransferRepository interface {
	GetTransferRoutes(ctx context.Context, fromProgramID string) ([]model.TransferPartner, error)
}

// SpendRepository abstracts spend tracking data access.
type SpendRepository interface {
	GetMonthlySpend(ctx context.Context, userID, cardID string, month time.Time) (map[string]float64, error)
	UpsertMonthlySpend(ctx context.Context, userID, cardID, categoryID string, month time.Time, amount float64) error
	GetCapGroupForCard(ctx context.Context, cardID, categoryID string) (*model.CapGroup, error)
	CreateSpendEntry(ctx context.Context, entry model.SpendEntry) (*model.SpendEntry, error)
	ListSpendEntries(ctx context.Context, userID string, limit, offset int) ([]model.SpendEntry, error)
	GetSpendStats(ctx context.Context, userID string) (*model.SpendStats, error)
}

// BonusRepository abstracts welcome bonus tracking data access.
type BonusRepository interface {
	GetUserBonuses(ctx context.Context, userID string) ([]model.WelcomeBonus, error)
	ActivateBonus(ctx context.Context, userID, cardID string) (*model.WelcomeBonus, error)
	UpdateBonusSpend(ctx context.Context, userID, cardID string, amount float64) error
}

// ValuationCache abstracts caching for CPP valuations and wallets.
type ValuationCache interface {
	GetValuation(ctx context.Context, programSlug, segment string) (float64, error)
	SetValuation(ctx context.Context, programSlug, segment string, cpp float64) error
	GetWallet(ctx context.Context, sessionID string, dest any) error
	SetWallet(ctx context.Context, sessionID string, data any) error
	InvalidateWallet(ctx context.Context, sessionID string) error
}
