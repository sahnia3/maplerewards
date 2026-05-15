package service

import (
	"testing"
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
	cases := []struct {
		name string
		p    extractedPromo
		want bool
	}{
		{"valid 30% bonus", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.9}, true},
		{"missing from_program", extractedPromo{ToProgram: "aeroplan", BonusPercent: 30}, false},
		{"missing to_program", extractedPromo{FromProgram: "amex-mr-ca", BonusPercent: 30}, false},
		{"5% bonus too small", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 5}, false},
		{"500% bonus too large", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 500}, false},
		{"low-confidence rejected", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.3}, false},
		{"same from and to program", extractedPromo{FromProgram: "aeroplan", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0.9}, false},
		{"zero confidence allowed", extractedPromo{FromProgram: "amex-mr-ca", ToProgram: "aeroplan", BonusPercent: 30, Confidence: 0}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := validatePromo(tc.p); got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}
