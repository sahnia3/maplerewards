package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type TransferRepo struct {
	db *pgxpool.Pool
}

func NewTransferRepo(db *pgxpool.Pool) *TransferRepo {
	return &TransferRepo{db: db}
}

// GetTransferRoutesFrom returns all active transfer routes coming INTO a given loyalty program.
func (r *TransferRepo) GetTransferRoutesFrom(ctx context.Context, toProgramID string) ([]model.TransferPartner, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			tp.id, tp.from_program_id, tp.to_program_id,
			tp.transfer_ratio, tp.minimum_transfer,
			COALESCE(tp.transfer_increment, 0), tp.processing_days,
			tp.is_active, COALESCE(tp.notes, ''),
			lp.id, lp.name, lp.slug, lp.currency_name, lp.program_type,
			lp.base_cpp, lp.is_active, lp.updated_at
		FROM transfer_partners tp
		JOIN loyalty_programs lp ON lp.id = tp.from_program_id
		WHERE tp.to_program_id = $1
		  AND tp.is_active = true
		  AND tp.effective_from <= CURRENT_DATE
		  AND (tp.effective_to IS NULL OR tp.effective_to >= CURRENT_DATE)
	`, toProgramID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var partners []model.TransferPartner
	for rows.Next() {
		var tp model.TransferPartner
		tp.FromProgram = &model.LoyaltyProgram{}
		if err := rows.Scan(
			&tp.ID, &tp.FromProgramID, &tp.ToProgramID,
			&tp.TransferRatio, &tp.MinimumTransfer,
			&tp.TransferIncrement, &tp.ProcessingDays,
			&tp.IsActive, &tp.Notes,
			&tp.FromProgram.ID, &tp.FromProgram.Name, &tp.FromProgram.Slug,
			&tp.FromProgram.CurrencyName, &tp.FromProgram.ProgramType,
			&tp.FromProgram.BaseCPP, &tp.FromProgram.IsActive, &tp.FromProgram.UpdatedAt,
		); err != nil {
			return nil, err
		}
		partners = append(partners, tp)
	}
	return partners, rows.Err()
}

// GetTransferRoutes returns all active transfer routes from a given loyalty program.
func (r *TransferRepo) GetTransferRoutes(ctx context.Context, fromProgramID string) ([]model.TransferPartner, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			tp.id, tp.from_program_id, tp.to_program_id,
			tp.transfer_ratio, tp.minimum_transfer,
			COALESCE(tp.transfer_increment, 0), tp.processing_days,
			tp.is_active, COALESCE(tp.notes, ''),
			lp.id, lp.name, lp.slug, lp.currency_name, lp.program_type,
			lp.base_cpp, lp.is_active, lp.updated_at
		FROM transfer_partners tp
		JOIN loyalty_programs lp ON lp.id = tp.to_program_id
		WHERE tp.from_program_id = $1
		  AND tp.is_active = true
		  AND tp.effective_from <= CURRENT_DATE
		  AND (tp.effective_to IS NULL OR tp.effective_to >= CURRENT_DATE)
	`, fromProgramID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var partners []model.TransferPartner
	for rows.Next() {
		var tp model.TransferPartner
		tp.ToProgram = &model.LoyaltyProgram{}
		if err := rows.Scan(
			&tp.ID, &tp.FromProgramID, &tp.ToProgramID,
			&tp.TransferRatio, &tp.MinimumTransfer,
			&tp.TransferIncrement, &tp.ProcessingDays,
			&tp.IsActive, &tp.Notes,
			&tp.ToProgram.ID, &tp.ToProgram.Name, &tp.ToProgram.Slug,
			&tp.ToProgram.CurrencyName, &tp.ToProgram.ProgramType,
			&tp.ToProgram.BaseCPP, &tp.ToProgram.IsActive, &tp.ToProgram.UpdatedAt,
		); err != nil {
			return nil, err
		}
		partners = append(partners, tp)
	}
	return partners, rows.Err()
}
