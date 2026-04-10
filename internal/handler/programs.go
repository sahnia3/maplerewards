package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type ProgramHandler struct {
	cardRepo     *repo.CardRepo
	transferRepo *repo.TransferRepo
}

func NewProgramHandler(cardRepo *repo.CardRepo, transferRepo *repo.TransferRepo) *ProgramHandler {
	return &ProgramHandler{cardRepo: cardRepo, transferRepo: transferRepo}
}

func (h *ProgramHandler) List(w http.ResponseWriter, r *http.Request) {
	programs, err := h.cardRepo.ListPrograms(r.Context())
	if err != nil {
		jsonError(w, "failed to fetch programs", http.StatusInternalServerError)
		return
	}
	if programs == nil {
		programs = []model.LoyaltyProgram{}
	}
	jsonOK(w, programs)
}

func (h *ProgramHandler) GetDetail(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ctx := r.Context()

	prog, err := h.cardRepo.GetProgramBySlug(ctx, slug)
	if err != nil {
		jsonError(w, "program not found", http.StatusNotFound)
		return
	}

	transferOut, _ := h.transferRepo.GetTransferRoutes(ctx, prog.ID)
	if transferOut == nil {
		transferOut = []model.TransferPartner{}
	}
	transferIn, _ := h.transferRepo.GetTransferRoutesFrom(ctx, prog.ID)
	if transferIn == nil {
		transferIn = []model.TransferPartner{}
	}

	jsonOK(w, map[string]any{
		"program":      prog,
		"transfer_out": transferOut,
		"transfer_in":  transferIn,
	})
}
