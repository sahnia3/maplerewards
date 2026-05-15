package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// EmailVerifyRepository abstracts the email_verifications table.
type EmailVerifyRepository interface {
	InsertToken(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error
	FindUnconsumedByUser(ctx context.Context, userID string) (string /* hash */, time.Time /* expiresAt */, error)
	ConsumeToken(ctx context.Context, userID string) error
	MarkUserVerified(ctx context.Context, userID string) error
	GetUserVerifiedStatus(ctx context.Context, userID string) (bool, string /* email */, error)
}

// EmailVerifyService issues + verifies one-time email-confirmation tokens.
// Tokens are 32-byte hex strings; only their bcrypt hash is persisted, so a
// DB leak doesn't expose live tokens to attackers. Tokens expire after 24h.
//
// The service is intentionally tolerant of repeat send requests — we just
// invalidate any prior unconsumed token by inserting a fresh one. Verifying
// any non-expired hash for the user works.
type EmailVerifyService struct {
	repo     EmailVerifyRepository
	mailer   Mailer
	frontend string
}

func NewEmailVerifyService(repo EmailVerifyRepository, mailer Mailer) *EmailVerifyService {
	frontend := os.Getenv("FRONTEND_URL")
	if frontend == "" {
		frontend = "http://localhost:3000"
	}
	if mailer == nil {
		mailer = LogMailer{}
	}
	return &EmailVerifyService{repo: repo, mailer: mailer, frontend: strings.TrimRight(frontend, "/")}
}

const (
	emailTokenBytes = 32
	emailTokenTTL   = 24 * time.Hour
)

// IssueAndSend creates a fresh token for the user and emails the verify link.
// Idempotent: previous tokens stay in the DB but only the most recent one
// will satisfy Verify() because we look up by user_id.
func (s *EmailVerifyService) IssueAndSend(ctx context.Context, userID string) error {
	verified, email, err := s.repo.GetUserVerifiedStatus(ctx, userID)
	if err != nil {
		return fmt.Errorf("looking up user: %w", err)
	}
	if verified {
		return fmt.Errorf("email already verified")
	}
	if email == "" {
		return fmt.Errorf("user has no email on file")
	}

	tok, err := generateEmailToken()
	if err != nil {
		return fmt.Errorf("generating token: %w", err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(tok), bcrypt.MinCost)
	if err != nil {
		return fmt.Errorf("hashing token: %w", err)
	}
	expiresAt := time.Now().Add(emailTokenTTL)
	if err := s.repo.InsertToken(ctx, userID, string(hash), expiresAt); err != nil {
		return fmt.Errorf("storing token: %w", err)
	}

	link := fmt.Sprintf("%s/verify-email?token=%s&uid=%s", s.frontend, tok, userID)
	if err := s.mailer.Send(ctx, MailMessage{
		To:      []string{email},
		Subject: "Verify your Maple Rewards account",
		HTML:    verifyEmailHTML(link),
		Text:    verifyEmailText(link),
		Tag:     "verify",
	}); err != nil {
		return fmt.Errorf("sending email: %w", err)
	}
	return nil
}

// verifyEmailHTML renders the verification email body. Inline styles only —
// Gmail, Apple Mail and Outlook all strip <style> blocks in headers.
func verifyEmailHTML(link string) string {
	return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FBF7EE;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1A1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #EAE2D2;border-radius:12px;padding:36px;">
        <tr><td style="padding-bottom:20px;">
          <div style="font-size:18px;font-weight:700;color:#A51F2D;letter-spacing:-0.01em;">maple</div>
        </td></tr>
        <tr><td style="padding-bottom:16px;font-size:22px;font-weight:600;line-height:1.3;">
          Verify your email
        </td></tr>
        <tr><td style="padding-bottom:24px;font-size:15px;line-height:1.5;color:#3A3128;">
          Confirm this address is yours so we can send you award alerts, devaluation warnings, and your weekly recap. This link expires in 24 hours.
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="` + link + `" style="display:inline-block;background:#A51F2D;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Verify email</a>
        </td></tr>
        <tr><td style="padding-bottom:8px;font-size:12px;color:#5A5347;">
          Or paste this URL into your browser:
        </td></tr>
        <tr><td style="font-size:12px;color:#5A5347;word-break:break-all;">
          <a href="` + link + `" style="color:#A51F2D;">` + link + `</a>
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid #EAE2D2;margin-top:24px;font-size:11px;color:#5A5347;line-height:1.5;">
          You're receiving this because someone signed up for Maple Rewards with this email. If that wasn't you, ignore this message — nothing happens until the link above is clicked.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// verifyEmailText is the plain-text fallback for non-HTML clients and for
// spam-filter heuristics that penalize HTML-only emails.
func verifyEmailText(link string) string {
	return `Verify your Maple Rewards account

Confirm this address is yours so we can send you award alerts, devaluation
warnings, and your weekly recap. This link expires in 24 hours.

` + link + `

If you didn't sign up for Maple Rewards, ignore this email.`
}

// Verify consumes a token. The frontend lands on /verify-email?token=...&uid=...
// and POSTs both back here. We compare against the latest unconsumed hash for
// that user; on success we mark the user verified and consume the token.
func (s *EmailVerifyService) Verify(ctx context.Context, userID, token string) error {
	if token == "" || userID == "" {
		return fmt.Errorf("token and uid are required")
	}
	hash, expiresAt, err := s.repo.FindUnconsumedByUser(ctx, userID)
	if err != nil {
		return fmt.Errorf("no pending verification for this account")
	}
	if time.Now().After(expiresAt) {
		return fmt.Errorf("verification link has expired — request a fresh one")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(token)); err != nil {
		return fmt.Errorf("invalid verification link")
	}
	if err := s.repo.MarkUserVerified(ctx, userID); err != nil {
		return fmt.Errorf("marking verified: %w", err)
	}
	_ = s.repo.ConsumeToken(ctx, userID)
	return nil
}

func generateEmailToken() (string, error) {
	b := make([]byte, emailTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
