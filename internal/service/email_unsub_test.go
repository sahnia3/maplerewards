package service

import (
	"context"
	"strings"
	"testing"

	"maplerewards/internal/model"
)

func TestUnsubToken_RoundTrip(t *testing.T) {
	tok := SignUnsubToken("user-123")
	if tok == "" {
		t.Fatal("empty token")
	}
	if !VerifyUnsubToken("user-123", tok) {
		t.Error("valid token rejected")
	}
	if VerifyUnsubToken("user-999", tok) {
		t.Error("token accepted for the wrong user")
	}
	if VerifyUnsubToken("user-123", tok+"x") {
		t.Error("tampered token accepted")
	}
	if VerifyUnsubToken("", "") || VerifyUnsubToken("user-123", "") {
		t.Error("empty inputs accepted")
	}
	if SignUnsubToken("a") == SignUnsubToken("b") {
		t.Error("different users produced the same token")
	}
}

func TestUnsubscribeURL_Shape(t *testing.T) {
	url := UnsubscribeURL("user-123")
	if !strings.Contains(url, "/unsubscribe?u=user-123&t=") {
		t.Errorf("unexpected unsubscribe URL: %s", url)
	}
}

// recordingMailer captures the last message for win-back assertions.
type recordingMailer struct {
	sent *MailMessage
	fail bool
}

func (m *recordingMailer) Send(_ context.Context, msg MailMessage) error {
	if m.fail {
		return context.DeadlineExceeded
	}
	cp := msg
	m.sent = &cp
	return nil
}

func TestWinBackEmail_Gating(t *testing.T) {
	email := "user@example.com"
	mkUser := func() *model.User { return &model.User{ID: "u1", Email: &email} }

	t.Run("sends when eligible", func(t *testing.T) {
		repo := newMockBillingRepo()
		mailer := &recordingMailer{}
		s := &BillingService{repo: repo, mailer: mailer}
		s.sendWinBackEmail(context.Background(), mkUser())
		if mailer.sent == nil {
			t.Fatal("expected win-back email to be sent")
		}
		if mailer.sent.Tag != "win-back" {
			t.Errorf("tag: got %q want win-back", mailer.sent.Tag)
		}
		if !strings.Contains(mailer.sent.HTML, "/unsubscribe?u=u1") {
			t.Error("win-back email missing CASL unsubscribe footer link")
		}
	})

	t.Run("suppressed when unsubscribed", func(t *testing.T) {
		repo := newMockBillingRepo()
		repo.unsubscribed["u1"] = true
		mailer := &recordingMailer{}
		s := &BillingService{repo: repo, mailer: mailer}
		s.sendWinBackEmail(context.Background(), mkUser())
		if mailer.sent != nil {
			t.Error("win-back sent to an unsubscribed user (CASL violation)")
		}
	})

	t.Run("no email address → no send", func(t *testing.T) {
		repo := newMockBillingRepo()
		mailer := &recordingMailer{}
		s := &BillingService{repo: repo, mailer: mailer}
		s.sendWinBackEmail(context.Background(), &model.User{ID: "u1"})
		if mailer.sent != nil {
			t.Error("win-back sent to a user with no email")
		}
	})

	t.Run("nil mailer is safe", func(t *testing.T) {
		repo := newMockBillingRepo()
		s := &BillingService{repo: repo, mailer: nil}
		s.sendWinBackEmail(context.Background(), mkUser()) // must not panic
	})
}
