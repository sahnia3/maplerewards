import type {
  Card,
  Category,
  UserCard,
  UpdateCardDetailsRequest,
  OptimizeRequest,
  CardRecommendation,
  SpendEntry,
  SpendLogRequest,
  SpendStats,
  WalletSummary,
  CardDetail,
  LoyaltyProgram,
  ProgramDetailResponse,
  CardScore,
  RecommendRequest,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

// ── Auth token accessor ──────────────────────────────────────────────────────
// This is set by the AuthProvider so API calls automatically include the JWT.
let _getAccessToken: (() => string | null) | null = null;

export function setAuthTokenAccessor(fn: () => string | null) {
  _getAccessToken = fn;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };

  // Inject auth token if available
  const token = _getAccessToken?.();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Session ──────────────────────────────────────────────────────────────────

export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("maple_session_id");
}

export function setSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("maple_session_id", id);
}

export async function ensureSession(): Promise<string> {
  const existing = getSessionId();
  if (existing) return existing;
  const data = await request<{ session_id: string }>("/wallet", { method: "POST" });
  setSessionId(data.session_id);
  return data.session_id;
}

// ── Cards ────────────────────────────────────────────────────────────────────

/* Cards that the issuer has officially retired in Canada and no longer issues
 * to new customers. Filtered out of the catalogue everywhere — onboarding picker,
 * cards register, recommendations. Update this list when a card is rebranded or
 * pulled from the market. */
const RETIRED_CARD_NAMES: ReadonlySet<string> = new Set([
  /* Capital One pulled out of Canadian Aspire line ~2017–2018; replaced by
   * Aspire Cash Platinum / Smart Rewards. The Aspire Travel variants are no
   * longer issued. */
  "Capital One Aspire Travel Platinum Mastercard",
  "Capital One Aspire Travel World Elite Mastercard",
  /* Capital One Costco was never a Canadian product — Costco Canada's MC has
   * been issued by CIBC since 2015. The catalogue entry is stale data. */
  "Capital One Costco Mastercard",
  /* HSBC Canada was sold to RBC in March 2024; HSBC Canada credit cards were
   * retired and existing balances transferred to RBC products. No longer issued. */
  "HSBC +Rewards Mastercard",
  "HSBC Cashback Mastercard",
  "HSBC World Elite Mastercard",
  /* National Bank retired Syncro Mastercard in their lineup revamp (~2019); the
   * card no longer appears on nbc.ca and is replaced by ECHO Cashback. */
  "National Bank Syncro Mastercard",
  /* User-requested removals — sprite art quality could not be resolved despite
   * multiple sourcing attempts. Cards remain in market but are excluded from
   * the catalogue UI to avoid presenting low-quality / wrong imagery. */
  "Tangerine Money-Back Credit Card",
  "Simplii Financial Cash Back Visa",
]);

export async function listCards(): Promise<Card[]> {
  const all = await request<Card[]>("/cards");
  return all.filter(c => !RETIRED_CARD_NAMES.has(c.name));
}

export async function getCard(id: string): Promise<Card> {
  return request<Card>(`/cards/${id}`);
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  return request<Category[]>("/categories");
}

// ── Wallet ───────────────────────────────────────────────────────────────────

export async function getWallet(sessionId: string): Promise<UserCard[]> {
  return request<UserCard[]>(`/wallet/${sessionId}`);
}

export async function addCardToWallet(sessionId: string, cardId: string): Promise<void> {
  return request<void>(`/wallet/${sessionId}/cards`, {
    method: "POST",
    body: JSON.stringify({ card_id: cardId }),
  });
}

export async function removeCardFromWallet(sessionId: string, cardId: string): Promise<void> {
  return request<void>(`/wallet/${sessionId}/cards/${cardId}`, { method: "DELETE" });
}

export async function updateCardBalance(
  sessionId: string,
  cardId: string,
  balance: number
): Promise<void> {
  return request<void>(`/wallet/${sessionId}/cards/${cardId}/balance`, {
    method: "PUT",
    body: JSON.stringify({ balance }),
  });
}

export async function updateCardDetails(
  sessionId: string,
  cardId: string,
  details: UpdateCardDetailsRequest
): Promise<void> {
  return request<void>(`/wallet/${sessionId}/cards/${cardId}/details`, {
    method: "PUT",
    body: JSON.stringify(details),
  });
}

// ── Optimizer ────────────────────────────────────────────────────────────────

export async function optimize(req: OptimizeRequest): Promise<CardRecommendation[]> {
  return request<CardRecommendation[]>("/optimize", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Compare — run optimizer across multiple categories for N cards ────────────

export async function compareCards(
  sessionId: string,
  categorySlug: string,
  spendAmount: number
): Promise<CardRecommendation[]> {
  return optimize({ session_id: sessionId, category_slug: categorySlug, spend_amount: spendAmount });
}

// ── Spend Tracking (server-backed) ───────────────────────────────────────────

export async function logSpend(sessionId: string, entry: SpendLogRequest): Promise<SpendEntry> {
  return request<SpendEntry>(`/wallet/${sessionId}/spend`, {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

export async function getSpendHistory(
  sessionId: string,
  limit = 50,
  offset = 0
): Promise<SpendEntry[]> {
  return request<SpendEntry[]>(`/wallet/${sessionId}/spend?limit=${limit}&offset=${offset}`);
}

export async function getSpendStats(sessionId: string): Promise<SpendStats> {
  return request<SpendStats>(`/wallet/${sessionId}/spend/stats`);
}

// ── Wallet Summary ────────────────────────────────────────────────────────────

export async function getWalletSummary(sessionId: string): Promise<WalletSummary> {
  return request<WalletSummary>(`/wallet/${sessionId}/summary`);
}

// ── Card Detail ───────────────────────────────────────────────────────────────

export async function getCardDetail(cardId: string): Promise<CardDetail> {
  return request<CardDetail>(`/cards/${cardId}/detail`);
}

// ── Loyalty Programs ──────────────────────────────────────────────────────────

export async function listPrograms(): Promise<LoyaltyProgram[]> {
  return request<LoyaltyProgram[]>("/programs");
}

export async function getProgramDetail(slug: string): Promise<ProgramDetailResponse> {
  return request<ProgramDetailResponse>(`/programs/${slug}/detail`);
}

// ── Recommender ───────────────────────────────────────────────────────────────

export async function getRecommendations(req: RecommendRequest): Promise<CardScore[]> {
  return request<CardScore[]>("/recommend", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── AI Chat ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  session_id: string;
  message: string;
  history?: ChatMessage[];
  research_mode?: boolean;
}

export interface ChatResponse {
  reply: string;
  history: ChatMessage[];
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Streaming chat (SSE) ──────────────────────────────────────────────────────

export type ChatStreamEvent =
  | { type: "round_start"; round: number }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | { type: "tool_done"; id: string; name: string; summary: string }
  | { type: "round_end"; round: number; has_more: boolean }
  | { type: "done"; reply: string; history: ChatMessage[] }
  | { type: "error"; message: string };

/**
 * chatStream — POST to /chat/stream and yield events as the backend tool-use
 * loop progresses. Closes the perceived-latency gap on multi-tool prompts:
 * the user sees "Searching Aeroplan…" pills resolve in real time instead of
 * a 30-second blank screen.
 *
 * Errors raised by the network layer (auth, 4xx/5xx) reject the returned
 * promise. Errors emitted by the model after streaming starts arrive as
 * { type: "error" } events through onEvent.
 */
export async function chatStream(
  req: ChatRequest,
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  const token = _getAccessToken?.();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
    signal,
  });

  // Backend hasn't been redeployed with the streaming endpoint yet — fall back
  // to the legacy non-streaming /chat. The user gets the answer (no live pills)
  // instead of a "Sorry, I couldn't process your request" dead end.
  if (res.status === 404) {
    const resp = await chat(req);
    onEvent({ type: "done", reply: resp.reply, history: resp.history });
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  // SSE frames are separated by a blank line. Each frame has zero-or-more
  // "field: value" lines; we care about "event:" and "data:".
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);

      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        onEvent({ type: event, ...parsed } as ChatStreamEvent);
      } catch {
        // Ignore malformed frame
      }
    }
  }
}

// ── Trip Planner ────────────────────────────────────────────────────────────

export interface TripRequest {
  session_id: string;
  origin?: string;         // flights only
  destination: string;
  cabin: "economy" | "business" | "first" | "standard" | "deluxe" | "suite";
  trip_type: "flight" | "hotel";
  date?: string;           // YYYY-MM-DD
  checkout_date?: string;  // hotels only
  passengers?: number;     // default 1
  nights?: number;         // hotels only
}

export interface CardContribution {
  card_name: string;
  card_id: string;
  program_name: string;
  points_held: number;
  transfer_ratio: number;
  points_after_transfer: number;
}

export interface RedemptionOption {
  program_name: string;
  program_slug: string;
  points_available: number;
  estimated_cpp: number;
  estimated_value: number;
  transfer_path: string;
  transfer_ratio: number;
  booking_url: string;
  notes: string;
  // Core fields
  points_required: number;
  can_afford: boolean;
  savings_rating: "good" | "fair" | "bad" | "";
  value_per_point: number;
  properties_count: number;
  card_breakdowns: CardContribution[];
  // Real pricing fields
  cash_price_cad: number;
  data_source: "live_search" | "knowledge_base" | "estimated" | "";
  property_name: string;
  hotel_category: number;
  airline_name: string;
}

export async function evaluateTrip(req: TripRequest): Promise<RedemptionOption[]> {
  return request<RedemptionOption[]>("/trip/evaluate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Award Search ─────────────────────────────────────────────────────────────

export interface AwardSearchRequest {
  session_id: string;
  origin: string;
  destination: string;
  date: string;           // YYYY-MM-DD
  flex_days?: number;     // ±days around date (default 0)
  cabin: "economy" | "business" | "first";
  passengers?: number;    // default 1
}

export interface AwardSegmentInfo {
  origin: string;
  destination: string;
  airline: string;
  flight_number: string;
  departure_time: string;
  arrival_time: string;
  aircraft: string;
}

export interface AwardSearchResult {
  date: string;
  program: string;           // issuer slug (e.g. "aeroplan")
  program_name: string;
  points_cost: number;
  taxes_cash: number;
  cash_price_cad: number;
  cpp: number;               // cents per point
  value_rating: "excellent" | "good" | "poor";
  seats_available: number;
  source: "live" | "estimated";
  booking_url: string;
  points_available: number;
  can_afford: boolean;
  card_breakdowns: CardContribution[];
  segments: AwardSegmentInfo[];
}

export async function searchAwards(req: AwardSearchRequest): Promise<AwardSearchResult[]> {
  return request<AwardSearchResult[]>("/trip/award-search", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Portfolio Analysis ────────────────────────────────────────────────────────

import type { PortfolioAnalysis, WelcomeBonus } from "./types";

export async function getPortfolioAnalysis(sessionId: string): Promise<PortfolioAnalysis> {
  return request<PortfolioAnalysis>(`/wallet/${sessionId}/portfolio/analysis`);
}

// ── Bonus Tracking (Milestones) ──────────────────────────────────────────────

export async function getUserBonuses(sessionId: string): Promise<WelcomeBonus[]> {
  return request<WelcomeBonus[]>(`/wallet/${sessionId}/bonuses`);
}

export async function activateBonus(sessionId: string, cardId: string): Promise<WelcomeBonus> {
  return request<WelcomeBonus>(`/wallet/${sessionId}/bonuses/${cardId}/activate`, {
    method: "POST",
  });
}

// ── Missed Rewards (Pro-tier insight) ────────────────────────────────────────

import type { MissedRewardsReport } from "./types";

export async function getMissedRewards(
  sessionId: string,
  opts?: { sinceDays?: number; top?: number }
): Promise<MissedRewardsReport> {
  const qs = new URLSearchParams();
  if (opts?.sinceDays != null) qs.set("since", String(opts.sinceDays));
  if (opts?.top != null) qs.set("top", String(opts.top));
  const tail = qs.toString() ? `?${qs.toString()}` : "";
  return request<MissedRewardsReport>(`/wallet/${sessionId}/missed-rewards${tail}`);
}

// ── Card Credits + Annual-Fee Countdown ──────────────────────────────────────

import type { CardCreditStatus } from "./types";

export async function getCardCredits(sessionId: string): Promise<CardCreditStatus[]> {
  return request<CardCreditStatus[]>(`/wallet/${sessionId}/credits`);
}

export async function recordCreditRedemption(
  sessionId: string,
  creditDefId: string,
  body: { redeemed_amount: number; note?: string }
): Promise<CardCreditStatus> {
  return request<CardCreditStatus>(`/wallet/${sessionId}/credits/${creditDefId}/redeem`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── 2026 Aeroplan SQC Projector ──────────────────────────────────────────────

import type { SQCProjection } from "./types";

export async function getSQCProjection(sessionId: string): Promise<SQCProjection> {
  return request<SQCProjection>(`/wallet/${sessionId}/sqc-projection`);
}

// ── Aeroplan availability watcher ────────────────────────────────────────────

import type {
  AwardWatch, CreateAwardWatchRequest,
  BuyPromo, BuyPointsRequest, BuyPointsVerdict,
  DevaluationEvent,
  Merchant, StackRecommendation,
  CardValueSummary,
  IndiaArbitrageProperty,
  TangerineCategory,
} from "./types";

export async function listAwardWatches(sessionId: string): Promise<AwardWatch[]> {
  return request<AwardWatch[]>(`/wallet/${sessionId}/award-watches`);
}

export async function createAwardWatch(sessionId: string, body: CreateAwardWatchRequest): Promise<AwardWatch> {
  return request<AwardWatch>(`/wallet/${sessionId}/award-watches`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteAwardWatch(sessionId: string, watchId: string): Promise<void> {
  return request<void>(`/wallet/${sessionId}/award-watches/${watchId}`, { method: "DELETE" });
}

// ── Buy-points break-even calculator ─────────────────────────────────────────

export async function listBuyPromos(): Promise<BuyPromo[]> {
  return request<BuyPromo[]>("/buy-points/promos");
}

export async function evaluateBuyPoints(req: BuyPointsRequest): Promise<BuyPointsVerdict> {
  return request<BuyPointsVerdict>("/buy-points/evaluate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Devaluation alerts ───────────────────────────────────────────────────────

export async function listDevaluations(sessionId?: string): Promise<DevaluationEvent[]> {
  const path = sessionId ? `/wallet/${sessionId}/devaluations` : "/devaluations";
  return request<DevaluationEvent[]>(path);
}

// ── Triple-stack calculator ──────────────────────────────────────────────────

export async function listMerchants(): Promise<Merchant[]> {
  return request<Merchant[]>("/merchants");
}

export async function recommendStack(req: { session_id: string; merchant_slug: string; spend_amount: number }): Promise<StackRecommendation> {
  return request<StackRecommendation>("/stack-recommend", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Annual card-value comparison ─────────────────────────────────────────────

export async function getCardValueSummary(sessionId: string): Promise<CardValueSummary[]> {
  return request<CardValueSummary[]>(`/wallet/${sessionId}/card-value`);
}

// ── India-outbound hotel arbitrage ───────────────────────────────────────────

export async function getIndiaArbitrage(sessionId: string): Promise<IndiaArbitrageProperty[]> {
  return request<IndiaArbitrageProperty[]>(`/wallet/${sessionId}/india-arbitrage`);
}

// ── Tangerine 2% rotating-category resolver ─────────────────────────────────

export async function listTangerineCategories(): Promise<TangerineCategory[]> {
  return request<TangerineCategory[]>("/tangerine-categories");
}

// ── Billing (Stripe) ─────────────────────────────────────────────────────────

export interface CheckoutSessionResponse {
  session_id: string;
  url: string;
}

export async function createCheckoutSession(
  interval: "monthly" | "annual"
): Promise<CheckoutSessionResponse> {
  return request<CheckoutSessionResponse>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
}

// ── Account Deletion ────────────────────────────────────────────────────────

export async function deleteAccount(): Promise<void> {
  return request<void>("/auth/me", { method: "DELETE" });
}

