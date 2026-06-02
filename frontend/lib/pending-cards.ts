/**
 * pending-cards — carries an anonymous visitor's card selections across the
 * signup redirect.
 *
 * Why this exists: a logged-out user who taps "Add to wallet" (on /cards,
 * /portfolio, /onboarding, or a stack template) can't build a server-side
 * wallet — addCard in wallet-context routes them to /signup instead. The
 * backend merges their anonymous *session* on register, but an anonymous
 * session never held any cards (anon add is gated), so the specific card they
 * clicked was silently dropped after they came back authenticated.
 *
 * This stash records the card id(s) just before that redirect and is drained
 * once the user is authenticated, replaying the adds against the real API. It
 * is the client-side complement to the server-side session merge.
 *
 * Storage is localStorage (survives the full-page navigation through /signup
 * and the OAuth round-trip). Entries are card ids only — no PII.
 */

const PENDING_CARDS_KEY = "maple_pending_cards_v1";

// Hard ceiling so a malformed/abused store can't make the post-auth drain loop
// unbounded. A real wallet pick before signup is a handful of cards at most.
const MAX_PENDING = 12;

/** Append a card id to the pending stash, de-duplicated and bounded. No-op on
 *  the server or if storage is unavailable (private mode / quota). */
export function stashPendingCard(cardId: string): void {
  if (typeof window === "undefined") return;
  if (!cardId) return;
  try {
    const existing = readPendingCards();
    if (existing.includes(cardId)) return;
    const next = [...existing, cardId].slice(0, MAX_PENDING);
    window.localStorage.setItem(PENDING_CARDS_KEY, JSON.stringify(next));
  } catch {
    /* private mode or quota — selection just won't carry; not fatal */
  }
}

/** Read the pending card ids. Returns [] for an empty/absent/corrupt store. */
export function readPendingCards(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: keep only non-empty strings, dedup, and bound.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of parsed) {
      if (typeof v === "string" && v && !seen.has(v)) {
        seen.add(v);
        out.push(v);
        if (out.length >= MAX_PENDING) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Clear the pending stash. Called after a successful post-auth drain. */
export function clearPendingCards(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_CARDS_KEY);
  } catch {
    /* noop */
  }
}
