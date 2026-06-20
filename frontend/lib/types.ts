export interface LoyaltyProgram {
  id: string;
  name: string;
  slug: string;
  currency_name: string;
  program_type: "airline" | "bank" | "hotel" | "cashback";
  base_cpp: number;
  is_active: boolean;
  updated_at: string;
}

export type CardOfferSource = "amex_offers" | "rbc_offers" | "scene_plus" | "other";

export interface CardOffer {
  id?: string;
  user_id?: string;
  card_id: string;
  card_name?: string;
  source: CardOfferSource;
  merchant: string;
  description?: string | null;
  earn_amount?: number | null;
  min_spend?: number | null;
  activated_at?: string | null;
  expires_at?: string | null;
  is_used: boolean;
  used_at?: string | null;
  notes?: string | null;
  /** Days until expiry; negative if expired. */
  days_to_expiry?: number | null;
}

export interface CreateCardOfferRequest {
  card_id: string;
  source: CardOfferSource;
  merchant: string;
  description?: string | null;
  earn_amount?: number | null;
  min_spend?: number | null;
  activated_at?: string | null;
  expires_at?: string | null;
  notes?: string | null;
}

export interface LoyaltyAccount {
  id?: string;
  user_id?: string;
  program_slug: string;
  program_name?: string;
  account_label?: string | null;
  balance: number;
  expires_at?: string | null;        // YYYY-MM-DD
  last_activity?: string | null;      // YYYY-MM-DD
  notes?: string | null;
  /** Derived by service: days until expiry (negative if past). */
  days_to_expiry?: number | null;
  /** Plain-English program-rule note ("expires 18 mo after last activity"). */
  expiry_rule_note?: string | null;
}

export interface CreateLoyaltyAccountRequest {
  program_slug: string;
  account_label?: string | null;
  balance: number;
  expires_at?: string | null;
  last_activity?: string | null;
  notes?: string | null;
}

export interface UpdateLoyaltyAccountRequest {
  balance?: number;
  expires_at?: string | null;
  last_activity?: string | null;
  notes?: string | null;
}

export interface IssuerPageChange {
  id: string;
  page_id: string;
  page_label: string;
  page_url: string;
  program_slug?: string | null;
  detected_at: string;       // ISO timestamp
  diff_summary: string;      // one-line headline
  diff_snippet: string;      // ~500 char before/after
  ai_confidence?: number | null;
}

export interface Card {
  id: string;
  name: string;
  issuer: string;
  network: "visa" | "mastercard" | "amex";
  loyalty_program_id: string;
  loyalty_program?: LoyaltyProgram;
  annual_fee: number;
  welcome_bonus_points: number;
  welcome_bonus_min_spend: number;
  welcome_bonus_months: number;
  /**
   * ISO date (YYYY-MM-DD) when the public welcome-offer reverts to the
   * standard amount. Distinct from the user's personal min-spend deadline.
   */
  welcome_bonus_offer_expires_at?: string;
  welcome_bonus_offer_source?: string;
  // Optional commercial relationship — populated when we have an affiliate
  // link configured for this card. ApplyButton hides itself when unset.
  affiliate_url?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id?: string;
  mcc_codes: number[];
}

export interface UserCard {
  id: string;
  user_id: string;
  card_id: string;
  card?: Card;
  point_balance: number;
  added_at: string;
  nickname?: string;
  points_expiry_date?: string;
  date_opened?: string;
  has_annual_fee?: boolean;
  custom_annual_fee?: number;
}

export interface UpdateCardDetailsRequest {
  point_balance?: number;
  nickname?: string;
  points_expiry_date?: string;
  date_opened?: string;
  has_annual_fee?: boolean;
  custom_annual_fee?: number;
}

export interface OptimizeRequest {
  session_id: string;
  category_slug: string;
  spend_amount: number;
  mcc_code?: number;
  redemption_segment?: "base" | "business";
  /** Optional merchant slug for network-routing rules. "costco_ca" filters to Mastercard-only. */
  merchant?: string;
}

export interface CardRecommendation {
  card_id: string;
  card_name: string;
  program_name: string;
  earn_rate: number;
  program_cpp: number;
  effective_return: number;
  points_earned: number;
  dollar_value: number;
  is_cap_hit: boolean;
  note?: string;
  transfer_partner?: string;
  transfer_ratio?: number;
  transfer_cpp?: number;
  redemption_segment?: string;
}

// ── Spend Tracking ──────────────────────────────────────────────────────────

export interface SpendEntry {
  id: string;
  user_id: string;
  card_id: string;
  card_name?: string;
  category_id: string;
  category_slug?: string;
  category_name?: string;
  amount: number;
  points_earned: number;
  dollar_value: number;
  spent_at: string;
  created_at?: string;
  note?: string;
}

export interface SpendLogRequest {
  card_id: string;
  category_slug: string;
  amount: number;
  date?: string;
  note?: string;
}

export interface SpendStats {
  total_spend: number;
  total_value: number;
  total_points: number;
  entry_count: number;
  avg_return: number;
  by_category: CategoryStat[];
  by_card: CardStat[];
}

export interface CategoryStat {
  category_name: string;
  total_spend: number;
  total_value: number;
  entry_count: number;
}

export interface CardStat {
  card_name: string;
  total_spend: number;
  total_value: number;
  avg_return: number;
}

export interface PointsMonth {
  month: string; // YYYY-MM
  points_earned: number;
  dollar_value: number;
  entry_count: number;
}

export interface PointsSeries {
  months: PointsMonth[];
  window_total: number;
  prior_total: number;
  delta_pct: number;
}

// ── Transfer Partners ────────────────────────────────────────────────────────

export interface TransferPartner {
  id: string;
  from_program_id: string;
  to_program_id: string;
  transfer_ratio: number;
  minimum_transfer: number;
  transfer_increment: number;
  processing_days: number;
  is_active: boolean;
  notes?: string;
  to_program?: LoyaltyProgram;
  from_program?: LoyaltyProgram;
}

// ── Wallet Summary ───────────────────────────────────────────────────────────

export interface CardSummaryItem {
  card_id: string;
  card_name: string;
  issuer: string;
  network: string;
  point_balance: number;
  program_name: string;
  base_cpp: number;
  value_low: number;
  value_high: number;
  value_sweet_spot: number;
  best_transfer_partner?: string;
  best_transfer_cpp?: number;
}

export interface WalletSummary {
  total_points: number;
  value_range_low: number;
  value_range_high: number;
  value_sweet_spot: number;
  cards: CardSummaryItem[];
}

// ── Card Detail ──────────────────────────────────────────────────────────────

export interface MultiplierRow {
  category_name: string;
  category_slug: string;
  earn_rate: number;
  earn_type: string;
  cap_amount?: number;
  cap_period?: string;
  notes?: string;
}

export interface CardDetail {
  card: Card;
  multipliers: MultiplierRow[];
  transfer_partners: TransferPartner[];
  value_range_low: number;
  value_range_high: number;
}

// ── Program Detail ───────────────────────────────────────────────────────────

export interface ProgramDetailResponse {
  program: LoyaltyProgram;
  transfer_out: TransferPartner[];
  transfer_in: TransferPartner[];
  /** RFC3339 timestamp (point_valuations.recorded_at) of when this program's
   *  base CPP was last refreshed. Omitted when no base valuation row exists. */
  valuation_as_of?: string;
}

// ── Recommender ──────────────────────────────────────────────────────────────

export interface CategoryReturn {
  category_name: string;
  category_slug: string;
  monthly_spend: number;
  earn_rate: number;
  earn_type: string;
  monthly_value: number;
}

export interface CardScore {
  card_id: string;
  card_name: string;
  issuer: string;
  network: string;
  annual_fee: number;
  gross_annual_value: number;
  net_annual_value: number;
  effective_return: number;
  top_categories: CategoryReturn[];
  welcome_bonus_value: number;
  loyalty_program: string;
  base_cpp: number;
  welcome_bonus_points: number;
  welcome_bonus_min_spend: number;
  welcome_bonus_months: number;
}

export interface RecommendRequest {
  monthly_spend: Record<string, number>;
  // Hard ceiling on annual fee. 0 = "no annual fee" (excludes every fee card);
  // omit / null for no fee preference.
  max_annual_fee?: number | null;
  // Desired number of cards to recommend — honours the wallet-size preference
  // (e.g. 1 when the user only wants a single card).
  card_count?: number | null;
}

// ── Portfolio Analysis ──────────────────────────────────────────────────────

export interface PortfolioAnalysis {
  fee_roi: CardFeeROI[];
  dollar_gap: DollarGapAnalysis;
  utilization: UtilizationScore;
}

export interface CardFeeROI {
  card_id: string;
  card_name: string;
  annual_fee: number;
  value_earned: number;
  total_spend: number;
  avg_return: number;
  net_roi: number;
  breakeven_spend: number;
}

export interface DollarGapAnalysis {
  total_actual_value: number;
  total_optimal_value: number;
  total_gap: number;
  entries: GapEntry[];
}

export interface GapEntry {
  category_name: string;
  card_used: string;
  optimal_card: string;
  actual_value: number;
  optimal_value: number;
  gap: number;
  total_spend: number;
}

export interface UtilizationScore {
  score: number;
  covered_categories: number;
  total_categories: number;
  gaps: CategoryGap[];
}

export interface CategoryGap {
  category_name: string;
  best_card_in_wallet: string;
  wallet_return: number;
  is_covered: boolean;
}

// ── Welcome Bonus Tracking ──────────────────────────────────────────────────

export interface WelcomeBonus {
  id: string;
  user_id: string;
  card_id: string;
  card_name?: string;
  card_issuer?: string;
  activated_at: string;
  deadline_at: string;
  min_spend: number;
  current_spend: number;
  bonus_points: number;
  is_completed: boolean;
  completed_at?: string;
  progress: number; // 0.0 - 1.0
  days_left: number;
}

// ── Missed Rewards Reports ──────────────────────────────────────────────────

export interface MissedRewardEntry {
  spend_entry_id: string;
  spent_at: string;
  /** Merchant string from spend_entries.note — e.g. "METRO #129 TORONTO". */
  description?: string;
  category_slug: string;
  category_name: string;
  amount: number;
  actual_card_id: string;
  actual_card_name: string;
  actual_value: number;
  optimal_card_id: string;
  optimal_card_name: string;
  optimal_value: number;
  gap: number;
}

export interface CategoryMissed {
  category_slug: string;
  category_name: string;
  total_spend: number;
  actual_value: number;
  optimal_value: number;
  gap: number;
  optimal_card_name: string;
  entry_count: number;
  missed_count: number;
}

export interface MissedRewardsReport {
  since: string;
  total_spend: number;
  total_actual_value: number;
  total_optimal_value: number;
  total_gap: number;
  entry_count: number;
  missed_count: number;
  by_category: CategoryMissed[];
  top_missed: MissedRewardEntry[];
  wallet_snapshot: string; // "current" — disclosure for users
}

// ── Card Credits + Annual-Fee Countdown ──────────────────────────────────────

export interface CardCreditStatus {
  credit_def_id: string;
  card_id: string;
  card_name: string;
  card_annual_fee: number;
  fee_renewal_date?: string;     // ISO YYYY-MM-DD
  days_to_renewal?: number;

  name: string;                  // e.g. "Travel Credit"
  description?: string;
  value_cad: number;
  recurrence: "annual" | "biennial" | "quadrennial" | "once";
  sort_order: number;

  user_credit_id?: string;
  anniversary_year: number;
  redeemed_amount: number;
  redeemed_at?: string;
  remaining: number;
  status: "unused" | "partial" | "redeemed";
  note?: string;
}

// ── 2026 Aeroplan SQC (Status Qualifying Credits) projector ──────────────────

export interface SQCCardContribution {
  card_id: string;
  card_name: string;
  dollars_per_sqc: number;
  ytd_spend: number;
  sqc_earned: number;
}

export interface SQCTier {
  status_level: string;
  sqc_required: number;
  min_revenue_cad: number;
}

export interface SQCProjection {
  year: number;
  total_sqc_earned: number;
  cards: SQCCardContribution[];
  tiers: SQCTier[];
  current_tier?: string;
  next_tier?: string;
  sqc_to_next_tier?: number;
  spend_to_next_tier?: number;
  best_card_for_gap?: string;
  wallet_has_no_aeroplan_cards: boolean;
  /** Disclosure when the current/next tier also enforces a flight-revenue floor. */
  revenue_floor_note?: string;
  // ── Optional flight inputs (additive; default 0 ⇒ legacy behaviour) ──────
  /** Echoed flight SQC the user self-reported. */
  flight_sqc?: number;
  /** Echoed flight revenue (CAD) the user self-reported. */
  flight_spend_cad?: number;
  /** Highest tier meeting BOTH the SQC threshold AND its flight-revenue floor. */
  qualified_tier?: string;
  /** min_revenue_cad for the next/target tier (0 if no floor). */
  revenue_floor_cad?: number;
  /** Whether reported flight revenue clears revenue_floor_cad. */
  revenue_floor_met?: boolean;
  /** Additional flight revenue (CAD) needed to clear the next tier's floor. */
  revenue_floor_gap_cad?: number;
  // ── Optional target-tier selector (additive; absent ⇒ legacy behaviour) ──
  /** Echo of the requested target tier, normalized to the matched status_level. */
  target_tier?: string;
  /** sqc_required of the matched target tier. */
  target_sqc_required?: number;
  /** SQC still needed to reach the chosen target tier (0 if already met). */
  sqc_to_target_tier?: number;
  /** CAD spend at the user's best card rate to close the target gap. */
  spend_to_target_tier?: number;
  /** Which card minimises spend-to-target. */
  best_card_for_target?: string;
  /** True when total_sqc_earned already clears the target tier. */
  target_tier_already_met?: boolean;
}

// ── Renewal optimizer ────────────────────────────────────────────────────────

export interface RenewalDowngradeOption {
  card_id: string;
  card_name: string;
  annual_fee: number;
  fee_saved: number;
}

export interface RenewalAssessment {
  card_id: string;
  card_name: string;
  issuer: string;
  program_name: string;
  annual_fee: number;
  fee_renewal_date?: string;
  days_to_renewal?: number;
  spend_value: number;
  credits_value: number;
  credits_used: number;
  realized_net: number;
  potential_net: number;
  verdict: string;
  rationale: string;
  downgrade_options?: RenewalDowngradeOption[];
}

export interface RenewalReport {
  year: number;
  assessments: RenewalAssessment[];
  total_annual_fees: number;
  total_net_value: number;
  potential_savings: number;
  // Data-window signals (AU-8): how many distinct months of spend back the
  // verdicts, and whether that window is too thin to assert a hard "cancel".
  spend_months_observed?: number;
  thin_spend_history?: boolean;
}

// ── Transfer sweet-spot finder ───────────────────────────────────────────────

export interface TransferOption {
  to_program_slug: string;
  to_program_name: string;
  transfer_ratio: number;
  transferred_points: number;
  transfer_value_cad: number;
  uplift_cad: number;
  min_transfer: number;
  eligible: boolean;
  // Live transfer-bonus (AU-2), present only when an active bonus applies to
  // this route. effective_ratio already folds the bonus into transfer_ratio.
  bonus_percent?: number;
  bonus_label?: string;
  effective_ratio?: number;
}

export interface TransferSweetSpotSource {
  program_slug: string;
  program_name: string;
  points: number;
  keep_value_cad: number;
  base_cpp: number;
  best_transfer: TransferOption | null;
  all_transfers: TransferOption[];
}

export interface TransferSweetSpotReport {
  sources: TransferSweetSpotSource[];
  total_potential_uplift_cad: number;
  note: string;
}

// ── Welcome-bonus / churn planner ────────────────────────────────────────────

export interface ChurnCandidate {
  card_id: string;
  card_name: string;
  issuer: string;
  program_name: string;
  welcome_bonus_points: number;
  welcome_bonus_value_cad: number;
  annual_fee: number;
  net_first_year_value_cad: number;
  min_spend: number;
  min_spend_months: number;
  monthly_spend_needed_cad: number;
  min_spend_feasible: boolean;
  eligible: boolean;
  block_reason?: string;
  earliest_eligible_date?: string | null; // ISO YYYY-MM-DD, set when cooldown-blocked
}

export interface ChurnPlan {
  year: number;
  recommendations: ChurnCandidate[];
  blocked: ChurnCandidate[];
  best_next_card: string;
  total_potential_bonus_value_cad: number;
}

// ── Wallet simulator ──────────────────────────────────────────────────────────

export interface SimulatorCardRef {
  card_id: string;
  card_name: string;
  annual_fee: number;
}

export interface SimulatorCategoryChange {
  category_name: string;
  annual_spend: number;
  before_card: string;
  before_value: number;
  after_card: string;
  after_value: number;
  delta_cad: number;
}

export interface SimulationResult {
  baseline_annual_value: number;
  simulated_annual_value: number;
  value_delta_cad: number;
  fee_delta_cad: number;
  net_delta_after_fees_cad: number;
  added: SimulatorCardRef[];
  dropped: SimulatorCardRef[];
  category_changes: SimulatorCategoryChange[];
  ignored_already_held: string[];
  ignored_not_held: string[];
  note: string;
}

// ── Household optimizer ───────────────────────────────────────────────────────

export interface HouseholdCategoryCoverage {
  category_name: string;
  best_card_id: string;
  best_card_name: string;
  owner: "you" | "partner";
  effective_value: number;
}

export interface HouseholdCancelCandidate {
  card_id: string;
  card_name: string;
  owner: "you" | "partner";
  annual_fee: number;
  reason: string;
}

export interface HouseholdReport {
  category_coverage: HouseholdCategoryCoverage[];
  cancel_candidates: HouseholdCancelCandidate[];
  total_fee_savings_opportunity_cad: number;
  you_card_count: number;
  partner_card_count: number;
  note: string;
}

// ── Points-expiry guardian ───────────────────────────────────────────────────

export interface ExpiryAccount {
  program_slug: string;
  program_name: string;
  account_label?: string | null;
  balance: number;
  effective_expiry?: string | null; // ISO date, null = never
  days_to_expiry?: number | null;   // null = never
  points_at_risk_cad: number;
  risk: string; // critical | warning | watch | ok | none
  reset_suggestion: string;
}

export interface ExpiryReport {
  generated_year: number;
  accounts: ExpiryAccount[];
  total_points_at_risk_cad: number;
  accounts_expiring_soon: number;
}

// ── Aeroplan availability watcher ────────────────────────────────────────────

export interface AwardWatch {
  id?: string;
  user_id?: string;
  origin: string;
  destination: string;
  depart_date: string;
  flex_days: number;
  cabin: "economy" | "business" | "first";
  max_points?: number | null;
  program_slug: string;
  is_active: boolean;
  last_checked_at?: string;
  last_min_points?: number | null;
  seats_available?: number | null;   // cheapest award's seat count from latest worker probe
  seats_checked_at?: string;          // RFC3339, when seats were last refreshed
  created_at?: string;
}

export interface CreateAwardWatchRequest {
  origin: string;
  destination: string;
  depart_date: string;
  flex_days: number;
  cabin: "economy" | "business" | "first";
  max_points?: number | null;
  program_slug: string;
}

// ── Buy-points break-even calculator ─────────────────────────────────────────

export interface BuyPromo {
  program_slug: string;
  promo_label: string;
  base_cents_per_point: number;
  promo_cents_per_point: number;
  valid_from: string;
  valid_to?: string;
  source_url?: string;
}

export interface BuyPointsRequest {
  program_slug: string;
  points_needed: number;
  cash_alternative_cad: number;
}

export interface BuyPointsVerdict {
  program_slug: string;
  points_needed: number;
  cash_alternative_cad: number;
  break_even_cents_per_point: number;
  current_promo_cents_per_point: number;
  base_purchase_cents_per_point: number;
  buy_cost_cad: number;
  verdict: "buy" | "earn" | "pay_cash";
  rationale: string;
  promo_label?: string;
  source_url?: string;
}

// ── Devaluation events ───────────────────────────────────────────────────────

export interface DevaluationEvent {
  id: string;
  program_slug: string;
  title: string;
  description: string;
  severity: "minor" | "major";
  effective_date: string;
  posted_at: string;
  source_url?: string;
  days_until: number;
  user_holds_balance: boolean;
}

export interface DevaluationTrendPoint {
  month: string; // "YYYY-MM"
  points: number;
}

export interface DevaluationProjection {
  id: string;
  program_slug: string;
  title: string;
  severity: "minor" | "major";
  effective_date: string;
  days_until: number;
  hike_percent: number; // e.g. 0.171 (derived from severity, not per-event data)
  burn_fraction: number; // e.g. 0.30
  today_points: number; // fixed UI anchor, e.g. 75000
  after_points: number; // e.g. 87825
  user_holds_balance: boolean;
  balance: number; // user's points in this program (0 if none)
  cpp: number; // cents per point
  value_today: number; // CAD (0 when no balance)
  value_after: number; // CAD
  exposure: number; // CAD = today - after
  headline: string;
  alert_enabled: boolean; // persisted toggle state
  trend: DevaluationTrendPoint[]; // synthetic/directional projection series
}

export interface DevaluationAlert {
  program_slug: string;
  created_at: string;
}

// ── Triple-stack calculator ──────────────────────────────────────────────────

export interface Merchant {
  slug: string;
  name: string;
  category_slug?: string;
  primary_url?: string;
}

export interface PortalRate {
  portal: string;
  merchant_slug: string;
  rate_pct: number;
  source_url?: string;
  scraped_at?: string;
}

export interface NetworkOffer {
  id: string;
  network: "amex" | "visa" | "mastercard";
  merchant_slug: string;
  title: string;
  reward_type: "statement_credit" | "bonus_points" | "merchant_discount";
  reward_value: number;
  min_spend: number;
  card_filter?: string | null;
  valid_to?: string | null;
  source: string;
  source_url?: string;
}

export interface StackComponent {
  layer: "portal" | "card" | "network_offer" | "loyalty";
  source: string;
  value_cad: number;
  detail?: string;
  source_url?: string;
}

export interface StackRecommendation {
  merchant_slug: string;
  merchant_name: string;
  spend_amount: number;
  best_portal?: PortalRate;
  best_card?: CardRecommendation;
  network_offers: NetworkOffer[];
  components: StackComponent[];
  total_value_cad: number;
  effective_return_pct: number;
  warnings?: string[];
}

// ── Annual card value ────────────────────────────────────────────────────────

export interface CardValueComponent {
  component_type: "insurance" | "lounge" | "concierge" | "fx_savings" | "multiplier" | "credit_bundle";
  annual_ev_cad: number;
  description: string;
  sort_order: number;
}

export interface CardValueSummary {
  card_id: string;
  card_name: string;
  annual_fee: number;
  components: CardValueComponent[];
  total_ev_cad: number;
  net_ev_cad: number;
  is_positive: boolean;
}

// ── Tangerine MCC categories ─────────────────────────────────────────────────

export interface TangerineCategory {
  slug: string;
  display_name: string;
  mcc_codes: number[];
  description?: string;
}
