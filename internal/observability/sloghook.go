package observability

import (
	"context"
	"errors"
	"log/slog"
)

// SentryHandler wraps an underlying slog.Handler and forwards every
// ERROR-level record to the package-level Reporter. WARN+ is configurable
// via the MinForwardLevel field.
//
// The underlying handler still receives the record so stdout/file logging
// keeps working unchanged. This is a *tee*, not a replacement.
type SentryHandler struct {
	Underlying       slog.Handler
	MinForwardLevel  slog.Level // default slog.LevelError
}

// NewSentryHandler tees slog records to the default reporter on ERROR and
// above (by default). Pass an explicit MinForwardLevel to widen the net.
func NewSentryHandler(underlying slog.Handler) *SentryHandler {
	return &SentryHandler{
		Underlying:      underlying,
		MinForwardLevel: slog.LevelError,
	}
}

func (h *SentryHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.Underlying.Enabled(ctx, level)
}

func (h *SentryHandler) Handle(ctx context.Context, r slog.Record) error {
	// Always pass through to the original handler first so logs aren't lost
	// if Sentry is misconfigured.
	if err := h.Underlying.Handle(ctx, r); err != nil {
		return err
	}
	if r.Level < h.MinForwardLevel {
		return nil
	}
	rep := Default()
	if _, isNoop := rep.(NoopReporter); isNoop {
		return nil
	}

	extra := make(map[string]any, r.NumAttrs())
	var errAttr error
	r.Attrs(func(a slog.Attr) bool {
		// Special-case `err` so it goes into the exception block.
		if a.Key == "err" || a.Key == "error" {
			if e, ok := a.Value.Any().(error); ok {
				errAttr = e
				return true
			}
			errAttr = errors.New(a.Value.String())
			return true
		}
		extra[a.Key] = a.Value.Any()
		return true
	})

	if errAttr != nil {
		rep.CaptureError(ctx, errAttr, extra)
	} else {
		rep.CaptureMessage(ctx, r.Level.String(), r.Message, extra)
	}
	return nil
}

func (h *SentryHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &SentryHandler{
		Underlying:      h.Underlying.WithAttrs(attrs),
		MinForwardLevel: h.MinForwardLevel,
	}
}

func (h *SentryHandler) WithGroup(name string) slog.Handler {
	return &SentryHandler{
		Underlying:      h.Underlying.WithGroup(name),
		MinForwardLevel: h.MinForwardLevel,
	}
}
