package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	webpush "github.com/SherClockHolmes/webpush-go"

	"maplerewards/internal/repo"
)

// Pusher is the abstraction over outbound web-push delivery. Same pattern as
// Mailer: a single project-wide interface keyed by env config so the worker
// and the test endpoint share one implementation.
type Pusher interface {
	Send(ctx context.Context, sub repo.PushSubscription, msg PushPayload) error
	IsAvailable() bool
}

// PushPayload is the data the service worker receives in its push event.
// Kept tiny on purpose — push services impose a 4KB payload cap.
type PushPayload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url,omitempty"` // optional deep link on click
	Tag   string `json:"tag,omitempty"` // dedupe key in the OS notification UI
}

// NewPusherFromEnv picks WebPushSender when VAPID keys are configured, else
// a no-op stub (logs the payload only). Use the same RESEND_API_KEY-style
// gating so the production path is "set the secrets, behavior flips".
func NewPusherFromEnv() Pusher {
	// Trim whitespace and stray surrounding quotes — a secrets-manager value
	// like VAPID_PRIVATE_KEY="..." would otherwise be stored with the quotes and
	// fail every send while IsAvailable() still reported true.
	pub := strings.Trim(strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY")), `"'`)
	priv := strings.Trim(strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY")), `"'`)
	subject := strings.TrimSpace(os.Getenv("VAPID_SUBJECT")) // mailto:hello@maplerewards.app

	if pub == "" || priv == "" {
		return &LogPusher{}
	}
	if subject == "" {
		// Spec requires a "mailto:" or "https://" subject. Use a safe default.
		subject = "mailto:hello@maplerewards.app"
	}
	return &WebPushSender{
		vapidPublic:  pub,
		vapidPrivate: priv,
		vapidSubject: subject,
	}
}

// LogPusher logs the would-be push to stdout instead of delivering. Default
// in dev and any environment where VAPID keys haven't been provisioned.
type LogPusher struct{}

func (LogPusher) IsAvailable() bool { return false }

func (LogPusher) Send(_ context.Context, sub repo.PushSubscription, msg PushPayload) error {
	slog.Info("[push-stub] would send",
		"endpoint", truncate(sub.Endpoint, 60),
		"user_id", sub.UserID,
		"title", msg.Title,
		"body", truncate(msg.Body, 120),
	)
	return nil
}

// WebPushSender signs the payload with VAPID and POSTs to the browser's push
// service URL (FCM / Apple / Mozilla). Returns ErrSubscriptionGone for 404
// or 410 responses — the caller should delete the row.
type WebPushSender struct {
	vapidPublic  string
	vapidPrivate string
	vapidSubject string
}

func (p *WebPushSender) IsAvailable() bool { return true }

// ErrSubscriptionGone signals that the upstream push service has invalidated
// the subscription. Callers must delete the row.
var ErrSubscriptionGone = errors.New("push subscription is gone")

func (p *WebPushSender) Send(ctx context.Context, sub repo.PushSubscription, msg PushPayload) error {
	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal push payload: %w", err)
	}

	resp, err := webpush.SendNotificationWithContext(ctx, body, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.P256dh,
			Auth:   sub.Auth,
		},
	}, &webpush.Options{
		Subscriber:      p.vapidSubject,
		VAPIDPublicKey:  p.vapidPublic,
		VAPIDPrivateKey: p.vapidPrivate,
		TTL:             3600, // 1h — drop the message if undelivered
	})
	if err != nil {
		return fmt.Errorf("send push: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck // close on read-only response body

	if resp.StatusCode == 404 || resp.StatusCode == 410 {
		return ErrSubscriptionGone
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("push service responded %d", resp.StatusCode)
	}
	return nil
}
