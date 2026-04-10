"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push(redirect);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center maple-bg"
            style={{ boxShadow: "0 2px 16px rgba(13,148,136,0.25)" }}
          >
            <span className="text-lg leading-none">🍁</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            maple<span style={{ color: "var(--teal)" }}>rewards</span>
          </span>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-dim)",
          boxShadow: "var(--shadow-card)",
        }}>
          <h1 className="text-[22px] font-bold text-white text-center mb-1.5">Welcome back</h1>
          <p className="text-[14px] text-center mb-8" style={{ color: "var(--text-secondary)" }}>
            Sign in to your account
          </p>

          {/* Google */}
          <GoogleSignInButton
            disabled={loading}
            onSuccess={() => router.push(redirect)}
            onError={(msg) => setError(msg)}
          />

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px" style={{ background: "var(--border-dim)" }} />
            <span className="text-[12px] font-medium" style={{ color: "var(--text-tertiary)" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "var(--border-dim)" }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                required
                className="w-full h-11 pl-10 pr-4 rounded-xl text-[14px] input-maple focus-ring"
              />
            </div>

            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full h-11 pl-10 pr-11 rounded-xl text-[14px] input-maple focus-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-tertiary)" }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <div className="text-[13px] text-center py-2 rounded-lg" style={{
                color: "#f87171",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.15)",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-11 rounded-xl text-[14px] font-semibold text-white transition-all accent-bg accent-glow disabled:opacity-50"
              style={{ cursor: loading ? "wait" : "pointer" }}
            >
              {loading ? <Loader2 size={18} className="animate-spin mx-auto" /> : "Sign In"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-[14px]" style={{ color: "var(--text-secondary)" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium transition-colors" style={{ color: "var(--teal-light)" }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
