package service

import (
	"strings"
	"testing"
)

func TestCSVImport_RBC_SignedAmount(t *testing.T) {
	// RBC: single Amount column, debit = negative.
	csv := `Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$
Visa,1234,2026-04-12,,FRESHCO #123,,-87.45,
Visa,1234,2026-04-13,,PAYMENT - THANK YOU,,250.00,
Visa,1234,2026-04-15,,SHELL CANADA,,-52.10,`
	svc := NewCSVImportService(nil)
	preview, txns, err := svc.Parse(strings.NewReader(csv))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if preview.ParsedRows != 2 {
		t.Fatalf("expected 2 spend rows (credit ignored), got %d", preview.ParsedRows)
	}
	if txns[0].Amount != 87.45 {
		t.Fatalf("expected first amount 87.45, got %v", txns[0].Amount)
	}
	if txns[1].Amount != 52.10 {
		t.Fatalf("expected second amount 52.10, got %v", txns[1].Amount)
	}
}

func TestCSVImport_TD_DebitCreditColumns(t *testing.T) {
	// TD-style: separate Withdrawals + Deposits columns.
	csv := `Date,Description,Withdrawals,Deposits,Balance
2026-04-12,LOBLAWS #5601,124.50,,1500.00
2026-04-13,DIRECT DEPOSIT,,500.00,2000.00
2026-04-14,COSTCO WHOLESALE,238.99,,1761.01`
	svc := NewCSVImportService(nil)
	_, txns, err := svc.Parse(strings.NewReader(csv))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if len(txns) != 2 {
		t.Fatalf("expected 2 spend rows, got %d", len(txns))
	}
	if txns[0].Amount != 124.50 || txns[0].Description != "LOBLAWS #5601" {
		t.Fatalf("unexpected first txn: %+v", txns[0])
	}
}

func TestCSVImport_DateFormats(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"2026-04-12", "2026-04-12"},
		{"2026/04/12", "2026-04-12"},
		{"04/12/2026", "2026-04-12"},
		{"Apr 12, 2026", "2026-04-12"},
		{"12-Apr-2026", "2026-04-12"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			ts, err := parseDate(c.in)
			if err != nil {
				t.Fatalf("parseDate(%q) failed: %v", c.in, err)
			}
			if got := ts.Format("2006-01-02"); got != c.want {
				t.Fatalf("parseDate(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestCSVImport_MoneyFormats(t *testing.T) {
	cases := []struct {
		in       string
		want     float64
		wantCcy  string
	}{
		{"$1,234.56", 1234.56, ""},
		{"1234.56", 1234.56, ""},
		{"(1,234.56)", -1234.56, ""},
		{"$0.99", 0.99, ""},
		{"-25.00", -25.00, ""},
		{"890.00 INR", 890.00, "INR"},
		{"31.26 USD", 31.26, "USD"},
		{"1,020.00 INR", 1020.00, "INR"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			v, ccy, err := parseMoney(c.in)
			if err != nil {
				t.Fatalf("parseMoney(%q) failed: %v", c.in, err)
			}
			if v != c.want {
				t.Fatalf("parseMoney(%q) = %v, want %v", c.in, v, c.want)
			}
			if ccy != c.wantCcy {
				t.Fatalf("parseMoney(%q) currency = %q, want %q", c.in, ccy, c.wantCcy)
			}
		})
	}
}

func TestCSVImport_RejectsCSVWithoutDateColumn(t *testing.T) {
	csv := `Description,Amount
COSTCO,-50`
	svc := NewCSVImportService(nil)
	_, _, err := svc.Parse(strings.NewReader(csv))
	if err == nil {
		t.Fatal("expected error when date column missing")
	}
}

func TestCSVImport_TolersateExtraSummaryRows(t *testing.T) {
	csv := `Date,Description,Amount
2026-04-12,COBALT GROCERY,-50.00
2026-04-13,SHELL,-25.00
TOTAL,,75.00`
	svc := NewCSVImportService(nil)
	preview, _, err := svc.Parse(strings.NewReader(csv))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	// "TOTAL" row has unparseable date — should be warned but not abort.
	if preview.ParsedRows != 2 {
		t.Fatalf("expected 2 spend rows, got %d (warnings: %v)", preview.ParsedRows, preview.Warnings)
	}
	if len(preview.Warnings) == 0 {
		t.Fatalf("expected at least one warning for bad date row")
	}
}
