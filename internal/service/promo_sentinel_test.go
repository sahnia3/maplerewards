package service

import (
	"testing"
	"time"
)

func TestParseExtractedPromos(t *testing.T) {
	cases := []struct {
		name     string
		raw      string
		wantLen  int
		wantFirst string // from_program of first promo, or "" if empty
	}{
		{
			name:      "bare json",
			raw:       `{"promos":[{"from_program":"amex-mr-ca","to_program":"aeroplan","bonus_percent":30,"confidence":0.9}]}`,
			wantLen:   1,
			wantFirst: "amex-mr-ca",
		},
		{
			name:      "markdown fence wrapper",
			raw:       "```json\n" + `{"promos":[{"from_program":"rbc-avion","to_program":"british-airways","bonus_percent":25,"confidence":0.8}]}` + "\n```",
			wantLen:   1,
			wantFirst: "rbc-avion",
		},
		{
			name:      "preamble prose",
			raw:       "Here is the extracted data:\n{\"promos\":[{\"from_program\":\"flying-blue\",\"to_program\":\"klm\",\"bonus_percent\":40}]}\nLet me know if you need more.",
			wantLen:   1,
			wantFirst: "flying-blue",
		},
		{
			name:      "empty promos array",
			raw:       `{"promos":[]}`,
			wantLen:   0,
			wantFirst: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseExtractedPromos(tc.raw)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != tc.wantLen {
				t.Fatalf("len: got %d, want %d (%+v)", len(got), tc.wantLen, got)
			}
			if tc.wantLen > 0 && got[0].FromProgram != tc.wantFirst {
				t.Errorf("first from_program: got %q, want %q", got[0].FromProgram, tc.wantFirst)
			}
		})
	}
}

func TestParseExtractedPromosRejectsGarbage(t *testing.T) {
	if _, err := parseExtractedPromos("no json here at all"); err == nil {
		t.Error("expected error for non-JSON input, got nil")
	}
	if _, err := parseExtractedPromos(`{"promos": [bad json`); err == nil {
		t.Error("expected error for malformed JSON, got nil")
	}
}

func TestValidatePromo(t *testing.T) {
	validExp := time.Now().AddDate(0, 1, 0).Format("2006-01-02")    // ~1mo out, in-window
	expiredExp := time.Now().AddDate(0, 0, -1).Format("2006-01-02") // yesterday
	farExp := time.Now().AddDate(2, 0, 0).Format("2006-01-02")      // 2y out, likely mis-parsed year

	cases := []struct {
		name string
		p    extractedPromo
		want bool
	}{
		{"valid 30% bonus", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.9, ExpiresAt: validExp}, true},
		{"missing from_program", extractedPromo{ToProgram: "aeroplan", BonusPercent: 30, ExpiresAt: validExp}, false},
		{"missing to_program", extractedPromo{FromProgram: "amex-mr-ca", BonusPercent: 30, ExpiresAt: validExp}, false},
		{"5% bonus too small", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 5, ExpiresAt: validExp}, false},
		{"500% bonus too large", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 500, ExpiresAt: validExp}, false},
		{"low-confidence rejected", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.3, ExpiresAt: validExp}, false},
		{"same from and to program", extractedPromo{FromProgram: "aeroplan", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.9, ExpiresAt: validExp}, false},
		{"zero confidence allowed", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0, ExpiresAt: validExp}, true},
		{"missing expiry rejected (eternal-ONGOING guard)", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.9}, false},
		{"already-expired rejected", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.9, ExpiresAt: expiredExp}, false},
		{"absurd far-future expiry rejected", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.9, ExpiresAt: farExp}, false},
		{"unparsable expiry rejected", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.9, ExpiresAt: "ongoing"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := validatePromo(tc.p); got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestCredibleSource(t *testing.T) {
	cases := []struct {
		url  string
		want bool
	}{
		{"https://princeoftravel.com/news/amex-mr-aeroplan", true},
		{"https://www.creditcardgenius.ca/amex-mr-flying-blue", true},
		{"https://milesopedia.com/rbc-avion-ba-avios", true},
		{"https://www.threads.com/@petitevagabond/post/abc", false},
		{"https://threads.net/post/123", false},
		{"https://www.reddit.com/r/churningcanada/comments/x", false},
		{"https://x.com/someuser/status/1", false},
		{"https://m.facebook.com/story", false},
		{"http://princeoftravel.com/insecure", false}, // not https
		{"https://medium.com/@blogger/post", false},
		{"not a url", false},
		{"", false},
	}
	for _, tc := range cases {
		t.Run(tc.url, func(t *testing.T) {
			if got := credibleSource(tc.url); got != tc.want {
				t.Errorf("credibleSource(%q) = %v, want %v", tc.url, got, tc.want)
			}
		})
	}
}
