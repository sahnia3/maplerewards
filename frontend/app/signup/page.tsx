"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, UserIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getSessionId } from "@/lib/api";
import { track } from "@/lib/analytics";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { MapleWordmark } from "@/components/brand/maple-mark";
import { Button } from "@/components/ui/button";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Same-origin relative paths only — block ?redirect=https://evil.com open redirect.
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/";
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || !displayName) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setError("");
    setDuplicateEmail(false);
    setLoading(true);
    try {
      const sessionId = getSessionId() || undefined;
      await register(email, password, displayName, sessionId);
      track("signup_submitted");
      router.push(redirect);
    } catch (err: unknown) {
      // Map the backend's raw strings ("email already registered") and the
      // browser's network error ("Failed to fetch") to human copy.
      const raw = err instanceof Error ? err.message : "";
      if (/already registered/i.test(raw)) {
        setError("An account with this email already exists.");
        setDuplicateEmail(true);
      } else if (/failed to fetch/i.test(raw)) {
        setError("Couldn't reach the server. Check your connection and try again.");
      } else {
        setError(raw || "Registration failed");
      }
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
      <div style={{ width: "100%", maxWidth: 460 }}>
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
              Create account
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
              Start your <span style={{ fontStyle: "italic" }}>rewards desk</span>.
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
              Free forever for the basics. Pro is $39.99/yr (~$3.33/mo) when you're ready.
            </p>
          </header>

          {/* Google — hidden entirely when OAuth isn't configured */}
          {!!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
            <>
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
            </>
          )}

          {/* Registration form */}
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <Field icon={<UserIcon size={15} />}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Full name"
                aria-label="Full name"
                required
                autoComplete="name"
                style={fieldInputStyle}
              />
            </Field>

            <Field icon={<Mail size={15} />}>
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
            >
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 characters)"
                aria-label="Password"
                required
                minLength={8}
                autoComplete="new-password"
                style={fieldInputStyle}
              />
            </Field>

            {/* Always-mounted live region: screen readers announce the error
                via content change rather than a fresh mount. Empty string =>
                zero-height, no visible chrome (styling is gated on `error`). */}
            <div
              role="alert"
              aria-live="assertive"
              className="serif"
              style={
                error
                  ? {
                      fontSize: 13,
                      fontStyle: "italic",
                      color: "var(--loss)",
                      background: "var(--accent-soft)",
                      border: "1px solid var(--accent)",
                      borderRadius: 10,
                      padding: "10px 14px",
                      textAlign: "center",
                    }
                  : undefined
              }
            >
              {error}
              {duplicateEmail && (
                <>
                  {" "}
                  <Link
                    href={`/login?redirect=${encodeURIComponent(redirect)}`}
                    style={{
                      color: "var(--accent)",
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                      fontStyle: "normal",
                      fontWeight: 500,
                    }}
                  >
                    Sign in instead →
                  </Link>
                </>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!email || !password || !displayName}
              loading={loading}
              style={{ width: "100%" }}
            >
              {loading ? "Creating account" : "Create account"}
            </Button>
          </form>

          <p
            className="sans"
            style={{
              fontSize: 12,
              color: "var(--ink-2)",
              textAlign: "center",
              marginTop: 18,
              lineHeight: 1.5,
            }}
          >
            By creating an account you agree to our{" "}
            <Link href="/terms" style={{ color: "inherit", textDecoration: "underline" }}>
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" style={{ color: "inherit", textDecoration: "underline" }}>
              privacy policy
            </Link>
            .
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
          Already have an account?{" "}
          <Link
            href="/login"
            style={{
              color: "var(--accent)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              fontStyle: "normal",
              fontWeight: 500,
            }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ─── Editorial form primitives (mirrors login) ────────────────────────── */

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

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
