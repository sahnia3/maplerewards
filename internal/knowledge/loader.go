package knowledge

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// KnowledgeBase holds the full parsed rewards knowledge.
type KnowledgeBase struct {
	Programs         map[string]*Program `yaml:",inline"`
	Flights          []FlightRoute       `yaml:"flights"`
	DevaluationLog   []DevaluationEntry  `yaml:"devaluation_log"`
	TransferBonusLog []TransferBonusEntry `yaml:"transfer_bonus_log"`
	StrategyPrompt   string              // pre-formatted supplementary strategy content for the AI prompt
}

// Program represents a loyalty program's data.
type Program struct {
	Name          string                    `yaml:"name"`
	Description   string                    `yaml:"description"`
	CPPRange      CPPRange                  `yaml:"cpp_range"`
	AwardChart    map[string]map[string]int `yaml:"award_chart"`
	SweetSpots    []string                  `yaml:"sweet_spots"`
	BookingURL    string                    `yaml:"booking_url"`
	TransfersTo   []TransferPartner         `yaml:"transfers_to"`
	CategoryChart map[string]int            `yaml:"category_chart"`
	AwardTiers    map[string]int            `yaml:"award_tiers"`
	Properties    map[string][]Property     `yaml:"properties"`
	Perks         []string                  `yaml:"perks"`
	Note          string                    `yaml:"note"`
}

// CPPRange represents the cents-per-point valuation range for a program.
type CPPRange struct {
	Low       float64 `yaml:"low"`
	High      float64 `yaml:"high"`
	SweetSpot string  `yaml:"sweet_spot"`
	Note      string  `yaml:"note"`
}

// TransferPartner represents a transfer partner relationship.
type TransferPartner struct {
	Program string `yaml:"program"`
	Ratio   string `yaml:"ratio"`
	Note    string `yaml:"note"`
}

// Property represents a specific hotel property in the knowledge base.
type Property struct {
	Name        string  `yaml:"name"`
	Category    int     `yaml:"category"`
	PtsPerNight int     `yaml:"pts_per_night"`
	CashCAD     float64 `yaml:"cash_cad_per_night"`
	Brand       string  `yaml:"brand"`
}

// FlightRoute represents a flight route with award pricing.
type FlightRoute struct {
	From        string `yaml:"from"`
	To          string `yaml:"to"`
	Airline     string `yaml:"airline"`
	Program     string `yaml:"program"`
	EconomyPts  int    `yaml:"economy_pts"`
	BusinessPts int    `yaml:"business_pts"`
	FirstPts    int    `yaml:"first_pts"`
	Duration    string `yaml:"duration"`
	Amenities   string `yaml:"amenities"`
	Notes       string `yaml:"notes"`
}

// DevaluationEntry is one row of the devaluation_log — a dated event where a
// program changed its award chart, status framework, or earning rules.
type DevaluationEntry struct {
	Date      string `yaml:"date" json:"date"`
	Program   string `yaml:"program" json:"program"`
	Summary   string `yaml:"summary" json:"summary"`
	SourceURL string `yaml:"source_url,omitempty" json:"source_url,omitempty"`
}

// TransferBonusEntry is one row of the transfer_bonus_log — a time-bounded
// promotion where a flexible-points program offered a bonus on transfers
// out to a partner (e.g. Amex MR → Aeroplan 25%).
type TransferBonusEntry struct {
	DateRange   string `yaml:"date_range" json:"date_range"`
	Source      string `yaml:"source" json:"source"`
	Destination string `yaml:"destination" json:"destination"`
	BonusPct    int    `yaml:"bonus_pct" json:"bonus_pct"`
	Note        string `yaml:"note,omitempty" json:"note,omitempty"`
}

// Load reads and parses the rewards YAML knowledge base from the given path.
func Load(path string) (*KnowledgeBase, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read knowledge base: %w", err)
	}

	return loadSimple(data)
}

// LoadSupplementary reads a supplementary YAML file (e.g. credit card strategies)
// and converts it into a formatted prompt string, then attaches it to the KnowledgeBase.
func (kb *KnowledgeBase) LoadSupplementary(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read supplementary KB: %w", err)
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("parse supplementary KB: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("\n## Canadian Credit Card Strategies\n\n")

	// card_earning_rates
	if rates, ok := raw["card_earning_rates"]; ok {
		sb.WriteString("### Top Canadian Credit Card Earning Rates\n")
		if rateMap, ok := rates.(map[string]interface{}); ok {
			for _, card := range rateMap {
				cardMap, ok := card.(map[string]interface{})
				if !ok {
					continue
				}
				name, _ := cardMap["name"].(string)
				fee, _ := cardMap["annual_fee_cad"].(float64)
				bestFor, _ := cardMap["best_for"].(string)
				fmt.Fprintf(&sb, "- **%s** ($%.0f/yr): %s\n", name, fee, bestFor)
				if rates, ok := cardMap["earning_rates"].(map[string]interface{}); ok {
					for cat, rate := range rates {
						if rateMap, ok := rate.(map[string]interface{}); ok {
							mult, _ := rateMap["multiplier"].(int)
							if mult == 0 {
								if f, ok := rateMap["multiplier"].(float64); ok {
									mult = int(f)
								}
							}
							unit, _ := rateMap["unit"].(string)
							fmt.Fprintf(&sb, "  - %s: %dx (%s)\n", cat, mult, unit)
						}
					}
				}
				if notes, ok := cardMap["notes"].([]interface{}); ok {
					for _, n := range notes {
						fmt.Fprintf(&sb, "  - %v\n", n)
					}
				}
			}
		}
		sb.WriteString("\n")
	}

	// recommended_combos
	if combos, ok := raw["recommended_combos"]; ok {
		sb.WriteString("### Recommended Credit Card Combos (2025-2026)\n")
		if comboList, ok := combos.([]interface{}); ok {
			for _, combo := range comboList {
				comboMap, ok := combo.(map[string]interface{})
				if !ok {
					continue
				}
				name, _ := comboMap["name"].(string)
				rating, _ := comboMap["rating"].(string)
				fmt.Fprintf(&sb, "**%s** (%s):\n", name, rating)
				if strategy, ok := comboMap["strategy"].(map[string]interface{}); ok {
					if main, ok := strategy["main_driver"].(string); ok {
						fmt.Fprintf(&sb, "  - Main driver: %s\n", main)
					}
					if bene, ok := strategy["benefits_card"].(string); ok {
						fmt.Fprintf(&sb, "  - Benefits: %s\n", bene)
					}
					if back, ok := strategy["backup_card"].(string); ok {
						fmt.Fprintf(&sb, "  - Backup: %s\n", back)
					}
					if reason, ok := strategy["reasoning"].(string); ok {
						fmt.Fprintf(&sb, "  - Why: %s\n", reason)
					}
				}
				sb.WriteString("\n")
			}
		}
	}

	// strategy_principles
	if principles, ok := raw["strategy_principles"]; ok {
		sb.WriteString("### Credit Card Strategy Principles\n")
		if princMap, ok := principles.(map[string]interface{}); ok {
			for key, val := range princMap {
				fmt.Fprintf(&sb, "**%s:**\n", key)
				if ruleMap, ok := val.(map[string]interface{}); ok {
					if desc, ok := ruleMap["rule"].(string); ok {
						fmt.Fprintf(&sb, "  %s\n", desc)
					}
					if details, ok := ruleMap["details"].([]interface{}); ok {
						for _, d := range details {
							fmt.Fprintf(&sb, "  - %v\n", d)
						}
					}
				}
				sb.WriteString("\n")
			}
		}
	}

	// transfer_strategies — surface key transfer routing tips so the model
	// always sees the canonical "transfer MR to Aeroplan, never to portal" rule.
	if ts, ok := raw["transfer_strategies"]; ok {
		sb.WriteString("### Transfer Strategies\n")
		if tsMap, ok := ts.(map[string]interface{}); ok {
			for _, val := range tsMap {
				entry, ok := val.(map[string]interface{})
				if !ok {
					continue
				}
				src, _ := entry["source"].(string)
				if src != "" {
					fmt.Fprintf(&sb, "**%s:**\n", src)
				}
				if rule, ok := entry["critical_rule"].(string); ok {
					fmt.Fprintf(&sb, "  - Rule: %s\n", rule)
				}
				if partners, ok := entry["partners"].([]interface{}); ok {
					for _, p := range partners {
						pm, ok := p.(map[string]interface{})
						if !ok {
							continue
						}
						prog, _ := pm["program"].(string)
						ratio, _ := pm["ratio"].(string)
						best, _ := pm["best_use"].(string)
						fmt.Fprintf(&sb, "  - %s (%s): %s\n", prog, ratio, best)
					}
				}
				sb.WriteString("\n")
			}
		}
	}

	// walkthroughs — step-by-step booking guides. Highest CPP sweet spots
	// Canadians can hit from YYZ/YVR/YUL. Surfaced inline so the model can
	// quote the exact steps verbatim instead of hallucinating booking flow.
	if wts, ok := raw["walkthroughs"]; ok {
		sb.WriteString("### Booking Walkthroughs (high-CPP Canadian sweet spots)\n")
		if wList, ok := wts.([]interface{}); ok {
			for _, w := range wList {
				wm, ok := w.(map[string]interface{})
				if !ok {
					continue
				}
				title, _ := wm["title"].(string)
				fmt.Fprintf(&sb, "**%s:**\n", title)
				if steps, ok := wm["steps"].([]interface{}); ok {
					for i, st := range steps {
						fmt.Fprintf(&sb, "  %d. %v\n", i+1, st)
					}
				}
				sb.WriteString("\n")
			}
		}
	}

	// redemption_tips
	if tips, ok := raw["redemption_tips"]; ok {
		sb.WriteString("### Redemption Tips\n")
		if tipMap, ok := tips.(map[string]interface{}); ok {
			for prog, val := range tipMap {
				fmt.Fprintf(&sb, "**%s:**\n", prog)
				if entry, ok := val.(map[string]interface{}); ok {
					if dos, ok := entry["do"].([]interface{}); ok {
						for _, d := range dos {
							fmt.Fprintf(&sb, "  ✅ %v\n", d)
						}
					}
					if donts, ok := entry["do_not"].([]interface{}); ok {
						for _, d := range donts {
							fmt.Fprintf(&sb, "  ❌ %v\n", d)
						}
					}
				}
				sb.WriteString("\n")
			}
		}
	}

	kb.StrategyPrompt = sb.String()
	return nil
}

// reservedTopLevelKeys are keys in rewards.yaml that are NOT loyalty programs.
// loadSimple skips these when iterating program entries.
var reservedTopLevelKeys = map[string]bool{
	"flights":            true,
	"devaluation_log":    true,
	"transfer_bonus_log": true,
}

// loadSimple parses the YAML into a raw map and extracts programs and flights.
func loadSimple(data []byte) (*KnowledgeBase, error) {
	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse knowledge base: %w", err)
	}

	kb := &KnowledgeBase{
		Programs: make(map[string]*Program),
	}

	for key, val := range raw {
		switch key {
		case "flights":
			flightsData, err := yaml.Marshal(val)
			if err != nil {
				continue
			}
			var flights []FlightRoute
			if err := yaml.Unmarshal(flightsData, &flights); err != nil {
				continue
			}
			kb.Flights = flights
		case "devaluation_log":
			b, err := yaml.Marshal(val)
			if err != nil {
				continue
			}
			var entries []DevaluationEntry
			if err := yaml.Unmarshal(b, &entries); err != nil {
				continue
			}
			kb.DevaluationLog = entries
		case "transfer_bonus_log":
			b, err := yaml.Marshal(val)
			if err != nil {
				continue
			}
			var entries []TransferBonusEntry
			if err := yaml.Unmarshal(b, &entries); err != nil {
				continue
			}
			kb.TransferBonusLog = entries
		default:
			if reservedTopLevelKeys[key] {
				continue
			}
			progData, err := yaml.Marshal(val)
			if err != nil {
				continue
			}
			var prog Program
			if err := yaml.Unmarshal(progData, &prog); err != nil {
				continue
			}
			kb.Programs[key] = &prog
		}
	}

	return kb, nil
}

// programInUserSet returns true when the program key/name matches one of the
// userPrograms slugs (case-insensitive substring match in either direction).
// We accept the user's slug as a noisy free-form input ("amex-mr-ca",
// "amex-mr", "amex_mr") and try to be generous about matching it against the
// YAML key (e.g. "amex_mr") or program display name ("Amex MR").
func programInUserSet(yamlKey, displayName string, userPrograms []string) bool {
	if len(userPrograms) == 0 {
		return true
	}
	keyNorm := normalizeProgKey(yamlKey)
	nameNorm := normalizeProgKey(displayName)
	for _, p := range userPrograms {
		pn := normalizeProgKey(p)
		if pn == "" {
			continue
		}
		if pn == keyNorm || pn == nameNorm {
			return true
		}
		if keyNorm != "" && strings.Contains(pn, keyNorm) {
			return true
		}
		if keyNorm != "" && strings.Contains(keyNorm, pn) {
			return true
		}
		if nameNorm != "" && strings.Contains(pn, nameNorm) {
			return true
		}
	}
	return false
}

// normalizeProgKey lowercases and strips separators so "amex-mr-ca",
// "amex_mr", "Amex MR" all collapse to "amexmr"-style tokens for comparison.
func normalizeProgKey(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	repl := strings.NewReplacer("-", "", "_", "", " ", "", ".", "")
	return repl.Replace(s)
}

// FormatForPrompt converts the knowledge base into a string suitable for an AI system prompt.
// If userPrograms is non-empty, only include programs the user has in their wallet —
// the supplementary strategy_principles + transfer_strategies are ALWAYS included
// because they're cross-program rules, not per-program facts.
func (kb *KnowledgeBase) FormatForPrompt(userPrograms []string) string {
	var sb strings.Builder

	sb.WriteString("## Knowledge Base — Canadian Loyalty Programs\n\n")
	sb.WriteString("⚠️ **IMPORTANT: DYNAMIC PRICING WARNING**\n")
	sb.WriteString("The award chart numbers below are PUBLISHED BASE RATES. Many programs (especially Aeroplan, Flying Blue, Delta SkyMiles, United MileagePlus) now use **dynamic pricing** where actual costs vary significantly by date, demand, and route. ")
	sb.WriteString("NEVER present these as exact prices for a specific date. Say 'starting from ~X points (published rate)' or 'typically X-Y points' unless you have LIVE search results above.\n\n")

	// CPP Benchmarks table
	sb.WriteString("### CPP Benchmarks (cents per point)\n")
	sb.WriteString("| Program | Base CPP | Sweet Spot |\n")
	sb.WriteString("|---------|----------|------------|\n")
	for key, prog := range kb.Programs {
		if prog.Name == "" {
			continue
		}
		if !programInUserSet(key, prog.Name, userPrograms) {
			continue
		}
		fmt.Fprintf(&sb, "| %s | %.1f–%.1f¢ | %s |\n",
			prog.Name, prog.CPPRange.Low, prog.CPPRange.High, prog.CPPRange.SweetSpot)
	}
	sb.WriteString("\n")

	// Transfer partners
	sb.WriteString("### Transfer Partners\n")
	for key, prog := range kb.Programs {
		if len(prog.TransfersTo) == 0 {
			continue
		}
		if !programInUserSet(key, prog.Name, userPrograms) {
			continue
		}
		fmt.Fprintf(&sb, "- **%s →** ", prog.Name)
		parts := make([]string, 0, len(prog.TransfersTo))
		for _, tp := range prog.TransfersTo {
			s := fmt.Sprintf("%s (%s)", tp.Program, tp.Ratio)
			if tp.Note != "" {
				s += " — " + tp.Note
			}
			parts = append(parts, s)
		}
		sb.WriteString(strings.Join(parts, ", "))
		sb.WriteString("\n")
	}
	sb.WriteString("\n")

	// Award charts for relevant programs
	sb.WriteString("### Award Charts (one-way per person)\n")
	for key, prog := range kb.Programs {
		if len(prog.AwardChart) == 0 {
			continue
		}
		if !programInUserSet(key, prog.Name, userPrograms) {
			continue
		}
		fmt.Fprintf(&sb, "**%s:**\n", prog.Name)
		for zone, cabins := range prog.AwardChart {
			parts := []string{}
			for cabin, pts := range cabins {
				parts = append(parts, fmt.Sprintf("%s: %dk", cabin, pts/1000))
			}
			fmt.Fprintf(&sb, "  %s — %s\n", zone, strings.Join(parts, ", "))
		}
		sb.WriteString("\n")
	}

	// Sweet spots
	sb.WriteString("### Sweet Spots & Tips\n")
	for key, prog := range kb.Programs {
		if len(prog.SweetSpots) == 0 {
			continue
		}
		if !programInUserSet(key, prog.Name, userPrograms) {
			continue
		}
		for _, ss := range prog.SweetSpots {
			fmt.Fprintf(&sb, "- %s\n", ss)
		}
	}
	sb.WriteString("\n")

	// Hotel programs
	sb.WriteString("### Hotel Programs\n")
	for key, prog := range kb.Programs {
		if len(prog.CategoryChart) == 0 && len(prog.AwardTiers) == 0 {
			continue
		}
		if !programInUserSet(key, prog.Name, userPrograms) {
			continue
		}
		fmt.Fprintf(&sb, "**%s** (%.1f–%.1f¢/pt):\n", prog.Name, prog.CPPRange.Low, prog.CPPRange.High)
		if prog.Note != "" {
			fmt.Fprintf(&sb, "  Note: %s\n", prog.Note)
		}
		if len(prog.CategoryChart) > 0 {
			parts := []string{}
			for cat, pts := range prog.CategoryChart {
				parts = append(parts, fmt.Sprintf("%s: %s", cat, formatPts(pts)))
			}
			fmt.Fprintf(&sb, "  Tiers: %s\n", strings.Join(parts, " | "))
		}
		if len(prog.AwardTiers) > 0 {
			parts := []string{}
			for tier, pts := range prog.AwardTiers {
				parts = append(parts, fmt.Sprintf("%s: %s", tier, formatPts(pts)))
			}
			fmt.Fprintf(&sb, "  Tiers: %s\n", strings.Join(parts, " | "))
		}
		// Properties
		for city, props := range prog.Properties {
			fmt.Fprintf(&sb, "  %s:\n", titleCase(city))
			for _, p := range props {
				fmt.Fprintf(&sb, "    - %s: %s pts/nt (~$%.0f CAD)\n", p.Name, formatPts(p.PtsPerNight), p.CashCAD)
			}
		}
		if len(prog.Perks) > 0 {
			for _, perk := range prog.Perks {
				fmt.Fprintf(&sb, "  - %s\n", perk)
			}
		}
		sb.WriteString("\n")
	}

	// Flights — only if there's no wallet filter, OR the flight's program
	// matches the user's wallet. Flights are large; trimming them when the
	// user holds few programs keeps the prompt small.
	if len(kb.Flights) > 0 {
		sb.WriteString("### Popular Flights from Canada\n")
		sb.WriteString("| Route | Airline | Program | Economy | Business | Duration |\n")
		sb.WriteString("|-------|---------|---------|---------|----------|----------|\n")
		for _, f := range kb.Flights {
			if !programInUserSet(f.Program, f.Program, userPrograms) {
				continue
			}
			econ := "—"
			biz := "—"
			if f.EconomyPts > 0 {
				econ = fmt.Sprintf("%dk", f.EconomyPts/1000)
			}
			if f.BusinessPts > 0 {
				biz = fmt.Sprintf("%dk", f.BusinessPts/1000)
			}
			fmt.Fprintf(&sb, "| %s→%s | %s | %s | %s | %s | %s |\n",
				f.From, f.To, f.Airline, f.Program, econ, biz, f.Duration)
		}
		sb.WriteString("\n")
	}

	// Recent devaluations — only show entries that touch a wallet program
	// when filtering is active. Always include up to 5 most recent overall.
	if len(kb.DevaluationLog) > 0 {
		sb.WriteString("### Recent Devaluations / Chart Changes\n")
		count := 0
		for _, d := range kb.DevaluationLog {
			if !programInUserSet(d.Program, d.Program, userPrograms) {
				continue
			}
			fmt.Fprintf(&sb, "- **%s** (%s): %s\n", d.Date, d.Program, d.Summary)
			count++
			if count >= 8 {
				break
			}
		}
		sb.WriteString("\n")
	}

	// Active / recent transfer bonuses — same filtering as devaluations.
	if len(kb.TransferBonusLog) > 0 {
		sb.WriteString("### Recent Transfer Bonuses (Canadian programs)\n")
		count := 0
		for _, t := range kb.TransferBonusLog {
			// Match on either source OR destination — a wallet-holder of MR cares
			// about MR→Aeroplan bonuses even if they don't "have" Aeroplan yet.
			if !programInUserSet(t.Source, t.Source, userPrograms) && !programInUserSet(t.Destination, t.Destination, userPrograms) {
				continue
			}
			fmt.Fprintf(&sb, "- %s: **%s → %s** %+d%% — %s\n",
				t.DateRange, t.Source, t.Destination, t.BonusPct, t.Note)
			count++
			if count >= 8 {
				break
			}
		}
		sb.WriteString("\n")
	}

	// Supplementary credit card strategy content — ALWAYS included regardless
	// of userPrograms filter. These are cross-program principles (card-count
	// rule, partner-strategy, transfer routing) that apply to every user.
	if kb.StrategyPrompt != "" {
		sb.WriteString(kb.StrategyPrompt)
	}

	return sb.String()
}

// titleCase capitalises the first letter of a string.
// Used instead of the deprecated strings.Title.
func titleCase(s string) string {
	if len(s) == 0 {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func formatPts(pts int) string {
	if pts >= 1000 {
		return fmt.Sprintf("%dk", pts/1000)
	}
	return fmt.Sprintf("%d", pts)
}
