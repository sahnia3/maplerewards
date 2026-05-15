package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// APIError is the structured error response format.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

func jsonOK(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data) //nolint:errcheck
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	code := "ERROR"
	switch status {
	case http.StatusBadRequest:
		code = "INVALID_REQUEST"
	case http.StatusNotFound:
		code = "NOT_FOUND"
	case http.StatusTooManyRequests:
		code = "RATE_LIMITED"
	case http.StatusInternalServerError:
		code = "INTERNAL_ERROR"
	}
	jsonErrorCode(w, code, msg, status)
}

func jsonErrorCode(w http.ResponseWriter, code, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIError{Code: code, Message: msg}) //nolint:errcheck
}

// jsonInternalError logs the full error server-side and returns a generic
// 500 to the client. Use this in place of `jsonError(w, err.Error(), 500)`
// to avoid leaking pgx/pq schema names, internal table names, or stack
// traces. `where` is a short tag identifying the call site for log triage
// (e.g., "wallet.list", "trip.evaluate").
func jsonInternalError(w http.ResponseWriter, where string, err error) {
	slog.Error("handler internal error", "where", where, "err", err)
	jsonErrorCode(w, "INTERNAL_ERROR", "something went wrong on our end, try again shortly", http.StatusInternalServerError)
}

// jsonMaskedError logs the full error server-side and returns a generic
// 400 to the client. Use for service-layer errors that should NOT leak DB
// internals to the response body but are technically client-caused.
// `userMsg` is the short, safe message shown to the user.
func jsonMaskedError(w http.ResponseWriter, where string, err error, userMsg string, status int) {
	slog.Warn("handler masked error", "where", where, "err", err, "status", status)
	jsonError(w, userMsg, status)
}
