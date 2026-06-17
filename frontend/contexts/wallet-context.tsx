"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "./session-context";
import { useAuth } from "./auth-context";
import {
  getWallet,
  addCardToWallet,
  removeCardFromWallet,
  updateCardBalance,
  updateCardDetails as updateCardDetailsAPI,
  getWalletSummary,
} from "@/lib/api";
import type { UserCard, UpdateCardDetailsRequest, WalletSummary } from "@/lib/types";
import { stashPendingCard, readPendingCards, clearPendingCards } from "@/lib/pending-cards";

// One-line "why" shown inline before an anonymous visitor is sent to /signup,
// so the gate reads as an explanation rather than an ambush.
export const SIGNUP_GATE_PROMPT =
  "Create a free account to save this and track your rewards — takes 20 seconds.";

interface WalletContextValue {
  wallet: UserCard[];
  isLoading: boolean;
  error: string | null;
  totalPoints: number;
  summary: WalletSummary | null;
  summaryLoading: boolean;
  // Set to SIGNUP_GATE_PROMPT just before an anonymous add-card redirect fires;
  // consumers can surface it inline. Null when no gate prompt is pending.
  signupPrompt: string | null;
  getCardValueRange: (cardId: string) => { low: number; high: number } | null;
  refreshWallet: () => Promise<void>;
  addCard: (cardId: string) => Promise<void>;
  removeCard: (userCardId: string, cardId: string) => Promise<void>;
  updateBalance: (userCardId: string, cardId: string, balance: number) => Promise<void>;
  updateCardDetails: (userCardId: string, cardId: string, details: UpdateCardDetailsRequest) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { sessionId, isReady } = useSession();
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [wallet, setWallet] = useState<UserCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [signupPrompt, setSignupPrompt] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const cards = await getWallet(sessionId);
      setWallet(cards ?? []);
    } catch {
      setError("Could not load wallet");
    } finally {
      setIsLoading(false);
    }
    try {
      setSummaryLoading(true);
      const s = await getWalletSummary(sessionId);
      setSummary(s);
    } catch {
      // summary is optional, don't fail
    } finally {
      setSummaryLoading(false);
    }
  }, [sessionId]);

  // Fetch wallet when session is ready
  useEffect(() => {
    if (isReady && sessionId) {
      loadWallet();
    } else if (isReady && !sessionId) {
      setIsLoading(false);
    }
  }, [isReady, sessionId, loadWallet]);

  const refreshWallet = useCallback(async () => {
    await loadWallet();
  }, [loadWallet]);

  // Drain any cards an anonymous visitor staged before being sent to signup
  // (see addCard's unauthenticated branch + lib/pending-cards). Runs once the
  // user is authenticated and their session is ready — i.e. right after they
  // land back from the signup/OAuth round-trip. Replays each pick against the
  // real add-card API, then clears the stash and reloads so the carried cards
  // show up in the wallet they just created. Guarded so it fires a single time
  // per mount even though auth/session settle over several renders.
  const drainedRef = useRef(false);
  useEffect(() => {
    if (drainedRef.current) return;
    if (!isAuthenticated || !isReady || !sessionId) return;
    // After registration the anonymous session is deleted server-side during
    // the merge step and SessionProvider adopts the auth user's session_id.
    // isAuthenticated flips before that switch lands, so draining now would
    // replay the stash against the dead anon session (404) and lose the cards.
    // Hold until the context sessionId IS the authenticated session.
    if (user?.session_id && user.session_id !== sessionId) return;
    const pending = readPendingCards();
    if (pending.length === 0) {
      // Nothing staged: mark drained so we don't re-read on every render.
      drainedRef.current = true;
      return;
    }
    drainedRef.current = true;
    (async () => {
      let added = 0;
      let failed = 0;
      for (const cardId of pending) {
        try {
          await addCardToWallet(sessionId, cardId);
          added++;
        } catch {
          // Already in the wallet, retired, or a transient failure — skip it
          // rather than blocking the rest of the carried selections.
          failed++;
        }
      }
      if (added > 0 || failed === 0) {
        clearPendingCards();
      } else {
        // Every replay failed (e.g. session not yet usable) — keep the stash
        // and allow a retry when the session settles instead of dropping the
        // user's picks.
        drainedRef.current = false;
      }
      if (added > 0) await loadWallet();
    })();
  }, [isAuthenticated, isReady, sessionId, user, loadWallet]);

  const addCard = useCallback(
    async (cardId: string) => {
      // Anonymous (no-account) visitors cannot build a wallet anywhere in the
      // app. Add-card buttons stay visible, but the moment a logged-out user
      // tries to add, route them to create an account. Single gate for every
      // add-card surface (cards, portfolio, onboarding, stack templates).
      //
      // The backend merges their anon SESSION on register, but an anon session
      // never held cards (this gate fires before any server add), so the card
      // they just clicked would otherwise vanish on the round-trip. Stash it
      // first; the post-auth drain effect below replays it once they're back.
      if (!isAuthenticated) {
        stashPendingCard(cardId);
        // Surface a one-line "why" inline so the gate reads as an explanation,
        // not an ambush, before we hand off to /signup.
        setSignupPrompt(SIGNUP_GATE_PROMPT);
        const back = pathname && pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/cards";
        router.push(`/signup?redirect=${encodeURIComponent(back)}`);
        return;
      }
      if (!sessionId) return;
      await addCardToWallet(sessionId, cardId);
      await loadWallet();
    },
    [sessionId, loadWallet, isAuthenticated, pathname, router]
  );

  const removeCard = useCallback(
    async (userCardId: string, cardId: string) => {
      if (!sessionId) return;
      await removeCardFromWallet(sessionId, cardId);
      // Optimistic update
      setWallet((prev) => prev.filter((c) => c.id !== userCardId));
    },
    [sessionId]
  );

  const updateBalance = useCallback(
    async (userCardId: string, cardId: string, balance: number) => {
      if (!sessionId) return;
      await updateCardBalance(sessionId, cardId, balance);
      // Optimistic update
      setWallet((prev) =>
        prev.map((c) => (c.id === userCardId ? { ...c, point_balance: balance } : c))
      );
    },
    [sessionId]
  );

  const updateCardDetails = useCallback(
    async (userCardId: string, cardId: string, details: UpdateCardDetailsRequest) => {
      if (!sessionId) return;
      await updateCardDetailsAPI(sessionId, cardId, details);
      // Optimistic update
      setWallet((prev) =>
        prev.map((c) =>
          c.id === userCardId
            ? {
                ...c,
                ...(details.point_balance !== undefined && { point_balance: details.point_balance }),
                ...(details.nickname !== undefined && { nickname: details.nickname }),
                ...(details.points_expiry_date !== undefined && { points_expiry_date: details.points_expiry_date }),
                ...(details.date_opened !== undefined && { date_opened: details.date_opened }),
                ...(details.has_annual_fee !== undefined && { has_annual_fee: details.has_annual_fee }),
                ...(details.custom_annual_fee !== undefined && { custom_annual_fee: details.custom_annual_fee }),
              }
            : c
        )
      );
    },
    [sessionId]
  );

  // Effective points = manual balances + points earned from logged spend (the
  // summary computes both). Falls back to summing manual balances only if the
  // summary hasn't loaded, so the sidebar never shows a phantom 0 with cards present.
  const totalPoints = summary?.total_points ?? wallet.reduce((sum, c) => sum + c.point_balance, 0);

  const getCardValueRange = useCallback((cardId: string) => {
    if (!summary?.cards) return null;
    const item = summary.cards.find(c => c.card_id === cardId);
    if (!item) return null;
    return { low: item.value_low, high: item.value_high };
  }, [summary]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        isLoading,
        error,
        totalPoints,
        summary,
        summaryLoading,
        signupPrompt,
        getCardValueRange,
        refreshWallet,
        addCard,
        removeCard,
        updateBalance,
        updateCardDetails,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
