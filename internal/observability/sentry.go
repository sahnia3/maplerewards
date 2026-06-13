// Package observability ships a minimal error reporter to Sentry without
// pulling in the full sentry-go SDK as a dependency. The Sentry envelope
// protocol is small enough to implement directly: parse the DSN, POST a JSON
// envelope to the `store` endpoint, no-op when DSN is unset.
//
// Design choices:
//   - No external dependency. The official SDK is feature-rich (breadcrumbs,
//     transaction tracing, profiling) but we only need the "capture exception"
//     primitive. Keep the codebase lean.
//   - Fail-open everywhere. A reporter failure must NEVER bubble back into
//     the application — logging an error then sending it should not double-
//     fail the request.
//   - Async dispatch by default. The capture call enqueues to a buffered
//     channel; a single goroutine drains and POSTs. Slow Sentry endpoints
//     don't slow down API responses.
//
// Wiring:
//
//	// in cmd/api/main.go init or main:
//	rep := observability.NewReporter(observability.Config{
//	    DSN:         os.Getenv("SENTRY_DSN"),
//	    Environment: appEnv,
//	    Release:     gitCommit,
//	})
//	observability.SetDefault(rep)
//	// then use a slog handler that calls reporter.CaptureError on ERROR-level
package observability

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Reporter is the minimal interface for shipping errors out-of-process.
// Implementations must be safe for concurrent use.
type Reporter interface {
	CaptureError(ctx context.Context, err error, extra map[string]any)
	CaptureMessage(ctx context.Context, level, message string, extra map[string]any)
	Flush(timeout time.Duration) bool
}

// Config drives Reporter construction. DSN empty → Noop reporter (compiles
// and runs everywhere; turning it on is a single env-var change).
type Config struct {
	DSN         string
	Environment string // "production" | "staging" | "development"
	Release     string // git sha or version tag
	ServerName  string // hostname or service identifier
}

// NewReporter returns a SentryReporter when DSN is set, otherwise NoopReporter.
func NewReporter(cfg Config) Reporter {
	if cfg.DSN == "" {
		return NoopReporter{}
	}
	r, err := newSentryReporter(cfg)
	if err != nil {
		slog.Warn("observability: invalid Sentry DSN, error reporting disabled", "err", err)
		return NoopReporter{}
	}
	return r
}

// ── Default singleton ───────────────────────────────────────────────────────

var defaultReporter atomic.Value // holds reporterHolder

// reporterHolder pins a single concrete type inside the atomic.Value. Storing
// the Reporter interface directly stores its DYNAMIC type, so the init-time
// NoopReporter and a later *sentryReporter are different concrete types —
// atomic.Value panics ("store of inconsistently typed value") on the second
// Store. Wrapping every value in the same struct keeps the concrete type stable.
type reporterHolder struct{ r Reporter }

func init() {
	defaultReporter.Store(reporterHolder{r: NoopReporter{}})
}

// SetDefault installs the package-level reporter. Call once at boot.
func SetDefault(r Reporter) {
	if r == nil {
		r = NoopReporter{}
	}
	defaultReporter.Store(reporterHolder{r: r})
}

// Default returns the currently installed reporter. Safe to call before
// SetDefault — returns NoopReporter until configured.
func Default() Reporter {
	h, _ := defaultReporter.Load().(reporterHolder)
	if h.r == nil {
		return NoopReporter{}
	}
	return h.r
}

// ── Noop reporter ───────────────────────────────────────────────────────────

type NoopReporter struct{}

func (NoopReporter) CaptureError(context.Context, error, map[string]any)         {}
func (NoopReporter) CaptureMessage(context.Context, string, string, map[string]any) {}
func (NoopReporter) Flush(time.Duration) bool                                    { return true }

// ── Sentry HTTP reporter ────────────────────────────────────────────────────

type sentryReporter struct {
	cfg        Config
	endpoint   string // e.g., https://oXXXX.ingest.sentry.io/api/PROJECT_ID/store/
	publicKey  string

	queue chan *sentryEvent
	wg    sync.WaitGroup
	done  chan struct{}
}

type sentryEvent struct {
	EventID     string                 `json:"event_id"`
	Timestamp   float64                `json:"timestamp"`
	Platform    string                 `json:"platform"`
	Logger      string                 `json:"logger"`
	Level       string                 `json:"level"`
	Message     string                 `json:"message,omitempty"`
	Environment string                 `json:"environment"`
	Release     string                 `json:"release,omitempty"`
	ServerName  string                 `json:"server_name,omitempty"`
	Exception   *sentryExceptionList   `json:"exception,omitempty"`
	Extra       map[string]any         `json:"extra,omitempty"`
	Contexts    map[string]map[string]any `json:"contexts,omitempty"`
}

type sentryExceptionList struct {
	Values []sentryExceptionValue `json:"values"`
}

type sentryExceptionValue struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

func newSentryReporter(cfg Config) (*sentryReporter, error) {
	endpoint, key, err := parseDSN(cfg.DSN)
	if err != nil {
		return nil, err
	}
	r := &sentryReporter{
		cfg:       cfg,
		endpoint:  endpoint,
		publicKey: key,
		queue:     make(chan *sentryEvent, 512),
		done:      make(chan struct{}),
	}
	r.wg.Add(1)
	go r.run()
	return r, nil
}

// parseDSN turns "https://PUBLIC_KEY@oXXXX.ingest.sentry.io/PROJECT_ID" into
// the store endpoint URL + the public key for the X-Sentry-Auth header.
func parseDSN(dsn string) (endpoint string, key string, err error) {
	u, perr := url.Parse(dsn)
	if perr != nil {
		return "", "", fmt.Errorf("parse DSN: %w", perr)
	}
	if u.User == nil {
		return "", "", fmt.Errorf("DSN missing public key")
	}
	key = u.User.Username()
	projectID := strings.TrimPrefix(u.Path, "/")
	if projectID == "" {
		return "", "", fmt.Errorf("DSN missing project ID")
	}
	endpoint = fmt.Sprintf("%s://%s/api/%s/store/", u.Scheme, u.Host, projectID)
	return endpoint, key, nil
}

func (r *sentryReporter) run() {
	defer r.wg.Done()
	for {
		select {
		case ev := <-r.queue:
			r.post(ev)
		case <-r.done:
			// Drain remaining events before exit.
			for {
				select {
				case ev := <-r.queue:
					r.post(ev)
				default:
					return
				}
			}
		}
	}
}

func (r *sentryReporter) post(ev *sentryEvent) {
	body, err := json.Marshal(ev)
	if err != nil {
		return
	}
	req, err := http.NewRequest(http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sentry-Auth", fmt.Sprintf(
		"Sentry sentry_version=7, sentry_key=%s, sentry_client=maplerewards/1.0",
		r.publicKey,
	))
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		// Best-effort; failures here must not propagate.
		return
	}
	_ = resp.Body.Close()
}

func (r *sentryReporter) CaptureError(ctx context.Context, err error, extra map[string]any) {
	if err == nil {
		return
	}
	ev := r.baseEvent("error")
	ev.Exception = &sentryExceptionList{
		Values: []sentryExceptionValue{
			{Type: fmt.Sprintf("%T", err), Value: err.Error()},
		},
	}
	ev.Message = err.Error()
	ev.Extra = extra
	r.enqueue(ev)
}

func (r *sentryReporter) CaptureMessage(ctx context.Context, level, message string, extra map[string]any) {
	if message == "" {
		return
	}
	ev := r.baseEvent(level)
	ev.Message = message
	ev.Extra = extra
	r.enqueue(ev)
}

func (r *sentryReporter) baseEvent(level string) *sentryEvent {
	return &sentryEvent{
		EventID:     randomEventID(),
		Timestamp:   float64(time.Now().UTC().Unix()),
		Platform:    "go",
		Logger:      "maplerewards",
		Level:       level,
		Environment: r.cfg.Environment,
		Release:     r.cfg.Release,
		ServerName:  r.cfg.ServerName,
	}
}

func (r *sentryReporter) enqueue(ev *sentryEvent) {
	select {
	case r.queue <- ev:
	default:
		// Queue full — drop. Better to lose visibility than block the app.
	}
}

func (r *sentryReporter) Flush(timeout time.Duration) bool {
	close(r.done)
	doneCh := make(chan struct{})
	go func() {
		r.wg.Wait()
		close(doneCh)
	}()
	select {
	case <-doneCh:
		return true
	case <-time.After(timeout):
		return false
	}
}

// randomEventID returns a 32-char hex string suitable as Sentry's event_id.
// Uses time-based pseudo-randomness; collision odds are negligible at our
// volume and we don't depend on cryptographic strength here.
func randomEventID() string {
	now := time.Now().UnixNano()
	return fmt.Sprintf("%032x", now)[:32]
}
