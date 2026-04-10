package testutil

import (
	"context"

	"maplerewards/internal/model"
)

// MockOptimizerService implements handler.Optimizer for tests.
type MockOptimizerService struct {
	GetBestCardFn func(ctx context.Context, req model.OptimizeRequest) ([]model.CardRecommendation, error)
}

func NewMockOptimizerService() *MockOptimizerService {
	return &MockOptimizerService{
		GetBestCardFn: func(ctx context.Context, req model.OptimizeRequest) ([]model.CardRecommendation, error) {
			return []model.CardRecommendation{
				{
					CardID:          "test-card",
					CardName:        "Test Card",
					ProgramName:     "Test Program",
					EarnRate:        2.0,
					ProgramCPP:      1.5,
					EffectiveReturn: 3.0,
					PointsEarned:    200,
					DollarValue:     3.0,
				},
			}, nil
		},
	}
}

func (m *MockOptimizerService) GetBestCard(ctx context.Context, req model.OptimizeRequest) ([]model.CardRecommendation, error) {
	return m.GetBestCardFn(ctx, req)
}
