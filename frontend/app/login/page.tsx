"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { MapleWordmark } from "@/components/brand/maple-mark";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only allow same-origin relative paths — reject absolute/protocol-relative
  // URLs so ?redirect=https://evil.com can't turn the login into an open
  // redirect (phishing). Must start with a single "/" and not "//".
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/";
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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px clamp(20px, 4vw, 60px)",
        background: "var(--paper)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Wordmark */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <Link href="/" aria-label="MapleRewards home" style={{ textDecoration: "none" }}>
            <MapleWordmark size="md" />
          </Link>
        </div>

        {/* Card */}
        <div
          style={{
            background: "var(--card-fill-strong)",
            border: "1px solid var(--rule)",
            borderRadius: 16,
            padding: "32px clamp(20px, 4vw, 36px)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {/* Eyebrow + display title */}
          <header style={{ marginBottom: 28, textAlign: "center" }}>
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>
              Sign in
            </div>
            <h1
              className="display"
              style={{
                fontSize: 28,
                lineHeight: 1.1,
                color: "var(--ink)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Welcome <span style={{ fontStyle: "italic" }}>back</span>.
            </h1>
            <p
              className="serif"
              style={{
                fontStyle: "italic",
                fontSize: 14,
                color: "var(--ink-2)",
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              Pick up where you left off.
            </p>
          </header>

          {/* Google */}
          <GoogleSignInButton
            disabled={loading}
            onSuccess={() => router.push(redirect)}
            onError={(msg) => setError(msg)}
          />

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--ink-3)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              or with email
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
          </div>

          {/* Email + password */}
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <Field icon={<Mail size={15} />} kind="default">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                aria-label="Email address"
                required
                autoComplete="email"
                style={fieldInputStyle}
              />
            </Field>

            <Field
              icon={<Lock size={15} />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--ink-3)",
                    cursor: "pointer",
                    padding: "4px 6px",
                    display: "inline-flex",
                  }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
              kind="default"
            >
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                required
                autoComplete="current-password"
                style={fieldInputStyle}
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="serif"
                style={{
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--loss)",
                  background: "var(--accent-soft)",
                  border: "1px solid var(--accent)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  textAlign: "center",
                }}
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!email || !password}
              loading={loading}
              style={{ width: "100%" }}
            >
              {loading ? "Signing in" : "Sign in"}
            </Button>
          </form>

          <p
            className="sans"
            style={{
              fontSize: 13,
              color: "var(--ink-2)",
              textAlign: "center",
              marginTop: 18,
            }}
          >
            {/* Self-serve reset flow is a tracked follow-up; until it ships,
                route locked-out users to support rather than a dead 404. */}
            <a href="mailto:hello@maplerewards.app?subject=Password%20reset" style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>
              Forgot password?
            </a>
          </p>
        </div>

        {/* Footer */}
        <p
          className="serif"
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: 14,
            color: "var(--ink-2)",
            fontStyle: "italic",
          }}
        >
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            style={{
              color: "var(--accent)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              fontStyle: "normal",
              fontWeight: 500,
            }}
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ─── Editorial form primitives ─────────────────────────────────────────── */

const fieldInputStyle: React.CSSProperties = {
  flex: 1,
  height: 44,
  padding: "0 12px",
  background: "transparent",
  border: "none",
  outline: "none",
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  color: "var(--ink)",
  width: "100%",
};

function Field({
  icon,
  trailing,
  children,
}: {
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  kind?: "default";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: 10,
        padding: "0 12px",
        transition: "border-color 160ms",
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--rule)";
      }}
    >
      {icon && <span style={{ color: "var(--ink-3)", display: "inline-flex" }}>{icon}</span>}
      {children}
      {trailing}
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
