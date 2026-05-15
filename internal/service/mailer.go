package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

// Mailer is the single project-wide abstraction for outbound transactional
// email. All email-sending code funnels through here so swapping providers
// (Resend → Postmark → SES) is a one-line change inside NewMailerFromEnv.
//
// Implementations must be safe for concurrent use.
type Mailer interface {
	Send(ctx context.Context, msg MailMessage) error
}

// MailMessage is a provider-agnostic email payload. Either HTML or Text must
// be non-empty; setting both is preferred so non-HTML clients still render.
// Tag is an optional analytics label (e.g. "verify", "award-alert") — Resend
// surfaces it on its dashboard for delivery stats.
type MailMessage struct {
	To      []string
	Subject string
	HTML    string
	Text    string
	Tag     string
}

// NewMailerFromEnv picks a Mailer based on env config:
//   - RESEND_API_KEY set → ResendMailer (production path)
//   - otherwise         → LogMailer (dev stub, prints to stdout)
//
// MAIL_FROM overrides the "From" header; defaults to the canonical
// hello@maplerewards.ca sender.
func NewMailerFromEnv() Mailer {
	if key := os.Getenv("RESEND_API_KEY"); key != "" {
		from := os.Getenv("MAIL_FROM")
		if from == "" {
			from = "Maple Rewards <hello@maplerewards.ca>"
		}
		return &ResendMailer{
			apiKey:   key,
			from:     from,
			client:   &http.Client{Timeout: 10 * time.Second},
			endpoint: resendEndpoint,
		}
	}
	return LogMailer{}
}

// LogMailer is the development implementation: dump a short preview of the
// message to stdout. Never used in production (NewMailerFromEnv picks Resend
// whenever RESEND_API_KEY is set).
type LogMailer struct{}

func (LogMailer) Send(_ context.Context, msg MailMessage) error {
	body := msg.Text
	if body == "" {
		body = msg.HTML
	}
	slog.Info("[mail-stub] would send",
		"to", strings.Join(msg.To, ","),
		"subject", msg.Subject,
		"tag", msg.Tag,
		"preview", truncate(body, 200),
	)
	return nil
}

const resendEndpoint = "https://api.resend.com/emails"

// ResendMailer delivers via Resend's REST API. Free tier covers solo-stage
// notification volume (3,000/month, 100/day).
//
// https://resend.com/docs/api-reference/emails/send-email
type ResendMailer struct {
	apiKey   string
	from     string
	client   *http.Client
	endpoint string // overridable for testing
}

func (r *ResendMailer) Send(ctx context.Context, msg MailMessage) error {
	if len(msg.To) == 0 {
		return fmt.Errorf("mailer: no recipients")
	}
	if msg.HTML == "" && msg.Text == "" {
		return fmt.Errorf("mailer: HTML and Text both empty")
	}

	body := map[string]any{
		"from":    r.from,
		"to":      msg.To,
		"subject": msg.Subject,
	}
	if msg.HTML != "" {
		body["html"] = msg.HTML
	}
	if msg.Text != "" {
		body["text"] = msg.Text
	}
	if msg.Tag != "" {
		body["tags"] = []map[string]string{{"name": "category", "value": msg.Tag}}
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("mailer: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("mailer: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("mailer: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		// Capped read avoids unbounded memory if Resend returns a huge body.
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<10))
		return fmt.Errorf("mailer: resend %d: %s", resp.StatusCode, strings.TrimSpace(string(errBody)))
	}
	return nil
}
