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
  best_transfer_partner?: string;
  best_transfer_cpp?: number;
}

export interface WalletSummary {
  total_points: number;
  value_range_low: number;
  value_range_high: number;
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
