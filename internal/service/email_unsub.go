package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"time"
)

// Email-unsubscribe token. A stateless, expiring HMAC over (userID, exp) lets
// an email recipient opt out from a one-click link without logging in — CASL
// requires the unsubscribe to be functional and low-friction. The signature
// stops a stranger unsubscribing someone else by guessing UUIDs; the expiry
// limits the damage of a leaked link (Referer/history/forwarded email).

const unsubTokenTTL = 90 * 24 * time.Hour

// unsubKey derives a purpose-bound key so the raw JWT signing secret is never
// reused as the unsubscribe-token key (domain separation across trust
// domains). Base secret precedence: EMAIL_UNSUB_SECRET, then JWT_SECRET, then
// a dev-only fallback (production sets JWT_SECRET, validated at boot).
func unsubKey() []byte {
	var base string
	if s := os.Getenv("EMAIL_UNSUB_SECRET"); s != "" {
		base = s
	} else if s := os.Getenv("JWT_SECRET"); s != "" {
		base = s
	} else {
		base = "dev-unsub-secret-change-me"
	}
	mac := hmac.New(sha256.New, []byte(base))
	mac.Write([]byte("maplerewards/email-unsubscribe/v1"))
	return mac.Sum(nil)
}

func signUnsub(userID string, exp int64) string {
	mac := hmac.New(sha256.New, unsubKey())
	fmt.Fprintf(mac, "unsubscribe:%s:%d", userID, exp)
	return hex.EncodeToString(mac.Sum(nil))
}

// SignUnsubToken issues a token valid for unsubTokenTTL. Returns (token, exp).
func SignUnsubToken(userID string) (token string, exp int64) {
	exp = time.Now().Add(unsubTokenTTL).Unix()
	return signUnsub(userID, exp), exp
}

// VerifyUnsubToken constant-time-checks token over (userID, exp) and that exp
// is in the future.
func VerifyUnsubToken(userID, expStr, token string) bool {
	if userID == "" || expStr == "" || token == "" {
		return false
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return false
	}
	want := signUnsub(userID, exp)
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
	tok, exp := SignUnsubToken(userID)
	return fmt.Sprintf("%s/unsubscribe?u=%s&e=%d&t=%s",
		frontendBase(), url.QueryEscape(userID), exp, tok)
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
