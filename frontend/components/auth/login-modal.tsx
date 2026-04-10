"use client";

import { useState } from "react";
import { X, Mail, Lock, User, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useSession } from "@/contexts/session-context";

type Tab = "login" | "register";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const { sessionId } = useSession();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (tab === "login") {
        await login(email, password);
      } else {
        if (!displayName.trim()) {
          setError("Display name is required");
          setLoading(false);
          return;
        }
        await register(email, password, displayName, sessionId || undefined);
      }
      onClose();
      // Reset form
      setEmail("");
      setPassword("");
      setDisplayName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-[420px] mx-4 rounded-2xl p-6"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-dim)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: "var(--text-tertiary)" }}
        >
          <X size={18} />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-6">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center maple-bg"
            style={{ boxShadow: "0 2px 12px rgba(200,16,46,0.35)" }}
          >
            <span className="text-[16px] leading-none">🍁</span>
          </div>
          <span className="text-[16px] font-semibold text-white">
            maple<span style={{ color: "var(--maple)" }}>rewards</span>
          </span>
        </div>

        {/* Tab switcher */}
        <div
          className="flex rounded-xl p-1 mb-5"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          {(["login", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium transition-all"
              style={{
                background: tab === t ? "rgba(13,148,136,0.15)" : "transparent",
                color: tab === t ? "var(--teal-light)" : "var(--text-tertiary)",
              }}
            >
              {t === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {tab === "register" && (
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-tertiary)" }}
              />
              <input
                type="text"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13.5px] outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--border-dim)",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--teal)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border-dim)")}
              />
            </div>
          )}

          <div className="relative">
            <Mail
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-tertiary)" }}
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13.5px] outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-dim)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--teal)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border-dim)")}
            />
          </div>

          <div className="relative">
            <Lock
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-tertiary)" }}
            />
            <input
              type="password"
              placeholder={tab === "register" ? "Password (min 8 characters)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={tab === "register" ? 8 : undefined}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13.5px] outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-dim)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--teal)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border-dim)")}
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              className="text-[12.5px] px-3 py-2 rounded-lg"
              style={{
                background: "rgba(239,68,68,0.1)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-[13.5px] font-semibold text-white transition-all maple-bg flex items-center justify-center gap-2"
            style={{
              opacity: loading ? 0.7 : 1,
              boxShadow: "0 2px 16px rgba(13,148,136,0.3)",
            }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : tab === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ background: "var(--border-dim)" }} />
          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            or
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--border-dim)" }} />
        </div>

        {/* Google sign-in button (placeholder — needs Google SDK) */}
        <button
          type="button"
          className="w-full py-2.5 rounded-xl text-[13.5px] font-medium flex items-center justify-center gap-2.5 transition-all"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--border-dim)",
            color: "var(--text-primary)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
          onClick={() => {
            setError("Google Sign-In requires a GOOGLE_CLIENT_ID to be configured.");
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        {/* Footer */}
        <p
          className="text-[11px] text-center mt-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          {tab === "login"
            ? "Your anonymous data will be preserved."
            : "Your existing cards and spending will be linked to your account."}
        </p>
      </div>
    </div>
  );
}
