package knowledge

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// KnowledgeBase holds the full parsed rewards knowledge.
type KnowledgeBase struct {
	Programs       map[string]*Program `yaml:",inline"`
	Flights        []FlightRoute       `yaml:"flights"`
	StrategyPrompt string              // pre-formatted supplementary strategy content for the AI prompt
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
				sb.WriteString(fmt.Sprintf("- **%s** ($%.0f/yr): %s\n", name, fee, bestFor))
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
							sb.WriteString(fmt.Sprintf("  - %s: %dx (%s)\n", cat, mult, unit))
						}
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
				sb.WriteString(fmt.Sprintf("**%s** (%s):\n", name, rating))
				if strategy, ok := comboMap["strategy"].(map[string]interface{}); ok {
					if main, ok := strategy["main_driver"].(string); ok {
						sb.WriteString(fmt.Sprintf("  - Main driver: %s\n", main))
					}
					if bene, ok := strategy["benefits_card"].(string); ok {
						sb.WriteString(fmt.Sprintf("  - Benefits: %s\n", bene))
					}
					if back, ok := strategy["backup_card"].(string); ok {
						sb.WriteString(fmt.Sprintf("  - Backup: %s\n", back))
					}
					if reason, ok := strategy["reasoning"].(string); ok {
						sb.WriteString(fmt.Sprintf("  - Why: %s\n", reason))
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
				sb.WriteString(fmt.Sprintf("**%s:**\n", key))
				if ruleMap, ok := val.(map[string]interface{}); ok {
					if desc, ok := ruleMap["rule"].(string); ok {
						sb.WriteString(fmt.Sprintf("  %s\n", desc))
					}
					if details, ok := ruleMap["details"].([]interface{}); ok {
						for _, d := range details {
							sb.WriteString(fmt.Sprintf("  - %v\n", d))
						}
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
				sb.WriteString(fmt.Sprintf("**%s:**\n", prog))
				if entry, ok := val.(map[string]interface{}); ok {
					if dos, ok := entry["do"].([]interface{}); ok {
						for _, d := range dos {
							sb.WriteString(fmt.Sprintf("  ✅ %v\n", d))
						}
					}
					if donts, ok := entry["do_not"].([]interface{}); ok {
						for _, d := range donts {
							sb.WriteString(fmt.Sprintf("  ❌ %v\n", d))
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
		if key == "flights" {
			// Parse flights separately
			flightsData, err := yaml.Marshal(val)
			if err != nil {
				continue
			}
			var flights []FlightRoute
			if err := yaml.Unmarshal(flightsData, &flights); err != nil {
				continue
			}
			kb.Flights = flights
		} else {
			// Parse as a program
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

// FormatForPrompt converts the knowledge base into a string suitable for an AI system prompt.
// If userPrograms is non-empty, only include programs the user has in their wallet.
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
	for _, prog := range kb.Programs {
		if prog.Name == "" {
			continue
		}
		sb.WriteString(fmt.Sprintf("| %s | %.1f\u2013%.1f\u00a2 | %s |\n",
			prog.Name, prog.CPPRange.Low, prog.CPPRange.High, prog.CPPRange.SweetSpot))
	}
	sb.WriteString("\n")

	// Transfer partners
	sb.WriteString("### Transfer Partners\n")
	for _, prog := range kb.Programs {
		if len(prog.TransfersTo) == 0 {
			continue
		}
		sb.WriteString(fmt.Sprintf("- **%s →** ", prog.Name))
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
	for _, prog := range kb.Programs {
		if len(prog.AwardChart) == 0 {
			continue
		}
		sb.WriteString(fmt.Sprintf("**%s:**\n", prog.Name))
		for zone, cabins := range prog.AwardChart {
			parts := []string{}
			for cabin, pts := range cabins {
				parts = append(parts, fmt.Sprintf("%s: %dk", cabin, pts/1000))
			}
			sb.WriteString(fmt.Sprintf("  %s — %s\n", zone, strings.Join(parts, ", ")))
		}
		sb.WriteString("\n")
	}

	// Sweet spots
	sb.WriteString("### Sweet Spots & Tips\n")
	for _, prog := range kb.Programs {
		if len(prog.SweetSpots) == 0 {
			continue
		}
		for _, ss := range prog.SweetSpots {
			sb.WriteString(fmt.Sprintf("- %s\n", ss))
		}
	}
	sb.WriteString("\n")

	// Hotel programs
	sb.WriteString("### Hotel Programs\n")
	for _, prog := range kb.Programs {
		if len(prog.CategoryChart) == 0 && len(prog.AwardTiers) == 0 {
			continue
		}
		sb.WriteString(fmt.Sprintf("**%s** (%.1f\u2013%.1f\u00a2/pt):\n", prog.Name, prog.CPPRange.Low, prog.CPPRange.High))
		if prog.Note != "" {
			sb.WriteString(fmt.Sprintf("  Note: %s\n", prog.Note))
		}
		if len(prog.CategoryChart) > 0 {
			parts := []string{}
			for cat, pts := range prog.CategoryChart {
				parts = append(parts, fmt.Sprintf("%s: %s", cat, formatPts(pts)))
			}
			sb.WriteString(fmt.Sprintf("  Tiers: %s\n", strings.Join(parts, " | ")))
		}
		if len(prog.AwardTiers) > 0 {
			parts := []string{}
			for tier, pts := range prog.AwardTiers {
				parts = append(parts, fmt.Sprintf("%s: %s", tier, formatPts(pts)))
			}
			sb.WriteString(fmt.Sprintf("  Tiers: %s\n", strings.Join(parts, " | ")))
		}
		// Properties
		for city, props := range prog.Properties {
			sb.WriteString(fmt.Sprintf("  %s:\n", titleCase(city)))
			for _, p := range props {
				sb.WriteString(fmt.Sprintf("    - %s: %s pts/nt (~$%.0f CAD)\n", p.Name, formatPts(p.PtsPerNight), p.CashCAD))
			}
		}
		if len(prog.Perks) > 0 {
			for _, perk := range prog.Perks {
				sb.WriteString(fmt.Sprintf("  - %s\n", perk))
			}
		}
		sb.WriteString("\n")
	}

	// Flights
	if len(kb.Flights) > 0 {
		sb.WriteString("### Popular Flights from Canada\n")
		sb.WriteString("| Route | Airline | Program | Economy | Business | Duration |\n")
		sb.WriteString("|-------|---------|---------|---------|----------|----------|\n")
		for _, f := range kb.Flights {
			econ := "\u2014"
			biz := "\u2014"
			if f.EconomyPts > 0 {
				econ = fmt.Sprintf("%dk", f.EconomyPts/1000)
			}
			if f.BusinessPts > 0 {
				biz = fmt.Sprintf("%dk", f.BusinessPts/1000)
			}
			sb.WriteString(fmt.Sprintf("| %s\u2192%s | %s | %s | %s | %s | %s |\n",
				f.From, f.To, f.Airline, f.Program, econ, biz, f.Duration))
		}
		sb.WriteString("\n")
	}

	// Supplementary credit card strategy content
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
