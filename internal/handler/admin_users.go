package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

// userLister is the admin user-list query (satisfied by *repo.AuthRepo).
type userLister interface {
	ListUsers(ctx context.Context, limit, offset int, search string) ([]repo.AdminUserListItem, int, error)
}

// userActivityExporter aggregates one user's full activity (satisfied by
// *service.DataExportService) — reused for the admin detail view.
type userActivityExporter interface {
	Export(ctx context.Context, userID string) (*service.ExportPayload, error)
}

// AdminUsersHandler serves the admin user-activity panel. Mounted behind
// JWTRequired + RequireAdmin — never expose these routes unauthenticated.
type AdminUsersHandler struct {
	users    userLister
	exporter userActivityExporter
}

func NewAdminUsersHandler(users userLister, exporter userActivityExporter) *AdminUsersHandler {
	return &AdminUsersHandler{users: users, exporter: exporter}
}

// List handles GET /admin/users?limit=&offset=&q= — paginated user list with
// activity counts.
func (h *AdminUsersHandler) List(w http.ResponseWriter, r *http.Request) {
	limit, offset := 50, 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	search := strings.TrimSpace(r.URL.Query().Get("q"))

	items, total, err := h.users.ListUsers(r.Context(), limit, offset, search)
	if err != nil {
		jsonInternalError(w, "admin.list_users", err)
		return
	}
	if items == nil {
		items = []repo.AdminUserListItem{}
	}
	jsonOK(w, map[string]any{
		"users":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// Get handles GET /admin/users/{id} — one user's full activity (profile,
// wallet, spend history, applications, …) via the shared export aggregator.
func (h *AdminUsersHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "user id required", http.StatusBadRequest)
		return
	}
	payload, err := h.exporter.Export(r.Context(), id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			jsonError(w, "user not found", http.StatusNotFound)
			return
		}
		jsonInternalError(w, "admin.user_detail", err)
		return
	}
	jsonOK(w, payload)
}
