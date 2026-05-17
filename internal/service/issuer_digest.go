package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// IssuerDigestService builds and delivers the weekly per-Pro-user digest of
// issuer-page changes affecting cards in the user's wallet. The worker tick
// owns scheduling; this service owns the "what + how to send" decision.
//
// Empty digests are not sent — users only hear from us when there's something
// worth their attention. Stamping last_issuer_digest_at on empty cycles
// would suppress real changes the following week, so the stamp only fires
// after a successful send.
type IssuerDigestService struct {
	authRepo   *repo.AuthRepo
	issuerRepo *repo.IssuerPageRepo
	mailer     Mailer
}

func NewIssuerDigestService(authRepo *repo.AuthRepo, issuerRepo *repo.IssuerPageRepo, mailer Mailer) *IssuerDigestService {
	return &IssuerDigestService{
		authRepo:   authRepo,
		issuerRepo: issuerRepo,
		mailer:     mailer,
	}
}

// DigestCadence is the minimum gap between two digests for the same user.
// Worker ticks more frequently than this and the repo query filters by
// last_issuer_digest_at < (now - cadence + small grace).
const DigestCadence = 7 * 24 * time.Hour

// firstSendLookback caps the backfill window for users receiving their first
// digest — we don't want to dump 6 months of changes into someone's inbox
// just because they upgraded to Pro today.
const firstSendLookback = 14 * 24 * time.Hour

// RunSweep enumerates Pro users due for a digest, builds each digest, and
// dispatches the ones with content. Returns aggregate counts for the worker
// log. Best-effort: per-user failures are logged but don't poison the sweep.
func (s *IssuerDigestService) RunSweep(ctx context.Context, log *slog.Logger, now time.Time) (sent int, skipped int, failed int) {
	// 6 days instead of 7 gives a 24h margin so users don't drift later each
	// week due to per-sweep latency.
	cutoff := now.Add(-6 * 24 * time.Hour)
	recipients, err := s.authRepo.ListProDigestRecipientsDueBefore(ctx, cutoff, 500)
	if err != nil {
		log.Error("digest sweep: list recipients failed", "err", err)
		return 0, 0, 0
	}
	log.Info("digest sweep starting", "count", len(recipients))

	for _, rec := range recipients {
		since := s.windowStart(rec.LastSentAt, now)
		changes, err := s.issuerRepo.ListChangesForUserSince(ctx, rec.UserID, since, 25)
		if err != nil {
			log.Warn("digest sweep: list changes failed", "user_id", rec.UserID, "err", err)
			failed++
			continue
		}
		if len(changes) == 0 {
			// Nothing to send — DON'T stamp last_sent_at. Next sweep will
			// re-evaluate. This means an active user with no relevant
			// changes simply doesn't hear from us, which is the right
			// behavior for a "things you care about" digest.
			skipped++
			continue
		}

		if err := s.sendOne(ctx, rec.UserID, rec.Email, changes, since, now); err != nil {
			log.Warn("digest sweep: send failed", "user_id", rec.UserID, "err", err)
			failed++
			continue
		}
		if err := s.authRepo.MarkIssuerDigestSent(ctx, rec.UserID); err != nil {
			log.Warn("digest sweep: mark sent failed", "user_id", rec.UserID, "err", err)
			// We've already delivered; don't double-count as failed. A
			// retry next sweep would re-send the same content but that's
			// rare and self-correcting.
		}
		sent++
	}
	log.Info("digest sweep done", "sent", sent, "skipped_empty", skipped, "failed", failed)
	return sent, skipped, failed
}

// windowStart picks the lookback window for one user. New Pro users get a
// 14-day backfill on their first digest; subsequent digests cover only what's
// new since the last send.
func (s *IssuerDigestService) windowStart(lastSent *time.Time, now time.Time) time.Time {
	if lastSent == nil {
		return now.Add(-firstSendLookback)
	}
	return *lastSent
}

func (s *IssuerDigestService) sendOne(ctx context.Context, userID, email string, changes []model.IssuerPageChange, since, now time.Time) error {
	subject := digestSubject(len(changes))
	html := strings.Replace(digestHTML(changes, since, now), "</body>", EmailFooterHTML(userID)+"</body>", 1)
	text := digestText(changes, since, now) + EmailFooterText(userID)
	return s.mailer.Send(ctx, MailMessage{
		To:      []string{email},
		Subject: subject,
		HTML:    html,
		Text:    text,
		Tag:     "issuer-digest",
	})
}

func digestSubject(n int) string {
	if n == 1 {
		return "Your weekly card-change digest — 1 update"
	}
	return fmt.Sprintf("Your weekly card-change digest — %d updates", n)
}

func digestHTML(changes []model.IssuerPageChange, since, now time.Time) string {
	var rows strings.Builder
	for _, ch := range changes {
		confidence := ""
		if ch.AIConfidence != nil {
			confidence = fmt.Sprintf("AI confidence %d%%", int(*ch.AIConfidence*100))
		}
		rows.WriteString(`<tr><td style="padding:14px 0;border-top:1px solid #EAE2D2;">`)
		rows.WriteString(`<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#5A5347;margin-bottom:4px;">`)
		rows.WriteString(escapeHTMLDigest(ch.PageLabel))
		if confidence != "" {
			rows.WriteString(` &middot; ` + confidence)
		}
		rows.WriteString(`</div>`)
		rows.WriteString(`<div style="font-size:15px;color:#1A1410;margin-bottom:4px;line-height:1.4;">`)
		rows.WriteString(escapeHTMLDigest(ch.DiffSummary))
		rows.WriteString(`</div>`)
		if ch.PageURL != "" {
			rows.WriteString(`<a href="` + ch.PageURL + `" style="font-size:12px;color:#A51F2D;text-decoration:none;">Read source &rarr;</a>`)
		}
		rows.WriteString(`</td></tr>`)
	}

	return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FBF7EE;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1A1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #EAE2D2;border-radius:12px;padding:36px;">
        <tr><td style="padding-bottom:8px;">
          <div style="font-size:18px;font-weight:700;color:#A51F2D;letter-spacing:-0.01em;">maple</div>
        </td></tr>
        <tr><td style="padding-bottom:8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#5A5347;">
          Weekly digest &middot; ` + since.Format("Jan 2") + ` – ` + now.Format("Jan 2") + `
        </td></tr>
        <tr><td style="padding-bottom:20px;font-size:22px;font-weight:600;line-height:1.3;">
          Changes that touch your wallet
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">` + rows.String() + `</table>
        </td></tr>
        <tr><td style="padding-top:32px;font-size:11px;color:#5A5347;line-height:1.5;">
          You're receiving this because you're a Maple Pro subscriber and at least one card in your wallet had an issuer-page change this week. Empty weeks aren't sent.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

func digestText(changes []model.IssuerPageChange, since, now time.Time) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Weekly digest — %s to %s\n\n", since.Format("Jan 2"), now.Format("Jan 2"))
	for _, ch := range changes {
		fmt.Fprintf(&b, "• %s\n  %s\n", ch.PageLabel, ch.DiffSummary)
		if ch.PageURL != "" {
			fmt.Fprintf(&b, "  %s\n", ch.PageURL)
		}
		b.WriteString("\n")
	}
	b.WriteString("Empty weeks aren't sent. You're receiving this as a Maple Pro subscriber.\n")
	return b.String()
}

// escapeHTMLDigest is the local HTML escaper for this file. (We use a
// dedicated copy here rather than reach into cmd/worker/notify.go's
// escapeHTML so service code stays decoupled from command-binary internals.)
func escapeHTMLDigest(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}
