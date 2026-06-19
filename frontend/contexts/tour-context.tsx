"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { TOUR_STEPS } from "@/lib/tour/tour-steps";
import {
  hasSeenTour,
  markTourSeen,
  consumeReplayFlag,
  isWithinFirstLogin,
  TOUR_DEFER_MS,
} from "@/lib/tour/tour-config";

interface TourContextValue {
  active: boolean;
  invite: boolean;
  stepIndex: number;
  autoplay: boolean;
  start: () => void;
  dismissInvite: () => void;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
  skip: () => void;
  toggleAutoplay: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);
const LAST = TOUR_STEPS.length - 1;

export function TourProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [invite, setInvite] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  // Ensures the auto-fire gate evaluates at most once per session.
  const armedRef = useRef(false);
  // Mirror of stepIndex so next/prev can read the current step without putting
  // side effects inside a setState updater (which runs during render).
  const stepRef = useRef(0);
  useEffect(() => {
    stepRef.current = stepIndex;
  }, [stepIndex]);

  const start = useCallback(() => {
    setInvite(false);
    setStepIndex(0);
    setActive(true);
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    setAutoplay(false);
    markTourSeen(user?.id);
  }, [user]);

  // "Maybe later" — close the invite and don't re-nag.
  const dismissInvite = useCallback(() => {
    setInvite(false);
    markTourSeen(user?.id);
  }, [user]);

  const goTo = useCallback((i: number) => {
    setStepIndex(Math.max(0, Math.min(LAST, i)));
  }, []);

  const next = useCallback(() => {
    if (stepRef.current >= LAST) {
      finish();
      return;
    }
    setStepIndex(stepRef.current + 1);
  }, [finish]);

  const prev = useCallback(() => {
    setStepIndex(Math.max(0, stepRef.current - 1));
  }, []);

  const toggleAutoplay = useCallback(() => setAutoplay((a) => !a), []);

  // Navigate to the active step's route in an EFFECT — never inside render or a
  // setState updater (that triggered "Cannot update Router while rendering
  // TourProvider"). Same-route steps (the Home tour is all "/") are a no-op.
  useEffect(() => {
    if (!active) return;
    const route = TOUR_STEPS[stepIndex]?.route;
    if (route && route !== pathname) router.push(route);
  }, [active, stepIndex, pathname, router]);

  // ── Auto-fire gate ──────────────────────────────────────────────────────
  // Replay (from Settings) fires immediately. Otherwise: a freshly-created
  // account, not yet seen, lands back on Home after onboarding within the
  // first-login window.
  useEffect(() => {
    if (armedRef.current || active) return;
    if (typeof window === "undefined") return;

    if (consumeReplayFlag()) {
      armedRef.current = true;
      const t = setTimeout(start, 0);
      return () => clearTimeout(t);
    }

    if (!isAuthenticated || !user) return;
    if (hasSeenTour(user.id) || !isWithinFirstLogin(user.created_at)) {
      armedRef.current = true;
      return;
    }
    // Wait until they are actually on Home (post-onboarding).
    if (pathname !== "/") return;

    // A new account gets the invite pop-up (not an auto-launched tour).
    armedRef.current = true;
    const t = setTimeout(() => setInvite(true), TOUR_DEFER_MS);
    return () => clearTimeout(t);
  }, [active, isAuthenticated, user, pathname, start]);

  // ── Opt-in autoplay timer (off by default; any nav cancels via re-render) ─
  useEffect(() => {
    if (!active || !autoplay || stepIndex >= LAST) return;
    const t = setTimeout(next, 4200);
    return () => clearTimeout(t);
  }, [active, autoplay, stepIndex, next]);

  return (
    <TourContext.Provider
      value={{ active, invite, stepIndex, autoplay, start, dismissInvite, next, prev, goTo, skip: finish, toggleAutoplay }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
