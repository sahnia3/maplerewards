package service

import "testing"

func TestCategorizeMerchant(t *testing.T) {
	cases := []struct{ in, want string }{
		// Real Cobalt-statement-style descriptions
		{"METRO #129 TORONTO ON", "groceries"},
		{"LOBLAWS #1234 TORONTO", "groceries"},
		{"WHOLE FOODS MARKET TORONTO", "groceries"},
		{"COSTCO WHOLESALE #563", "groceries"},
		{"COSTCO GAS NORTH YORK", "gas-transit"}, // override beats groceries
		{"SHELL C03872 TORONTO ON", "gas-transit"},
		{"PETRO-CANADA TORONTO", "gas-transit"},
		{"UBER TRIP HELP.UBER.COM", "gas-transit"},
		{"UBER EATS TORONTO ON", "dining"},
		{"TIM HORTONS #1042", "dining"},
		{"STARBUCKS COFFEE", "dining"},
		{"DOORDASH*MCDONALDS", "dining"},
		{"NETFLIX.COM", "streaming-digital"},
		{"SPOTIFY P1234567", "streaming-digital"},
		{"APPLE.COM/BILL", "streaming-digital"},
		{"SHOPPERS DRUG MART #1234", "pharmacy"}, // MCC 5912 — cards code it as drug store, not grocery
		{"PHARMAPRIX MONTREAL", "pharmacy"},
		{"REXALL PHARMACY 1112", "pharmacy"},
		{"CINEPLEX ENTERTAINMENT", "entertainment"},
		{"AIR CANADA*1234567", "travel"},
		{"BOOKING.COM HOTEL RESERVE", "travel"},

		// Recurring bills
		{"MEMBERSHIP FEE INSTALLMENT", "recurring-bills"},
		{"BELL CANADA PAYMENT", "recurring-bills"},
		{"ENBRIDGE GAS DISTRIBUTION", "recurring-bills"},

		// Online shopping
		{"AMAZON.CA*MK7H1234", "online-shopping"},
		{"AMZN MKTP CA*XYZ", "online-shopping"},
		{"BEST BUY #4513", "online-shopping"},

		// Fallback
		{"WALMART CANADA WAREHOUSE", "groceries"},
		{"PINELABS*GOBLR HOSPITAL MUMBAI", "everything-else"},
		{"some unknown small business", "everything-else"},
		{"", "everything-else"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			got := CategorizeMerchant(c.in)
			if got != c.want {
				t.Fatalf("CategorizeMerchant(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
