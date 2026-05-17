package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
)

// Email-unsubscribe token. A stateless HMAC over the user ID lets an email
// recipient opt out from a one-click link without logging in — CASL requires
// the unsubscribe to be functional and low-friction. The signature stops a
// stranger unsubscribing someone else by guessing IDs.
//
// Secret precedence: EMAIL_UNSUB_SECRET, then JWT_SECRET, then a dev fallback
// (fine locally; production sets JWT_SECRET, validated at boot).
func unsubSecret() []byte {
	if s := os.Getenv("EMAIL_UNSUB_SECRET"); s != "" {
		return []byte(s)
	}
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte("dev-unsub-secret-change-me")
}

// SignUnsubToken returns the hex HMAC-SHA256 of the user ID.
func SignUnsubToken(userID string) string {
	mac := hmac.New(sha256.New, unsubSecret())
	mac.Write([]byte("unsubscribe:" + userID))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyUnsubToken is a constant-time check of a token against a user ID.
func VerifyUnsubToken(userID, token string) bool {
	if userID == "" || token == "" {
		return false
	}
	want := SignUnsubToken(userID)
	return hmac.Equal([]byte(want), []byte(token))
}

// frontendBase is the public site origin used to build email links
// (FRONTEND_URL, dev fallback localhost:3000). Shared by every link builder.
func frontendBase() string {
	if b := os.Getenv("FRONTEND_URL"); b != "" {
		return b
	}
	return "http://localhost:3000"
}

// UnsubscribeURL builds the footer link. Points at the frontend /unsubscribe
// page (same pattern as verify-email), which calls the backend to apply it.
func UnsubscribeURL(userID string) string {
	return fmt.Sprintf("%s/unsubscribe?u=%s&t=%s",
		frontendBase(), url.QueryEscape(userID), SignUnsubToken(userID))
}

// EmailFooterHTML / EmailFooterText render the CASL unsubscribe footer that
// every commercial email (digests, win-back) must carry. The privacy policy
// promises opt-out "from any digest footer" — this is that link.
func EmailFooterHTML(userID string) string {
	return fmt.Sprintf(
		`<p style="font-size:11px;color:#999;line-height:1.5;margin-top:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">You receive this as a MapleRewards Pro subscriber. <a href="%s" style="color:#999;">Unsubscribe from all MapleRewards emails</a>.</p>`,
		UnsubscribeURL(userID))
}

func EmailFooterText(userID string) string {
	return fmt.Sprintf("\n\n—\nYou receive this as a MapleRewards Pro subscriber.\nUnsubscribe from all emails: %s\n", UnsubscribeURL(userID))
}
