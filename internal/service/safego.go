package service

import "log/slog"

// safeGo runs fn in a goroutine with a recover() guard. A panic in any
// background goroutine would otherwise crash the entire API process because
// the parent HTTP handler has already returned by the time it fires. Use
// this anywhere `go func()` or `go someFn()` is launched from a request-
// scoped code path.
//
// label is a short tag for the goroutine's purpose (e.g. "ai-tool-call",
// "optimizer-score"). It's logged with the recovered panic so on-call can
// trace the source without grepping for line numbers.
func safeGo(label string, fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("background goroutine panicked",
					"label", label, "err", r)
			}
		}()
		fn()
	}()
}
