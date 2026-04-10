"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/auth-context";

interface SessionContextValue {
  sessionId: string | null;
  isReady: boolean;
  ensureSession: () => Promise<string>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = "maple_session_id";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

async function createAnonymousSession(): Promise<string> {
  const res = await fetch(`${BASE_URL}/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data: { session_id: string } = await res.json();
  return data.session_id;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  // Track previous user ID to detect login / logout transitions
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    // Wait for auth to finish resolving before we decide which session to use.
    if (authLoading) return;

    const currentUserId = user?.id ?? null;
    const didUserChange = currentUserId !== prevUserId.current;
    prevUserId.current = currentUserId;

    if (user?.session_id) {
      // ── Authenticated ────────────────────────────────────────────────────
      // Always switch to the auth user's own session ID.
      // This is the critical fix: after registration the anonymous user is
      // deleted from the DB during the merge step.  The auth user has a brand-
      // new session_id that is still valid.  Keeping the stale anonymous
      // session_id in localStorage causes every subsequent wallet call to 500.
      localStorage.setItem(STORAGE_KEY, user.session_id);
      setSessionId(user.session_id);
      setIsReady(true);
    } else if (didUserChange && !user) {
      // ── Just logged out ──────────────────────────────────────────────────
      // Start a fresh anonymous session so the previous user's data isn't
      // inadvertently reused.
      localStorage.removeItem(STORAGE_KEY);
      createAnonymousSession()
        .then((id) => {
          localStorage.setItem(STORAGE_KEY, id);
          setSessionId(id);
        })
        .catch(() => {
          // Fail silently — features requiring a session will show appropriate states
        })
        .finally(() => setIsReady(true));
    } else if (!isReady) {
      // ── Anonymous, initial page load ─────────────────────────────────────
      // Restore from localStorage or create a new anonymous session.
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSessionId(stored);
        setIsReady(true);
      } else {
        createAnonymousSession()
          .then((id) => {
            localStorage.setItem(STORAGE_KEY, id);
            setSessionId(id);
          })
          .catch(() => {})
          .finally(() => setIsReady(true));
      }
    }
  }, [user, authLoading, isReady]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSessionId(stored);
      return stored;
    }

    const id = await createAnonymousSession();
    localStorage.setItem(STORAGE_KEY, id);
    setSessionId(id);
    return id;
  }, [sessionId]);

  return (
    <SessionContext.Provider value={{ sessionId, isReady, ensureSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
