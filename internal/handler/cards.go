package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/repo"
)

type CardHandler struct {
	repo *repo.CardRepo
}

func NewCardHandler(r *repo.CardRepo) *CardHandler {
	return &CardHandler{repo: r}
}

func (h *CardHandler) List(w http.ResponseWriter, r *http.Request) {
	cards, err := h.repo.ListCards(r.Context())
	if err != nil {
		jsonError(w, "failed to fetch cards", http.StatusInternalServerError)
		return
	}
	jsonOK(w, cards)
}

func (h *CardHandler) Get(w http.ResponseWriter, r *http.Request) {
	card, err := h.repo.GetCard(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		jsonError(w, "card not found", http.StatusNotFound)
		return
	}
	jsonOK(w, card)
}

func (h *CardHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.repo.ListCategories(r.Context())
	if err != nil {
		jsonError(w, "failed to fetch categories", http.StatusInternalServerError)
		return
	}
	jsonOK(w, cats)
}
