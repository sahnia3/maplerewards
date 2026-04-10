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
import { setAuthTokenAccessor } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email?: string;
  session_id: string;
  display_name?: string;
  is_pro: boolean;
  auth_provider: string;
  created_at: string;
  updated_at: string;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isPro: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, sessionId?: string) => Promise<void>;
  googleLogin: (googleToken: string, sessionId?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Storage keys ────────────────────────────────────────────────────────────

const REFRESH_TOKEN_KEY = "maple_refresh_token";

// ── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  // Keep tokenRef in sync and register the accessor for API calls
  useEffect(() => {
    tokenRef.current = accessToken;
    setAuthTokenAccessor(() => tokenRef.current);
  }, [accessToken]);

  // Try to restore session on mount using refresh token
  useEffect(() => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      setIsLoading(false);
      return;
    }

    // Attempt to refresh the access token
    fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("refresh failed");
        return res.json();
      })
      .then((data: TokenPair) => {
        setAccessToken(data.access_token);
        setUser(data.user);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      })
      .catch(() => {
        // Refresh failed — clear stale token
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Handle token pair response (shared by login/register/google)
  const handleTokenPair = useCallback((data: TokenPair) => {
    setAccessToken(data.access_token);
    setUser(data.user);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  }, []);

  // Register with email/password
  const register = useCallback(
    async (email: string, password: string, displayName: string, sessionId?: string) => {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          display_name: displayName,
          session_id: sessionId || "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Registration failed" }));
        throw new Error(err.message || "Registration failed");
      }
      const data: TokenPair = await res.json();
      handleTokenPair(data);
    },
    [handleTokenPair]
  );

  // Login with email/password
  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Login failed" }));
        throw new Error(err.message || "Invalid email or password");
      }
      const data: TokenPair = await res.json();
      handleTokenPair(data);
    },
    [handleTokenPair]
  );

  // Google OAuth login
  const googleLogin = useCallback(
    async (googleToken: string, sessionId?: string) => {
      const res = await fetch(`${BASE_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google_token: googleToken,
          session_id: sessionId || "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Google login failed" }));
        throw new Error(err.message || "Google authentication failed");
      }
      const data: TokenPair = await res.json();
      handleTokenPair(data);
    },
    [handleTokenPair]
  );

  // Logout
  const logout = useCallback(async () => {
    if (accessToken) {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }).catch(() => {});
    }
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, [accessToken]);

  // Update profile
  const updateProfile = useCallback(
    async (displayName: string) => {
      if (!accessToken) throw new Error("Not authenticated");
      const res = await fetch(`${BASE_URL}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      const updated: AuthUser = await res.json();
      setUser(updated);
    },
    [accessToken]
  );

  const getAccessToken = useCallback(() => accessToken, [accessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isPro: user?.is_pro ?? false,
        isLoading,
        login,
        register,
        googleLogin,
        logout,
        updateProfile,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
