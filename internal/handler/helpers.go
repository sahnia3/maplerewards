package handler

import (
	"encoding/json"
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
