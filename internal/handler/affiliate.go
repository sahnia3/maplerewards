package handler

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/repo"
)

// AffiliateHandler exposes the click-then-redirect endpoint that surfaces
// apply-now CTAs on every public card listing. The endpoint:
//
//  1. Looks up the affiliate_url configured on the card.
//  2. Logs a click row (with user_id when JWT is present, anon otherwise).
//  3. 302-redirects to the affiliate URL.
//
// If no affiliate_url is configured for the card, responds 404 — the schema
// stores no per-card issuer application URL to fall back to, and redirecting
// back to the card detail page the user just clicked from is a dead loop.
type AffiliateHandler struct {
	repo        *repo.AffiliateRepo
	frontendURL string
}

func NewAffiliateHandler(r *repo.AffiliateRepo, frontendURL string) *AffiliateHandler {
	return &AffiliateHandler{repo: r, frontendURL: frontendURL}
}

// Click handles GET /affiliate/click/{cardID}
func (h *AffiliateHandler) Click(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "cardID")
	if cardID == "" {
		http.Error(w, "card id required", http.StatusBadRequest)
		return
	}
	// This is a public, unauthenticated endpoint and cardID is reflected
	// into the fallback redirect target. Constrain it to the catalog ID
	// shape (UUID or slug) so it cannot be used to craft an open redirect /
	// phishing pivot off our trusted domain.
	if !isValidUUID(cardID) && !isValidSlug(cardID) {
		http.Error(w, "invalid card id", http.StatusBadRequest)
		return
	}

	url, err := h.repo.GetAffiliateURL(r.Context(), cardID)
	if err != nil {
		slog.Warn("affiliate url lookup failed", "err", err, "card_id", cardID)
	}

	// Best-effort log — ledger failure does not abort the redirect.
	userID := mw.UserIDFromContext(r.Context())
	if logErr := h.repo.LogClick(r.Context(), userID, cardID, r.Referer(), r.UserAgent()); logErr != nil {
		slog.Warn("affiliate click log failed", "err", logErr, "card_id", cardID)
	}

	// No affiliate URL configured and no issuer application URL stored
	// anywhere in the schema — a 302 back to the card page the user clicked
	// from is a dead loop, so 404 honestly instead.
	if url == "" {
		slog.Warn("no affiliate or application url configured for card", "card_id", cardID)
		http.Error(w, "no application link configured for this card", http.StatusNotFound)
		return
	}

	http.Redirect(w, r, url, http.StatusFound)
}
