package service

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"maplerewards/internal/repo"
)

func discardLog() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// P4.2 (docs/LAUNCH-ISSUES.md): "track what you clipped" must alert before
// expiry. These cover the DB-free paths: mailer-nil no-op and the reminder
// email composition (honest timing words, earn detail, CASL footer, tag).

type captureMailer struct {
	sent []MailMessage
	err  error
}

func (m *captureMailer) Send(_ context.Context, msg MailMessage) error {
	if m.err != nil {
		return m.err
	}
	m.sent = append(m.sent, msg)
	return nil
}

func TestOfferExpiry_NilMailer_NoOp(t *testing.T) {
	// Must return before touching the (here nil) repo — proves the dev/test
	// "no mailer configured" path is safe and silent.
	svc := NewOfferExpiryService(nil, nil)
	sent, skipped, failed := svc.RunSweep(context.Background(), discardLog(), time.Now())
	if sent != 0 || skipped != 0 || failed != 0 {
		t.Fatalf("nil mailer must no-op, got sent=%d skipped=%d failed=%d", sent, skipped, failed)
	}
}

func TestOfferExpiry_SendOne_Composition(t *testing.T) {
	earn := 50.0
	minSpend := 200.0
	cases := []struct {
		name        string
		days        int
		wantWhen    string
		wantSubject string
	}{
		{"today", 0, "today", "expires today"},
		{"tomorrow", 1, "tomorrow", "expires tomorrow"},
		{"in_3_days", 3, "in 3 days", "expires in 3 days"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			mm := &captureMailer{}
			svc := NewOfferExpiryService(nil, mm)
			rem := repo.CardOfferReminder{
				OfferID: "o1", UserID: "u1", Email: "user@example.com",
				CardName: "Amex Cobalt", Merchant: "Best Buy",
				Description: "Spend $200, get $50 back",
				EarnAmount:  &earn, MinSpend: &minSpend,
				ExpiresAt:    time.Now().AddDate(0, 0, c.days),
				DaysToExpiry: c.days,
			}
			if err := svc.sendOne(context.Background(), rem); err != nil {
				t.Fatalf("sendOne: %v", err)
			}
			if len(mm.sent) != 1 {
				t.Fatalf("expected 1 email, got %d", len(mm.sent))
			}
			got := mm.sent[0]
			if !strings.Contains(got.Subject, c.wantSubject) {
				t.Errorf("subject %q missing %q", got.Subject, c.wantSubject)
			}
			if got.To[0] != "user@example.com" {
				t.Errorf("wrong recipient %v", got.To)
			}
			if got.Tag != "offer-expiry" {
				t.Errorf("tag = %q, want offer-expiry", got.Tag)
			}
			// CASL: every commercial email must carry the unsubscribe footer.
			if !strings.Contains(strings.ToLower(got.HTML+got.Text), "unsubscribe") {
				t.Errorf("missing CASL unsubscribe footer:\n%s", got.Text)
			}
			// Honest timing + earn detail surfaced.
			if !strings.Contains(got.Text, c.wantWhen) {
				t.Errorf("body missing timing %q: %s", c.wantWhen, got.Text)
			}
			if !strings.Contains(got.HTML, "Best Buy") || !strings.Contains(got.HTML, "$50 back") {
				t.Errorf("body missing merchant/earn detail: %s", got.HTML)
			}
		})
	}
}
