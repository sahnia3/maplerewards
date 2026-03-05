import type { Card, Category, UserCard, OptimizeRequest, CardRecommendation } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
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

export async function listCards(): Promise<Card[]> {
  return request<Card[]>("/cards");
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

// ── Optimizer ────────────────────────────────────────────────────────────────

export async function optimize(req: OptimizeRequest): Promise<CardRecommendation[]> {
  return request<CardRecommendation[]>("/optimize", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
