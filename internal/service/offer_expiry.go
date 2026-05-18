package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"maplerewards/internal/repo"
)

// OfferExpiryService emails Pro users a pre-expiry reminder for offers they
// logged via the "track what you clipped" tracker (card_offers). Without this
// the tracker is inert — the founder's exact P4.2 complaint
// ("useless without alerts"). Delivery rules mirror the other digest
// services: send-then-stamp (exactly once via expiry_notified_at), CASL
// unsubscribe footer on every email, recipient mailability + opt-out enforced
// in the repo query, mailer==nil is a no-op (dev/test).
type OfferExpiryService struct {
	offerRepo *repo.CardOfferRepo
	mailer    Mailer
}

func NewOfferExpiryService(offerRepo *repo.CardOfferRepo, mailer Mailer) *OfferExpiryService {
	return &OfferExpiryService{offerRepo: offerRepo, mailer: mailer}
}

// offerExpiryWindowDays — remind when an offer expires within this many days.
const offerExpiryWindowDays = 5

// RunSweep finds offers expiring within the window and emails one reminder
// each, stamping on success so it never double-sends. Returns aggregate
// counts for the worker log.
func (s *OfferExpiryService) RunSweep(ctx context.Context, log *slog.Logger, now time.Time) (sent int, skipped int, failed int) {
	if s.mailer == nil {
		log.Info("offer-expiry: mailer not configured, skipping")
		return 0, 0, 0
	}
	due, err := s.offerRepo.DueForExpiryReminder(ctx, offerExpiryWindowDays, 500)
	if err != nil {
		log.Error("offer-expiry: list due failed", "err", err)
		return 0, 0, 0
	}
	log.Info("offer-expiry sweep starting", "count", len(due))

	for _, o := range due {
		if err := s.sendOne(ctx, o); err != nil {
			log.Warn("offer-expiry: send failed", "offer_id", o.OfferID, "err", err)
			failed++
			continue
		}
		if err := s.offerRepo.MarkExpiryNotified(ctx, o.OfferID); err != nil {
			// Sent but not stamped: log loudly. The partial index still
			// re-selects it next sweep — a duplicate reminder is annoying but
			// not harmful, and far better than silently never reminding.
			log.Warn("offer-expiry: mark-notified failed (may re-send)", "offer_id", o.OfferID, "err", err)
		}
		sent++
	}
	log.Info("offer-expiry sweep done", "sent", sent, "skipped", skipped, "failed", failed)
	return sent, skipped, failed
}

func (s *OfferExpiryService) sendOne(ctx context.Context, o repo.CardOfferReminder) error {
	when := "soon"
	switch {
	case o.DaysToExpiry <= 0:
		when = "today"
	case o.DaysToExpiry == 1:
		when = "tomorrow"
	default:
		when = fmt.Sprintf("in %d days", o.DaysToExpiry)
	}
	earn := ""
	if o.EarnAmount != nil && *o.EarnAmount > 0 {
		earn = fmt.Sprintf(" — $%.0f back", *o.EarnAmount)
		if o.MinSpend != nil && *o.MinSpend > 0 {
			earn += fmt.Sprintf(" on $%.0f", *o.MinSpend)
		}
	}
	subject := fmt.Sprintf("Your %s offer at %s expires %s", o.CardName, o.Merchant, when)
	headline := fmt.Sprintf("%s · %s%s", o.CardName, o.Merchant, earn)
	body := fmt.Sprintf(
		"The offer you clipped (%s) expires %s (%s). %s Use it before it's gone — open MapleRewards to mark it used once you have.",
		o.Merchant, when, o.ExpiresAt.Format("Jan 2, 2006"),
		strings.TrimSpace(o.Description),
	)

	html := fmt.Sprintf(
		`<html><body style="font-family:Arial,sans-serif;color:#1A1410">`+
			`<h2 style="margin:0 0 8px">⏳ %s</h2>`+
			`<p style="font-size:15px;line-height:1.5">%s</p>`+
			`<p style="color:#5A5347;font-size:13px">You're getting this because you logged this offer in MapleRewards' offer tracker.</p>`+
			`%s</body></html>`,
		htmlEscape(headline), htmlEscape(body), EmailFooterHTML(o.UserID))
	text := headline + "\n\n" + body + "\n\n" + EmailFooterText(o.UserID)

	return s.mailer.Send(ctx, MailMessage{
		To:      []string{o.Email},
		Subject: subject,
		HTML:    html,
		Text:    text,
		Tag:     "offer-expiry",
	})
}

// htmlEscape is a minimal escaper for the few user-derived strings
// (merchant/description) we interpolate into the reminder HTML.
func htmlEscape(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;",
	)
	return r.Replace(s)
}
