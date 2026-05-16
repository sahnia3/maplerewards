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

// MissedRewardsDigestService runs the weekly per-Pro-user email summarising
// "you swiped the wrong card this many times last week, here's what it cost
// you, here's the swap that would have been optimal."
//
// Delivery rules mirror IssuerDigestService:
//   - 7-day cadence with 6-day cutoff (24h safety margin).
//   - Empty digests are NOT sent — users only hear from us when there's value.
//   - Stamp only fires after a successful send.
//
// The service depends on MissedRewardsService for the underlying compute and
// the shared Mailer for delivery.
type MissedRewardsDigestService struct {
	authRepo *repo.AuthRepo
	compute  *MissedRewardsService
	mailer   Mailer
}

func NewMissedRewardsDigestService(authRepo *repo.AuthRepo, compute *MissedRewardsService, mailer Mailer) *MissedRewardsDigestService {
	return &MissedRewardsDigestService{
		authRepo: authRepo,
		compute:  compute,
		mailer:   mailer,
	}
}

const missedRewardsDigestCadence = 7 * 24 * time.Hour

// RunSweep enumerates Pro users due for a missed-rewards digest, computes
// each one, and dispatches the ones with non-zero leakage. Returns aggregate
// counts for the worker log.
func (s *MissedRewardsDigestService) RunSweep(ctx context.Context, log *slog.Logger, now time.Time) (sent int, skipped int, failed int) {
	cutoff := now.Add(-6 * 24 * time.Hour)
	recipients, err := s.authRepo.ListProMissedRewardsRecipientsDueBefore(ctx, cutoff, 500)
	if err != nil {
		log.Error("missed-rewards digest: list recipients failed", "err", err)
		return 0, 0, 0
	}
	log.Info("missed-rewards digest starting", "count", len(recipients))

	for _, rec := range recipients {
		// 7 days back, top 5 in the email. Heavier per-user limits live on
		// the in-app /pro-tools page.
		report, err := s.compute.ComputeMissedRewards(ctx, rec.SessionID, 7, 5)
		if err != nil {
			log.Warn("missed-rewards digest: compute failed", "user_id", rec.UserID, "err", err)
			failed++
			continue
		}
		// No leakage worth surfacing — skip the email. Don't stamp; the next
		// sweep will re-evaluate when the lookback window slides.
		if report == nil || report.MissedCount == 0 {
			skipped++
			continue
		}
		// Floor at 50 cents so we don't email someone over a rounding error.
		leakage := report.TotalOptimal - report.TotalActual
		if leakage < 0.50 {
			skipped++
			continue
		}

		if err := s.sendOne(ctx, rec.Email, report, leakage); err != nil {
			log.Warn("missed-rewards digest: send failed", "user_id", rec.UserID, "err", err)
			failed++
			continue
		}
		if err := s.authRepo.MarkMissedRewardsDigestSent(ctx, rec.UserID); err != nil {
			log.Warn("missed-rewards digest: mark sent failed", "user_id", rec.UserID, "err", err)
		}
		sent++
	}
	log.Info("missed-rewards digest done", "sent", sent, "skipped", skipped, "failed", failed)
	return sent, skipped, failed
}

func (s *MissedRewardsDigestService) sendOne(ctx context.Context, email string, report *model.MissedRewardsReport, leakage float64) error {
	subject := fmt.Sprintf("You left $%.0f on the table last week", leakage)
	html := missedDigestHTML(report, leakage)
	text := missedDigestText(report, leakage)
	return s.mailer.Send(ctx, MailMessage{
		To:      []string{email},
		Subject: subject,
		HTML:    html,
		Text:    text,
		Tag:     "missed-rewards-digest",
	})
}

func missedDigestHTML(report *model.MissedRewardsReport, leakage float64) string {
	var rows strings.Builder
	for _, e := range report.TopMissed {
		if e.Gap <= 0.01 {
			continue
		}
		actual := e.ActualCardName
		if actual == "" {
			actual = "your card"
		}
		optimal := e.OptimalCardName
		if optimal == "" {
			optimal = "another card"
		}
		rows.WriteString(`<tr><td style="padding:14px 0;border-top:1px solid #EAE2D2;">`)
		rows.WriteString(`<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#5A5347;margin-bottom:4px;">`)
		rows.WriteString(escapeHTMLDigest(e.CategoryName))
		fmt.Fprintf(&rows, ` &middot; %s &middot; $%.2f`, e.SpentAt, e.Amount)
		rows.WriteString(`</div>`)
		rows.WriteString(`<div style="font-size:15px;color:#1A1410;line-height:1.4;">You used <strong>`)
		rows.WriteString(escapeHTMLDigest(actual))
		rows.WriteString(`</strong>. Optimal was <strong>`)
		rows.WriteString(escapeHTMLDigest(optimal))
		fmt.Fprintf(&rows, `</strong> — a $%.2f swing.</div>`, e.Gap)
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
          Missed-rewards digest &middot; last 7 days
        </td></tr>
        <tr><td style="padding-bottom:8px;font-size:22px;font-weight:600;line-height:1.3;">
          $` + fmt.Sprintf("%.2f", leakage) + ` left behind
        </td></tr>
        <tr><td style="padding-bottom:20px;font-size:13px;color:#5A5347;line-height:1.5;">
          Across ` + fmt.Sprintf("%d transactions", report.MissedCount) + ` where a different card in your wallet would have earned more. Top offenders below — open the app for the full list and the swap recommendations.
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">` + rows.String() + `</table>
        </td></tr>
        <tr><td style="padding-top:24px;">
          <a href="https://maplerewards.app/pro-tools" style="display:inline-block;padding:10px 18px;background:#A51F2D;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open the full report</a>
        </td></tr>
        <tr><td style="padding-top:32px;font-size:11px;color:#5A5347;line-height:1.5;">
          Pro subscribers only. Computed against your current wallet snapshot — historical card composition isn't tracked, so the numbers assume you held today's cards at swipe time. Empty weeks aren't sent.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

func missedDigestText(report *model.MissedRewardsReport, leakage float64) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Missed-rewards digest — last 7 days\n\n")
	fmt.Fprintf(&b, "$%.2f left behind across %d transactions.\n\n", leakage, report.MissedCount)
	for _, e := range report.TopMissed {
		if e.Gap <= 0.01 {
			continue
		}
		actual := e.ActualCardName
		if actual == "" {
			actual = "your card"
		}
		optimal := e.OptimalCardName
		if optimal == "" {
			optimal = "another card"
		}
		fmt.Fprintf(&b, "• %s (%s, $%.2f): used %s; optimal was %s — $%.2f swing.\n",
			e.CategoryName, e.SpentAt, e.Amount,
			actual, optimal, e.Gap,
		)
	}
	b.WriteString("\nOpen the full report: https://maplerewards.app/pro-tools\n")
	b.WriteString("Empty weeks aren't sent. You're receiving this as a Maple Pro subscriber.\n")
	return b.String()
}
