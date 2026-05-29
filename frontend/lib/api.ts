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

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

// ── Auth token accessor ──────────────────────────────────────────────────────
// AuthProvider wires both: a getter for the current access token, and an
// async refresh handler that renews the access token using the refresh
// token in localStorage. The refresh handler is called transparently when
// any request returns 401 — the frontend never sees the expiry round-trip.
let _getAccessToken: (() => string | null) | null = null;
let _refreshAccessToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenAccessor(fn: () => string | null) {
  _getAccessToken = fn;
}

export function setAuthRefreshHandler(fn: () => Promise<string | null>) {
  _refreshAccessToken = fn;
}

// Single-flight refresh: if multiple requests get 401 at the same time,
// they all wait on the same /auth/refresh call instead of stampeding it.
let inFlightRefresh: Promise<string | null> | null = null;
async function refreshOnce(): Promise<string | null> {
  if (!_refreshAccessToken) return null;
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = _refreshAccessToken().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

// CSRF token plumbing — double-submit cookie pattern. GET /csrf both sets the
// `mr_csrf` cookie AND returns the same token in its JSON body. In production
// the API (Railway) and SPA (Vercel) are on different domains, so the SPA's
// document.cookie CANNOT read the API-domain cookie — we therefore source the
// header value from the response BODY and cache it in memory, falling back to
// document.cookie only for same-origin dev. The browser still replays the
// SameSite=None cookie on the cross-site write (credentials:include), so the
// server's header==cookie double-submit check passes.
const CSRF_COOKIE = "mr_csrf";
const CSRF_HEADER = "X-CSRF-Token";
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  for (const part of document.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}

// Token from GET /csrf (body). Authoritative across domains; the cookie is
// only document.cookie-readable when the API is same-origin (dev).
let _csrfToken: string | null = null;
let _csrfSeedInflight: Promise<void> | null = null;

async function ensureCSRFCookie(force = false): Promise<void> {
  if (typeof document === "undefined") return;
  if (_csrfToken && !force) return;
  if (_csrfSeedInflight) return _csrfSeedInflight;
  _csrfSeedInflight = (async () => {
    try {
      // GET /csrf sets the cookie (for the cross-site round-trip) and returns
      // the token in the body — the value we echo back in the header.
      const res = await fetch(`${BASE_URL}/csrf`, { method: "GET", credentials: "include" });
      const data = await res.json().catch(() => null);
      _csrfToken =
        data && typeof data.csrf_token === "string" ? data.csrf_token : readCookie(CSRF_COOKIE) || null;
    } finally {
      _csrfSeedInflight = null;
    }
  })();
  return _csrfSeedInflight;
}

function currentCSRF(): string {
  return _csrfToken || readCookie(CSRF_COOKIE);
}

/** Drop the cached CSRF token so the next call re-seeds it. The server rotates
 *  the cookie on login/logout/password-change, and that rotated value isn't
 *  readable cross-domain, so callers must re-fetch after those actions. */
export function resetCSRFToken(): void {
  _csrfToken = null;
}

// Exported for auth-context and other call sites that bypass `request()`
// but still need a CSRF token for raw fetches.
export async function getCSRFToken(): Promise<string> {
  await ensureCSRFCookie();
  return currentCSRF();
}

export { CSRF_HEADER };

/** An API error with the server's machine code attached (for callers that
 *  branch on it, e.g. NO_BILLING_ACCOUNT) while .message stays human. */
export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Turns a non-OK Response into a friendly ApiError. The backend emits
 *  {"code","message"} JSON; surfacing the raw body to users (the
 *  USER_RATE_LIMITED / NO_BILLING_ACCOUNT blobs they saw) is the bug this
 *  kills class-wide — every caller that shows err.message now gets prose. */
async function errorFromResponse(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const j = JSON.parse(text);
      const msg = j?.message || j?.error;
      if (typeof msg === "string" && msg) {
        return new ApiError(msg, res.status, typeof j?.code === "string" ? j.code : undefined);
      }
    } catch {
      /* not JSON — fall through to raw text only if it's short & not a blob */
    }
    if (!text.trimStart().startsWith("{") && text.length < 200) {
      return new ApiError(text, res.status);
    }
  }
  return new ApiError(`Something went wrong (HTTP ${res.status}). Please try again.`, res.status);
}

export async function request<T>(path: string, init?: RequestInit, retryOn401 = true, retryCSRF = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };

  // Inject auth token if available
  const token = _getAccessToken?.();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Attach CSRF header for any state-changing method. Cheap on routes that
  // don't enforce CSRF; required on auth/billing.
  const method = (init?.method ?? "GET").toUpperCase();
  if (STATE_CHANGING.has(method)) {
    await ensureCSRFCookie();
    const csrf = currentCSRF();
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: init?.credentials ?? "include",
  });

  // Self-heal CSRF: the server rotates the token on login/logout/password
  // change; cross-domain we can't read the rotated cookie, so a stale cached
  // token yields 403 CSRF_FAILED. Re-seed from /csrf and replay once.
  if (res.status === 403 && retryCSRF && STATE_CHANGING.has(method)) {
    const j = await res.clone().json().catch(() => null);
    if (j && j.code === "CSRF_FAILED") {
      await ensureCSRFCookie(true);
      return request<T>(path, init, retryOn401, false);
    }
  }

  // Transparent refresh on 401 — try once, then replay the original request.
  // Endpoints that don't need auth still return 401 here when they're behind
  // RequireSessionOwner / RequirePro, so the same handling applies.
  if (res.status === 401 && retryOn401 && _refreshAccessToken) {
    const newToken = await refreshOnce();
    if (newToken) {
      return request<T>(path, init, false, retryCSRF);
    }
  }

  if (!res.ok) {
    throw await errorFromResponse(res);
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
    throw await errorFromResponse(res);
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
        // Spread payload first, then force the SSE event name to win — a stray
        // `type` field in the data payload must not override the event type.
        onEvent({ ...parsed, type: event } as ChatStreamEvent);
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
  date?: string;          // YYYY-MM-DD (legacy single-date field, optional)
  outbound_date?: string; // YYYY-MM-DD (preferred for round-trip)
  return_date?: string;   // YYYY-MM-DD (optional, round-trip)
  flex_days?: number;     // ±days around date (default 0)
  cabin: "economy" | "business" | "first";
  passengers?: number;    // default 1
  refresh?: boolean;      // when true, backend bypasses Redis cache (45-min TTL) and forces a fresh upstream pull
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

/* Award search result. Mirrors the backend pricing-trust layer in
 * internal/service/award_search.go. The trust fields are:
 *   - source: "live" = priced from a live award scrape, "estimated" = zone
 *     fallback, "live_search" = scraped from a public web source.
 *   - source_label: human-readable origin ("Google Flights", "Apify", ...).
 *   - fetched_at: RFC3339 timestamp of when the data was pulled.
 *   - taxes_cash: nullable cash add-on. nil means we didn't find a number.
 *   - taxes_included: whether taxes_cash is part of the displayed cash price.
 * Frontend MUST NOT silently render "$0 taxes" — if nil/false, say so. */
export interface AwardSearchResult {
  date: string;
  program: string;           // issuer slug (e.g. "aeroplan")
  program_name: string;
  cabin?: string;            // cabin the points price was quoted in (matches the search)
  points_cost: number;
  taxes_cash: number | null;
  taxes_included: boolean;
  cash_price_cad: number;             // ROUTE/cabin cash benchmark — NOT this flight's price
  cash_is_estimate: boolean;          // true → cash_price_cad is a zone-fallback guess, not a real fare
  economy_cash_cad?: number;          // economy cash for the same route — populated when cabin != "economy"
  cpp: number;                        // cents per point — 0 when !rated
  realistic_cpp?: number;             // cents per point against economy_cash_cad — the "would I actually pay this?" figure
  rated: boolean;                     // true ONLY when points live AND cash real; false → hide cpp/value_rating
  value_rating: "excellent" | "good" | "poor" | "";
  seats_available: number;
  source: "live" | "estimated" | "live_search";
  source_label?: string;     // "Google Flights" | "Apify" | "Seats.aero" | "estimate"
  fetched_at?: string;       // RFC3339
  booking_url: string;
  points_available: number;
  can_afford: boolean;
  card_breakdowns: CardContribution[];
  segments: AwardSegmentInfo[];
  best_transfer_partner?: string; // program slug for "Boost via" CTA
  // Optional round-trip companion legs. Backend may attach when return_date
  // was supplied. If absent, render single-leg layout (graceful fallback).
  return_leg?: {
    points_cost: number;
    cash_price_cad: number;
    cpp: number;
    segments: AwardSegmentInfo[];
  };
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

/** Self-log a private credit on a held card (P2.6). Returns the refreshed
 *  credit list so the caller can render immediately. */
export async function createCardCredit(
  sessionId: string,
  body: { card_id: string; name: string; description?: string; value_cad: number; recurrence?: string },
): Promise<CardCreditStatus[]> {
  return request<CardCreditStatus[]>(`/wallet/${sessionId}/credits`, {
    method: "POST",
    body: JSON.stringify(body),
  });
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


// ── Tangerine 2% rotating-category resolver ─────────────────────────────────

export async function listTangerineCategories(): Promise<TangerineCategory[]> {
  return request<TangerineCategory[]>("/tangerine-categories");
}

// ── Issuer page diff-watch (live monitoring of issuer pages) ────────────────

import type { IssuerPageChange } from "./types";

export async function listIssuerChanges(limit = 30): Promise<IssuerPageChange[]> {
  return request<IssuerPageChange[]>(`/issuer-changes?limit=${limit}`);
}

// ── CSV bank-statement import ───────────────────────────────────────────────

export interface ParsedTxnSample {
  date: string;
  description: string;
  /** Spend amount in CAD (always positive). */
  amount: number;
  /** Auto-derived category slug (groceries | dining | gas_transit | ...) */
  category: string;
  /** Source-currency amount when the row was foreign-currency (e.g. 890 INR). */
  original_amount?: number;
  /** ISO-4217 code; empty/omitted when the source was already CAD. */
  original_currency?: string;
}

export interface CSVPreviewResponse {
  detected_columns: Record<string, number>;
  total_rows: number;
  parsed_rows: number;
  samples: ParsedTxnSample[];
  warnings: string[];
}

export async function previewCSVImport(sessionId: string, csv: string): Promise<CSVPreviewResponse> {
  return request<CSVPreviewResponse>(`/wallet/${sessionId}/spend/import/preview`, {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
}

export async function commitCSVImport(
  sessionId: string,
  csv: string,
  cardId: string,
): Promise<{ created: number; error?: string }> {
  return request(`/wallet/${sessionId}/spend/import/commit`, {
    method: "POST",
    body: JSON.stringify({ csv, card_id: cardId }),
  });
}

// ── Card-linked offer tracker ───────────────────────────────────────────────

import type { CardOffer, CreateCardOfferRequest } from "./types";

export async function listCardOffers(sessionId: string, activeOnly = true): Promise<CardOffer[]> {
  const qs = activeOnly ? "?active=1" : "";
  return request<CardOffer[]>(`/wallet/${sessionId}/offers${qs}`);
}

export async function createCardOffer(sessionId: string, body: CreateCardOfferRequest): Promise<CardOffer> {
  return request<CardOffer>(`/wallet/${sessionId}/offers`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function markCardOfferUsed(sessionId: string, offerId: string): Promise<void> {
  return request<void>(`/wallet/${sessionId}/offers/${offerId}/used`, { method: "POST" });
}

export async function deleteCardOffer(sessionId: string, offerId: string): Promise<void> {
  return request<void>(`/wallet/${sessionId}/offers/${offerId}`, { method: "DELETE" });
}

// ── Loyalty-account aggregation ─────────────────────────────────────────────

import type {
  LoyaltyAccount,
  CreateLoyaltyAccountRequest,
  UpdateLoyaltyAccountRequest,
} from "./types";

export async function listLoyaltyAccounts(sessionId: string): Promise<LoyaltyAccount[]> {
  return request<LoyaltyAccount[]>(`/wallet/${sessionId}/loyalty-accounts`);
}

export async function createLoyaltyAccount(
  sessionId: string,
  body: CreateLoyaltyAccountRequest,
): Promise<LoyaltyAccount> {
  return request<LoyaltyAccount>(`/wallet/${sessionId}/loyalty-accounts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateLoyaltyAccount(
  sessionId: string,
  accountId: string,
  body: UpdateLoyaltyAccountRequest,
): Promise<LoyaltyAccount> {
  return request<LoyaltyAccount>(`/wallet/${sessionId}/loyalty-accounts/${accountId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteLoyaltyAccount(sessionId: string, accountId: string): Promise<void> {
  return request<void>(`/wallet/${sessionId}/loyalty-accounts/${accountId}`, {
    method: "DELETE",
  });
}

// ── Billing (Stripe) ─────────────────────────────────────────────────────────

export interface CheckoutSessionResponse {
  session_id: string;
  url: string;
}

export async function createCheckoutSession(
  // New tiers: pro_annual / proplus_annual / lifetime. Legacy monthly/annual
  // still accepted by the backend for any in-flight links.
  interval: "pro_annual" | "proplus_annual" | "lifetime" | "monthly" | "annual"
): Promise<CheckoutSessionResponse> {
  return request<CheckoutSessionResponse>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
}

// Opens the Stripe Customer Portal — cancel/change subscription, update the
// card, view invoices. Returns a URL to redirect to. Errors with
// NO_BILLING_ACCOUNT if the user has never subscribed.
export async function createPortalSession(
  // "cancel" returns the user to /goodbye after the portal (used by the
  // /cancel "Continue to cancel" path); default returns to /settings.
  flow?: "cancel"
): Promise<CheckoutSessionResponse> {
  const q = flow === "cancel" ? "?flow=cancel" : "";
  return request<CheckoutSessionResponse>(`/billing/portal${q}`, {
    method: "POST",
  });
}

// Public, token-authenticated email unsubscribe (CASL). Called from the
// /unsubscribe page with the u + e + t params from an email footer link.
export async function unsubscribeEmail(
  u: string,
  e: string,
  t: string
): Promise<{ status: string }> {
  return request<{ status: string }>("/email/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ u, e, t }),
  });
}

// ── Account Deletion ────────────────────────────────────────────────────────

export async function deleteAccount(): Promise<void> {
  return request<void>("/auth/me", { method: "DELETE" });
}

// ── Password change ────────────────────────────────────────────────────────

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request<void>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// ── Feed (live RSS aggregation) ──────────────────────────────────────────

export type FeedCategory = "all" | "devaluation" | "bonus" | "offer" | "guide" | "news";

export interface FeedArticle {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  source: string;
  category: Exclude<FeedCategory, "all">;
  image_url: string;
  published_at: string;
}

export async function listFeedArticles(category: FeedCategory = "all"): Promise<FeedArticle[]> {
  const qs = category && category !== "all" ? `?category=${encodeURIComponent(category)}` : "";
  return request<FeedArticle[]>(`/feed/articles${qs}`);
}

// ── Aeroplan June 1 devaluation projection (Pro) ─────────────────────────────

export interface AeroplanProjection {
  program: "aeroplan";
  effective_date: string;     // "2026-06-01"
  days_until: number;          // can be negative once the date passes
  balance: number;
  cpp: number;                 // cents per point
  value_today: number;         // CAD
  value_after: number;         // CAD after hike
  exposure: number;            // CAD
  headline: string;
  burn_fraction: number;       // assumption (~0.30)
  hike_percent: number;        // assumption (~0.171)
}

export async function getAeroplanJune2026Projection(
  sessionId: string,
): Promise<AeroplanProjection> {
  return request<AeroplanProjection>(
    `/wallet/${sessionId}/devaluation/aeroplan-june-2026`,
  );
}

// ── Welcome-Bonus Mission Control (Pro) ──────────────────────────────────────

export interface MissionItem {
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
  progress: number;
  days_left: number;
  days_elapsed: number;
  days_total: number;
  daily_velocity_cad: number;
  required_daily_cad: number;
  projected_total_cad: number;
  projected_shortfall_cad: number;
  will_miss: boolean;
  will_miss_by_cad: number;
  severity: "on-track" | "tight" | "critical" | "missed";
  recommendation: string;
}

export interface MissionReport {
  items: MissionItem[];
  total_active: number;
  total_at_risk_points: number;
  total_required_daily_cad: number;
}

export async function getWelcomeBonusMission(
  sessionId: string,
): Promise<MissionReport> {
  return request<MissionReport>(`/wallet/${sessionId}/welcome-bonus-mission`);
}

// ── Transfer-bonus promos (public) ───────────────────────────────────────────

export interface TransferBonusEvent {
  id: string;
  from_program: string;
  to_program: string;
  bonus_percent: number;
  starts_at?: string | null;
  expires_at?: string | null;
  source_url: string;
  source_title?: string;
  summary?: string;
  ai_confidence?: number | null;
  detected_at: string;
}

export async function getActiveTransferPromos(): Promise<TransferBonusEvent[]> {
  return request<TransferBonusEvent[]>(`/transfer-promos/active`);
}

// ── Card comparison (public) ─────────────────────────────────────────────────

import type { CardDetail as CardDetailType } from "./types";

export interface CompareDiff {
  annual_fee_delta_cad: number;
  better_annual_fee: "a" | "b" | "tie";
  welcome_bonus_delta: number;
  better_welcome_bonus: "a" | "b" | "tie";
  categories_where_a_wins: string[];
  categories_where_b_wins: string[];
  base_cpp_winner: "a" | "b" | "tie";
}

export interface CompareResponse {
  a: CardDetailType;
  b: CardDetailType;
  diff: CompareDiff;
}

export async function getCompare(
  a: string,
  b: string,
): Promise<CompareResponse> {
  return request<CompareResponse>(
    `/compare/${encodeURIComponent(a)}/${encodeURIComponent(b)}`,
  );
}

// ── Spend CSV export ───────────────────────────────────────────────────────
//
// Returns a Blob the caller can hand to a download anchor. Uses raw fetch
// because `request()` JSON-decodes — we want the raw CSV bytes.

/* ── Application tracker ────────────────────────────────────────────────── */

export interface CardApplication {
  id: string;
  user_id: string;
  card_id: string;
  card_name?: string;
  issuer?: string;
  applied_at: string;
  status: "pending" | "approved" | "declined";
  notes?: string;
  created_at: string;
}

export interface EligibilityResult {
  card_id: string;
  severity: "ok" | "warn" | "unknown";
  reason: string;
  eligible_at?: string;
  last_applied_at?: string;
  issuer_rule?: string;
}

export async function listApplications(sessionId: string): Promise<CardApplication[]> {
  const res = await request<{ applications: CardApplication[] }>(`/wallet/${sessionId}/applications`);
  return res.applications ?? [];
}

/** Per-card "safe to apply?" verdict from the issuer-cooldown advisor
 *  (backend ApplicationService.CheckEligibility). severity ∈
 *  ok | warn | unknown. */
export interface CardEligibility {
  card_id: string;
  severity: string;
  reason: string;
  /** When the issuer cooldown clears (set when severity === "warn"). */
  eligible_at?: string;
  /** Most recent recorded application to this issuer, if any. */
  last_applied_at?: string;
  issuer_rule?: string;
}

export async function getCardEligibility(
  sessionId: string,
  cardId: string,
): Promise<CardEligibility> {
  return request<CardEligibility>(`/wallet/${sessionId}/cards/${cardId}/eligibility`);
}

export async function recordApplication(
  sessionId: string,
  cardId: string,
  appliedAt: string,
  status: "pending" | "approved" | "declined" = "pending",
  notes?: string,
): Promise<CardApplication> {
  return request<CardApplication>(`/wallet/${sessionId}/applications`, {
    method: "POST",
    body: JSON.stringify({ card_id: cardId, applied_at: appliedAt, status, notes }),
  });
}

export async function deleteApplication(sessionId: string, applicationId: string): Promise<void> {
  await request(`/wallet/${sessionId}/applications/${applicationId}`, { method: "DELETE" });
}

export async function getEligibility(sessionId: string, cardId: string): Promise<EligibilityResult> {
  return request<EligibilityResult>(`/wallet/${sessionId}/cards/${cardId}/eligibility`);
}

export async function exportSpendCSV(sessionId: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  // Re-use the same auth + CSRF plumbing as request() for parity. CSRF
  // isn't strictly required on this GET, but the cookie/header pair is
  // cheap to include and protects us if we ever lock it down later.
  const token = _getAccessToken?.();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/wallet/${sessionId}/spend/export`, {
    method: "GET",
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    throw await errorFromResponse(res);
  }
  return res.blob();
}

// ── Admin (gated server-side by RequireAdmin; 403 for non-admins) ─────────────

export interface AdminUserListItem {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: string;
  is_pro: boolean;
  auth_provider: string;
  created_at: string;
  card_count: number;
  entry_count: number;
  last_spend: string | null;
}

export interface AdminUsersResponse {
  users: AdminUserListItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function adminListUsers(opts?: { limit?: number; offset?: number; q?: string }): Promise<AdminUsersResponse> {
  const p = new URLSearchParams();
  if (opts?.limit) p.set("limit", String(opts.limit));
  if (opts?.offset) p.set("offset", String(opts.offset));
  if (opts?.q) p.set("q", opts.q);
  const qs = p.toString();
  return request<AdminUsersResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
}

// AdminUserDetail mirrors the backend ExportPayload (profile + every
// user-keyed table). Loosely typed — the panel renders sections generically.
export interface AdminUserDetail {
  user_id: string;
  generated_at: string;
  profile: Record<string, unknown>;
  wallet: Array<Record<string, unknown>>;
  spend_history: Array<Record<string, unknown>>;
  card_applications: Array<Record<string, unknown>>;
  welcome_bonuses: Array<Record<string, unknown>>;
  loyalty_accounts: Array<Record<string, unknown>>;
  award_watches: Array<Record<string, unknown>>;
  chat_conversations: Array<Record<string, unknown>>;
  note?: string;
}

export async function adminUserDetail(id: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`);
}

