package observability

import (
	"context"
	"testing"
	"time"
)

// otherReporter is a concrete type distinct from NoopReporter, mirroring the
// real *sentryReporter installed when SENTRY_DSN is set.
type otherReporter struct{}

func (otherReporter) CaptureError(context.Context, error, map[string]any)            {}
func (otherReporter) CaptureMessage(context.Context, string, string, map[string]any) {}
func (otherReporter) Flush(time.Duration) bool                                       { return true }

// TestSetDefault_DifferentConcreteType reproduces the boot panic: init() stores
// a NoopReporter, then SetDefault stores a different concrete type. With the raw
// interface in atomic.Value this panicked ("store of inconsistently typed
// value"), crash-looping the API the moment SENTRY_DSN was set. The reporterHolder
// wrapper keeps one concrete type so the second store is safe.
func TestSetDefault_DifferentConcreteType(t *testing.T) {
	SetDefault(NoopReporter{}) // same type as init
	SetDefault(otherReporter{}) // different type — must not panic
	if _, ok := Default().(otherReporter); !ok {
		t.Fatalf("Default() did not return the installed reporter, got %T", Default())
	}
	SetDefault(nil) // nil must fall back to Noop, not panic
	if _, ok := Default().(NoopReporter); !ok {
		t.Fatalf("Default() after nil should be NoopReporter, got %T", Default())
	}
}
