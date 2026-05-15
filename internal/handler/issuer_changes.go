package handler

import (
	"net/http"
	"strconv"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// IssuerChangesHandler exposes the public-good "what changed in the
// Canadian credit-card market this week" feed produced by the diff-watch
// worker. Open to anonymous users — devaluation news is not a Pro-only
// asset; surfacing it builds editorial trust.
type IssuerChangesHandler struct {
	repo *repo.IssuerPageRepo
}

func NewIssuerChangesHandler(r *repo.IssuerPageRepo) *IssuerChangesHandler {
	return &IssuerChangesHandler{repo: r}
}

// List handles GET /issuer-changes?limit=30
func (h *IssuerChangesHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 30
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	changes, err := h.repo.ListRecentChanges(r.Context(), limit)
	if err != nil {
		jsonError(w, "failed to load issuer changes", http.StatusInternalServerError)
		return
	}
	if changes == nil {
		changes = []model.IssuerPageChange{}
	}
	jsonOK(w, changes)
}
