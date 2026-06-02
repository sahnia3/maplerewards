package service

import "errors"

var (
	ErrSessionNotFound  = errors.New("session not found")
	ErrWalletEmpty      = errors.New("wallet is empty — add cards first")
	ErrCategoryUnknown  = errors.New("category not found")
	ErrInvalidInput     = errors.New("invalid input")
	ErrCardLimitReached = errors.New("free tier card limit reached")
)
