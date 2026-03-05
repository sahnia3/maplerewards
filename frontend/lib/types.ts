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
}

export interface OptimizeRequest {
  session_id: string;
  category_slug: string;
  spend_amount: number;
  mcc_code?: number;
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
}
