package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"

	"maplerewards/internal/repo"
)

// ── Mock issuerPageStore (interface fn-fields, per repo test convention) ─────

type mockIssuerStore struct {
	listFn          func(ctx context.Context, limit int) ([]repo.PageWithSnapshot, error)
	recordSnapshot  func(ctx context.Context, pageID, hash, text string) error
	recordCheckOnly func(ctx context.Context, pageID string) error
	recordFailure   func(ctx context.Context, pageID string) error
	recordChangeAnd func(ctx context.Context, pageID, summary, snippet string, confidence *float64, hash, text string) error

	mu sync.Mutex
	// call counters
	insertedChanges  int // RecordChangeAndSnapshot succeeded → exactly one change row committed
	snapshotAdvanced int // last_hash/last_text advanced (via change+snapshot or plain snapshot)
	failuresRecorded int
}

func (m *mockIssuerStore) ListActiveWithSnapshots(ctx context.Context, limit int) ([]repo.PageWithSnapshot, error) {
	return m.listFn(ctx, limit)
}

func (m *mockIssuerStore) RecordSnapshot(ctx context.Context, pageID, hash, text string) error {
	if m.recordSnapshot != nil {
		if err := m.recordSnapshot(ctx, pageID, hash, text); err != nil {
			return err
		}
	}
	m.mu.Lock()
	m.snapshotAdvanced++
	m.mu.Unlock()
	return nil
}

func (m *mockIssuerStore) RecordCheckOnly(ctx context.Context, pageID string) error {
	if m.recordCheckOnly != nil {
		return m.recordCheckOnly(ctx, pageID)
	}
	return nil
}

func (m *mockIssuerStore) RecordCheckFailure(ctx context.Context, pageID string) error {
	m.mu.Lock()
	m.failuresRecorded++
	m.mu.Unlock()
	if m.recordFailure != nil {
		return m.recordFailure(ctx, pageID)
	}
	return nil
}

func (m *mockIssuerStore) RecordChangeAndSnapshot(ctx context.Context, pageID, summary, snippet string, confidence *float64, hash, text string) error {
	if m.recordChangeAnd != nil {
		// Atomic: if the underlying tx fails, NEITHER the change nor the snapshot
		// is committed. The mock honours that — it does not bump either counter.
		if err := m.recordChangeAnd(ctx, pageID, summary, snippet, confidence, hash, text); err != nil {
			return err
		}
	}
	m.mu.Lock()
	m.insertedChanges++
	m.snapshotAdvanced++
	m.mu.Unlock()
	return nil
}

// ── Stub HTTP transport so we never hit the SSRF-blocked real dialer ─────────

type stubTransport struct {
	bodyByURL map[string]string
}

func (t *stubTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	body, ok := t.bodyByURL[req.URL.String()]
	if !ok {
		return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}, nil
}

func newTestService(store issuerPageStore, bodies map[string]string) *IssuerWatchService {
	return &IssuerWatchService{
		repo:         store,
		httpClient:   &http.Client{Transport: &stubTransport{bodyByURL: bodies}},
		anthropicKey: "", // no AI; deterministic fallback summary
	}
}

// A page body whose extracted text differs enough from the prior snapshot to
// clear the 80-char trivial-diff guard.
const changedPageHTML = `<html><body>
<p>NEW: Earn 5x points on groceries this quarter, up from the previous 2x rate.</p>
<p>This is a substantial and meaningful announcement that exceeds the eighty character diff threshold easily.</p>
</body></html>`

// TestProbeOne_AtomicChangeAndSnapshot is the core regression for bug #6:
// when a change is detected, exactly ONE atomic call inserts the change row AND
// advances the snapshot. A subsequent identical sweep (now seeing the advanced
// hash) must NOT re-insert the change.
func TestProbeOne_AtomicChangeAndSnapshot(t *testing.T) {
	var storedHash, storedText string

	store := &mockIssuerStore{
		recordChangeAnd: func(_ context.Context, _, _, _ string, _ *float64, hash, text string) error {
			storedHash = hash
			storedText = text
			return nil
		},
	}
	const url = "https://issuer.example/card"
	page := repo.PageWithSnapshot{LastText: "old stale page text that is completely different from the new content"}
	page.ID = "page-1"
	page.URL = url
	oldHash := "deadbeef" // non-empty → not a first-run; differs from the new hash
	page.LastHash = &oldHash

	svc := newTestService(store, map[string]string{url: changedPageHTML})

	// First sweep: change detected → atomic insert + snapshot advance.
	changed, err := svc.probeOne(context.Background(), page)
	if err != nil {
		t.Fatalf("first probe: unexpected error: %v", err)
	}
	if !changed {
		t.Fatalf("first probe: expected changed=true")
	}
	if store.insertedChanges != 1 {
		t.Fatalf("first probe: expected exactly 1 change inserted, got %d", store.insertedChanges)
	}
	if store.snapshotAdvanced != 1 {
		t.Fatalf("first probe: expected snapshot advanced once, got %d", store.snapshotAdvanced)
	}
	if storedHash == "" || storedHash == oldHash {
		t.Fatalf("first probe: snapshot hash not advanced (got %q)", storedHash)
	}

	// Second sweep: feed back the advanced snapshot. Same body → same hash →
	// RecordCheckOnly path, NO new change row.
	page.LastHash = &storedHash
	page.LastText = storedText

	changed, err = svc.probeOne(context.Background(), page)
	if err != nil {
		t.Fatalf("second probe: unexpected error: %v", err)
	}
	if changed {
		t.Fatalf("second probe: expected changed=false on identical content")
	}
	if store.insertedChanges != 1 {
		t.Fatalf("second probe: change re-inserted on unchanged page — got %d total inserts (bug #6 regression)", store.insertedChanges)
	}
}

// TestProbeOne_FailedWriteDoesNotAdvanceOrDuplicate proves the atomic failure
// is clean: if the combined change+snapshot write fails, NEITHER the change row
// nor the snapshot is committed, and probeOne reports the failure so the sweep
// records a check-failure (not a phantom success). The next sweep then re-detects
// once — without ever having created a duplicate/uncommitted change row.
func TestProbeOne_FailedWriteDoesNotAdvanceOrDuplicate(t *testing.T) {
	dbErr := errors.New("db blip")
	failOnce := true

	store := &mockIssuerStore{
		recordChangeAnd: func(_ context.Context, _, _, _ string, _ *float64, _, _ string) error {
			if failOnce {
				failOnce = false
				return dbErr // tx rolls back: nothing committed
			}
			return nil
		},
	}
	const url = "https://issuer.example/card"
	page := repo.PageWithSnapshot{LastText: "old stale text totally unlike the new content body here"}
	page.ID = "page-1"
	page.URL = url
	oldHash := "deadbeef"
	page.LastHash = &oldHash

	svc := newTestService(store, map[string]string{url: changedPageHTML})

	// First sweep: write fails → error surfaced, nothing committed.
	changed, err := svc.probeOne(context.Background(), page)
	if err == nil {
		t.Fatalf("expected error when atomic write fails")
	}
	if changed {
		// Critical: must NOT report changed=true on a failed atomic write,
		// otherwise the sweep would count it as a success and the bug-6 loop
		// would re-trigger differently. Atomic failure == clean failure.
		t.Fatalf("expected changed=false when the atomic write fails (got true)")
	}
	if store.insertedChanges != 0 {
		t.Fatalf("expected 0 committed changes after a failed atomic write, got %d", store.insertedChanges)
	}
	if store.snapshotAdvanced != 0 {
		t.Fatalf("expected snapshot NOT advanced after a failed atomic write, got %d", store.snapshotAdvanced)
	}

	// Second sweep with the SAME (un-advanced) snapshot: write now succeeds →
	// exactly one change committed and the snapshot advances. No duplicate from
	// the prior failed attempt.
	changed, err = svc.probeOne(context.Background(), page)
	if err != nil {
		t.Fatalf("second probe: unexpected error: %v", err)
	}
	if !changed {
		t.Fatalf("second probe: expected changed=true")
	}
	if store.insertedChanges != 1 {
		t.Fatalf("second probe: expected exactly 1 change total, got %d", store.insertedChanges)
	}
	if store.snapshotAdvanced != 1 {
		t.Fatalf("second probe: expected snapshot advanced once, got %d", store.snapshotAdvanced)
	}
}

// TestSweepAll_SnapshotFailureCountsAsFailure ties the unit behaviour to the
// sweep rollup: a page whose atomic write fails is counted as PagesFailed and a
// check-failure is recorded — it is NOT counted as PagesChanged.
func TestSweepAll_SnapshotFailureCountsAsFailure(t *testing.T) {
	const url = "https://issuer.example/card"
	oldHash := "deadbeef"
	store := &mockIssuerStore{
		listFn: func(_ context.Context, _ int) ([]repo.PageWithSnapshot, error) {
			p := repo.PageWithSnapshot{LastText: "old stale text totally unlike the new body content here"}
			p.ID = "page-1"
			p.URL = url
			p.LastHash = &oldHash
			return []repo.PageWithSnapshot{p}, nil
		},
		recordChangeAnd: func(_ context.Context, _, _, _ string, _ *float64, _, _ string) error {
			return errors.New("snapshot save failed")
		},
	}
	svc := newTestService(store, map[string]string{url: changedPageHTML})

	res, err := svc.SweepAll(context.Background(), 10)
	if err != nil {
		t.Fatalf("SweepAll returned error: %v", err)
	}
	if res.PagesChanged != 0 {
		t.Fatalf("expected PagesChanged=0 on atomic write failure, got %d", res.PagesChanged)
	}
	if res.PagesFailed != 1 {
		t.Fatalf("expected PagesFailed=1, got %d", res.PagesFailed)
	}
	if store.failuresRecorded != 1 {
		t.Fatalf("expected RecordCheckFailure called once, got %d", store.failuresRecorded)
	}
	if store.insertedChanges != 0 {
		t.Fatalf("expected 0 committed changes, got %d", store.insertedChanges)
	}
}
