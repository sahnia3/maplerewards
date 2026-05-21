package handler

import (
	"strings"
	"sync"
	"time"
)

// loginThrottle is a process-local per-account failed-login limiter. The
// generic per-IP rate limiter does not stop distributed credential stuffing
// against a single account (attacker rotates source IPs). This adds a
// per-email lockout: after too many failures in a window, further attempts
// are rejected for a cooldown regardless of source IP. State is in-memory
// (best-effort; a Redis-backed cross-instance limiter is a separate, larger
// piece of work) and self-pruning.
type loginThrottle struct {
	mu   sync.Mutex
	att  map[string]*loginAttempt
	stop chan struct{}
}

type loginAttempt struct {
	count       int
	windowStart time.Time
	lockedUntil time.Time
}

const (
	loginMaxFailures   = 7                // failures allowed per window
	loginFailWindow    = 15 * time.Minute // window the failures are counted in
	loginLockoutPeriod = 15 * time.Minute // cooldown once tripped
)

func newLoginThrottle() *loginThrottle {
	t := &loginThrottle{att: make(map[string]*loginAttempt), stop: make(chan struct{})}
	go t.cleanupLoop()
	return t
}

// cleanupLoop periodically evicts stale entries. allowed()'s on-access prune
// only fires when the SAME key is revisited, so a distributed credential-
// stuffing spray of many distinct emails (each tried once) would otherwise
// leave one permanent entry per email → unbounded map growth → memory DoS.
// This sweeper bounds it, mirroring middleware.RateLimiter's cleanup ticker.
func (t *loginThrottle) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-t.stop:
			return
		case now := <-ticker.C:
			t.mu.Lock()
			for k, a := range t.att {
				// Evict only entries with no live lockout AND an elapsed
				// failure window — i.e. exactly what allowed() would discard.
				if now.After(a.lockedUntil) && now.Sub(a.windowStart) > loginFailWindow {
					delete(t.att, k)
				}
			}
			t.mu.Unlock()
		}
	}
}

// Stop halts the cleanup goroutine (graceful shutdown / tests).
func (t *loginThrottle) Stop() { close(t.stop) }

func normalizeLoginKey(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// allowed reports whether a login attempt for this email may proceed.
func (t *loginThrottle) allowed(email string) bool {
	key := normalizeLoginKey(email)
	if key == "" {
		return true // empty handled by normal validation
	}
	now := time.Now()
	t.mu.Lock()
	defer t.mu.Unlock()
	a := t.att[key]
	if a == nil {
		return true
	}
	if now.Before(a.lockedUntil) {
		return false
	}
	if now.Sub(a.windowStart) > loginFailWindow {
		delete(t.att, key) // window elapsed — forget history
	}
	return true
}

// recordFailure tallies a failed attempt and locks the account if the
// threshold is exceeded within the window.
func (t *loginThrottle) recordFailure(email string) {
	key := normalizeLoginKey(email)
	if key == "" {
		return
	}
	now := time.Now()
	t.mu.Lock()
	defer t.mu.Unlock()
	a := t.att[key]
	if a == nil || now.Sub(a.windowStart) > loginFailWindow {
		t.att[key] = &loginAttempt{count: 1, windowStart: now}
		return
	}
	a.count++
	if a.count >= loginMaxFailures {
		a.lockedUntil = now.Add(loginLockoutPeriod)
	}
}

// recordSuccess clears any failure history for the account.
func (t *loginThrottle) recordSuccess(email string) {
	key := normalizeLoginKey(email)
	if key == "" {
		return
	}
	t.mu.Lock()
	delete(t.att, key)
	t.mu.Unlock()
}
