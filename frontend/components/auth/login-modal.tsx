"use client";

import { useState } from "react";
import { X, Mail, Lock, User, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useSession } from "@/contexts/session-context";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

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
                background: tab === t ? "var(--info-soft-2)" : "transparent",
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
              boxShadow: "0 2px 16px var(--info-border)",
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

        {/* Google — hidden entirely (divider + button) when OAuth isn't configured.
            No dead "Continue with Google" placeholder: email/password stands alone. */}
        {!!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <>
            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ background: "var(--border-dim)" }} />
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                or
              </span>
              <div className="flex-1 h-px" style={{ background: "var(--border-dim)" }} />
            </div>

            {/* Google sign-in (real GIS button) */}
            <GoogleSignInButton
              disabled={loading}
              onSuccess={() => {
                onClose();
                setEmail("");
                setPassword("");
                setDisplayName("");
              }}
              onError={(msg) => setError(msg)}
            />
          </>
        )}

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
