package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

// alertEmailCooldown is the minimum gap between two alert emails for the same
// watch. The award sweep ticks every 4 hours and an "under-max-points" match
// will keep firing on every probe until the price moves above the threshold
// again, so without this guard a user would receive 6 identical emails per
// day. 24h is long enough to feel restrained, short enough that a price drop
// the next day still notifies.
const alertEmailCooldown = 24 * time.Hour

// shouldEmailForAlert returns true when we should deliver an email for the
// alert that just fired. The decision is based on the watch's prior
// last_alert_at value — i.e. the timestamp BEFORE this sweep stamped a new
// one. A nil prevAlertAt means we've never alerted on this watch.
//
// Parse failures are treated as "old enough to email" so a corrupt timestamp
// never silently swallows a real alert.
func shouldEmailForAlert(prevAlertAt *string, now time.Time) bool {
	if prevAlertAt == nil {
		return true
	}
	t, err := time.Parse(time.RFC3339, *prevAlertAt)
	if err != nil {
		return true
	}
	return now.Sub(t) >= alertEmailCooldown
}

// sendAwardAlertEmail delivers an award-watch alert to the owner of the
// watch. It is a best-effort operation: failures are logged but never
// propagate, because the sweep must keep processing other watches and the
// alert is already persisted via RecordAlert (the UI surfaces it regardless).
func sendAwardAlertEmail(
	ctx context.Context,
	log *slog.Logger,
	watchRepo *repo.AwardWatchRepo,
	mailer service.Mailer,
	w model.AwardWatch,
	alertMessage string,
) {
	if mailer == nil {
		return
	}
	rec, err := watchRepo.GetAlertRecipient(ctx, w.ID)
	if err != nil {
		log.Warn("alert recipient lookup failed", "watch_id", w.ID, "err", err)
		return
	}
	if !rec.Found {
		log.Info("alert skipped: no live recipient", "watch_id", w.ID)
		return
	}

	subject := fmt.Sprintf("Award alert — %s → %s %s", w.Origin, w.Destination, w.Cabin)
	link := awardWatchDeepLink(w)
	html := awardAlertHTML(w, alertMessage, link)
	text := awardAlertText(w, alertMessage, link)

	if err := mailer.Send(ctx, service.MailMessage{
		To:      []string{rec.Email},
		Subject: subject,
		HTML:    html,
		Text:    text,
		Tag:     "award-alert",
	}); err != nil {
		log.Warn("alert email send failed", "watch_id", w.ID, "err", err)
		return
	}
	log.Info("alert email sent", "watch_id", w.ID, "to", rec.Email)
}

// awardWatchDeepLink builds a URL the user can click to land on /pro-tools
// with the watch surfaced. Falls back to the bare frontend root if no
// FRONTEND_URL is configured.
func awardWatchDeepLink(w model.AwardWatch) string {
	base := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
	if base == "" {
		base = "https://maplerewards.app"
	}
	q := url.Values{}
	q.Set("watch", w.ID)
	return base + "/pro-tools?" + q.Encode()
}

func awardAlertHTML(w model.AwardWatch, alertMessage, link string) string {
	return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FBF7EE;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1A1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #EAE2D2;border-radius:12px;padding:36px;">
        <tr><td style="padding-bottom:8px;">
          <div style="font-size:18px;font-weight:700;color:#A51F2D;letter-spacing:-0.01em;">maple</div>
        </td></tr>
        <tr><td style="padding-bottom:8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#5A5347;">
          Award alert
        </td></tr>
        <tr><td style="padding-bottom:20px;font-size:22px;font-weight:600;line-height:1.3;">
          ` + escapeHTML(w.Origin) + ` &rarr; ` + escapeHTML(w.Destination) + ` &middot; ` + escapeHTML(strings.Title(w.Cabin)) + `
        </td></tr>
        <tr><td style="padding-bottom:24px;font-size:15px;line-height:1.5;color:#3A3128;">
          ` + escapeHTML(alertMessage) + `
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="` + escapeHTML(link) + `" style="display:inline-block;background:#A51F2D;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Open this watch</a>
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #EAE2D2;font-size:11px;color:#5A5347;line-height:1.5;">
          You're receiving this because you set up an award watch on Maple Rewards. Award seats often vanish in minutes — book quickly if the price looks right.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

func awardAlertText(w model.AwardWatch, alertMessage, link string) string {
	return fmt.Sprintf(`Award alert — %s → %s (%s)

%s

Open this watch: %s

You're receiving this because you set up an award watch on Maple Rewards.`,
		w.Origin, w.Destination, w.Cabin, alertMessage, link,
	)
}

// sendAwardAlertPush fans out the alert as a web-push notification to every
// browser the watch's owner has registered. Same 24h cooldown semantics as
// email: the caller (probeOne) decides whether to invoke us at all.
// Dead subscriptions (404/410 from the push service) are pruned in place.
func sendAwardAlertPush(
	ctx context.Context,
	log *slog.Logger,
	pushRepo *repo.PushRepo,
	pusher service.Pusher,
	w model.AwardWatch,
	alertMessage string,
) {
	if pusher == nil || pushRepo == nil {
		return
	}
	subs, err := pushRepo.ListForAwardWatch(ctx, w.ID)
	if err != nil {
		log.Warn("push subs lookup failed", "watch_id", w.ID, "err", err)
		return
	}
	if len(subs) == 0 {
		return // user hasn't subscribed any browser; email is the channel
	}

	title := fmt.Sprintf("%s → %s: %s", w.Origin, w.Destination, strings.Title(w.Cabin))
	link := awardWatchDeepLink(w)
	payload := service.PushPayload{
		Title: title,
		Body:  alertMessage,
		URL:   link,
		Tag:   "award-alert-" + w.ID, // dedupe in OS UI if multiple devices fire
	}

	sent, pruned := 0, 0
	for _, sub := range subs {
		err := pusher.Send(ctx, sub, payload)
		if errors.Is(err, service.ErrSubscriptionGone) {
			_ = pushRepo.DeleteByEndpoint(ctx, sub.UserID, sub.Endpoint)
			pruned++
			continue
		}
		if err != nil {
			log.Warn("push send failed", "watch_id", w.ID, "endpoint", truncatePushEndpoint(sub.Endpoint), "err", err)
			continue
		}
		_ = pushRepo.MarkUsed(ctx, sub.Endpoint)
		sent++
	}
	log.Info("alert push fanout", "watch_id", w.ID, "sent", sent, "pruned", pruned, "total", len(subs))
}

// truncatePushEndpoint keeps the log lines readable — endpoint URLs are
// often 200+ chars and include opaque IDs.
func truncatePushEndpoint(s string) string {
	if len(s) <= 60 {
		return s
	}
	return s[:60] + "…"
}

// escapeHTML is the minimum HTML escaper needed for our templated values
// (origin, destination, cabin, alert message). Pulling in html/template here
// would force us to rewrite the rest of the template too; this stays narrow.
func escapeHTML(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}
