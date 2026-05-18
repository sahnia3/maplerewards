# Optimizer Cap-Integrity Audit

**Date:** 2026-05-18
**Trigger:** Founder QA — `/optimizer` projected Scotiabank Gold Amex at a flat 5x
for $100,000 spend (500,000 pts), ignoring its real ~$50K/yr accelerated cap.
**Status:** Investigation + audit complete. **Safety guardrail SHIPPED**
(commit "safety guardrail kills unbounded/impossible projections"): the
optimizer can no longer project an unbounded accelerated total, and
buy-points no longer endorses an impossible quantity — both bounded by
conservative, clearly-disclosed defaults, with regression tests.
**Still gated (post-`/ultraplan` + formal goal):** the *verified per-card
cap values* that replace the conservative defaults, the period-aware
accumulation code fix, and the exhaustive QA matrix.

## Root cause (sharpened)

The optimizer **code is correct**. `calculateBlendedRate` + the P0.1
shared-cap-group gating fix correctly blend a single over-cap purchase:
`$100K @ 5x with a $50K cap → 50K@5x + 50K@1x = 300K pts`. It produces the
right number **when a cap exists in the data**.

The bug is **missing cap data**. Measured against the live DB:

| Metric | Value |
|---|---|
| Cards with multipliers | 104 |
| Total multipliers | 299 |
| Multipliers with a cap (`cap_amount`) | 31 (27 annual, 4 monthly) |
| Cards with a `cap_group` | 1 (Amex Cobalt only) |
| **Bonus multipliers (rate>1) with NO cap and NOT in a cap_group** | **181** |
| Distinct cards affected | 72 of 104 |

So the optimizer projects **unbounded** accelerated earn on 72 cards. Any
above-cap spend on those cards yields a fabricated points/value figure — the
exact credibility bug the founder hit.

### Uncapped bonus multipliers by category

| Category | Uncapped mults | Cards | Rate range |
|---|---|---|---|
| Dining | 36 | 36 | 1.3–6.0 |
| Groceries | 35 | 35 | 1.3–30.0 |
| Gas & Transit | 32 | 32 | 1.3–30.0 |
| Everything Else | 31 | 30 | 1.3–10.0 |
| Travel | 31 | 31 | 1.5–9.0 |
| Pharmacy | 6 | 6 | 1.5–45.0 |
| Entertainment | 6 | 6 | 2.0–5.0 |
| Streaming & Digital | 5 | 5 | 1.3–5.0 |
| Recurring Bills | 2 | 2 | 2.0–3.0 |

Regenerate the full per-card list:

```sql
SELECT c.name, cat.name AS category, cm.earn_rate, cm.earn_type
FROM card_multipliers cm
JOIN cards c ON c.id = cm.card_id
JOIN categories cat ON cat.id = cm.category_id
WHERE cm.earn_rate > 1 AND (cm.cap_amount IS NULL OR cm.cap_amount = 0)
  AND NOT EXISTS (
    SELECT 1 FROM cap_group_categories cgc
    JOIN cap_groups cg ON cg.id = cgc.cap_group_id
    WHERE cg.card_id = cm.card_id AND cgc.category_id = cm.category_id)
ORDER BY c.name, cm.earn_rate DESC;
```

### Not a rate bug (don't "correct" these)
PC World Elite shows 45x pharmacy / 30x groceries. These are **valid** —
PC Optimum CPP ≈ 0.1¢, so 30 pts/$ ≈ 3% return. The fix is to add the cap,
not change the rate. Flagged so remediation doesn't introduce a regression.

## Secondary code bug (real, but NOT the founder's symptom)

`scoreCard` calls `s.spendRepo.GetMonthlySpend(...)` for the cap-accumulation
basis **regardless of `cap_period`**. For an `annual` cap this is wrong — it
should be year-to-date. Impact is limited:
- The single-purchase optimizer with no logged history uses prior=0, so the
  blend within one purchase is still correct → annual caps DO bound a single
  big swipe correctly once `cap_amount` is set.
- It matters for users with logged spend history and for the missed-rewards
  accumulation path. Fix: a period-aware spend lookup (`GetSpendSince` with
  month-start vs year-start), threaded into `scoreCard`.

## Sibling-surface stress test (unbounded/impossible-projection class)

Probed every money-facing surface for the same class of bug:

| Surface | Verdict | Detail |
|---|---|---|
| Optimizer | **CONFIRMED CRITICAL** | 181 uncapped bonus multipliers / 72 cards (above). |
| `buy_points.go` Evaluate | **CONFIRMED — same class** | Prices/recommends `PointsNeeded` with **no per-program annual purchase ceiling**. Real programs cap purchased points/yr (Aeroplan, Marriott, etc.); `buy_promo_pricing` has no max column and `Evaluate` never bounds the quantity. Entering 2,000,000 points yields a confident "BUY — save $X" for a physically impossible purchase. Fix: add `max_purchasable_per_year` to the promo data + clamp/flag in `Evaluate`. |
| `stack.go` Recommend | **CONFIRMED — same class** | `merchant_discount`/`bonus_points` offers computed as `spend × rate` with **no max-credit cap** — a "20% back up to $40" Amex offer projects $20,000 on $100k. Flat `statement_credit` offers were already correct. |
| SQC projector (`sqc.go`) | Clear (1 minor lead) | `SpendToNextTier` is bounded by the real `aeroplan_status_thresholds` tiers — no impossible status projected. Minor: `NextTier`/`SQCToNextTier` assume `tiers` is ascending-ordered from `GetUserSQCContext`; verify ordering (low-risk, not this class). |
| Portfolio / `summary.go` | Clear | Value = `point_balance × CPP`, bounded by the user's actual entered balance. Not a spend projection. (P0.4 copy already corrected.) |

Net: **three confirmed bugs of this class** — optimizer caps, buy-points
ceiling, stack offer credits — two surfaces cleared. All three are
data+guard gaps, not broken math.

**Guardrails SHIPPED for all three** (conservative defaults + disclosure +
regression tests, full `-race` suite green): no surface can now project an
unbounded/impossible figure. The **verified per-card / per-program /
per-offer cap values** that replace the conservative defaults, plus the
period-aware accumulation code fix and the exhaustive QA matrix, remain the
`/ultraplan`-gated remediation per explicit founder sequencing.

## Remediation scope (the gated goal)

1. **Data (primary):** populate `cap_amount` / `cap_period` /
   `fallback_earn_rate` for all 181 multipliers from each card's published
   terms (new migration; shared caps → `cap_groups`). 72 cards, ~9
   categories.
2. **Code (secondary):** period-aware cap accumulation basis.
3. **QA matrix:** every category × spend {$5K, $10K, $100K, cap±$1} ×
   {base, sweet-spot} × {no merchant, MC-routing merchants}; assert no
   recommendation exceeds `cap×bonus + (spend−cap)×fallback`. Table-driven
   Go tests + headless `/optimizer` sweep.
4. **Stress-test continuation:** same unbounded-projection class on
   buy-points, SQC projector, portfolio value, missed-rewards totals.

## Verification gate
A card may not be projected above its real cap for ANY tested amount. The
181-row audit list is the checklist; each row resolves to either a real
cap value+period or an explicit "no cap (justification)".
