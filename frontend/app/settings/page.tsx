"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Download, Loader2, CreditCard, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { useAuth } from "@/contexts/auth-context";
import { useSession } from "@/contexts/session-context";
import { changePassword, exportSpendCSV, createPortalSession } from "@/lib/api";

/* Editorial settings page — only what actually works.
 *
 * Theme       — wired to next-themes, persists.
 * Reduce-motion — sets a data attribute on <html>, persists in localStorage.
 *
 * Removed: density, notifications, locale, data-export — these were filler with
 * no working backend. They will be added back when their backends ship.
 */

function loadBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}
function saveBool(key: string, value: boolean) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, String(value));
}

function planLabel(plan: string, isPro: boolean): string {
  switch (plan) {
    case "lifetime":
      return "Lifetime";
    case "pro_plus":
      return "Pro Plus";
    case "pro":
      return "Pro";
    default:
      return isPro ? "Pro" : "Free";
  }
}

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const currentTheme = (resolvedTheme as "light" | "dark") ?? "light";
  const { user, isAuthenticated, isPro, plan } = useAuth();
  const { sessionId } = useSession();

  const [reduceMotion, setReduceMotion] = useState(false);

  // Password change state — all controlled, no useReducer noise since the
  // shape is small and the form clears on success anyway.
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    setReduceMotion(loadBool("mr.motion.reduce", false));
  }, []);

  function applyMotion(reduce: boolean) {
    setReduceMotion(reduce);
    saveBool("mr.motion.reduce", reduce);
    document.documentElement.setAttribute("data-reduce-motion", reduce ? "true" : "false");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPwd || !newPwd) return;
    setPwdLoading(true);
    setPwdMessage(null);
    try {
      await changePassword(currentPwd, newPwd);
      setPwdMessage({ kind: "ok", text: "Password updated. Other devices will need to sign in again." });
      setCurrentPwd("");
      setNewPwd("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update password";
      setPwdMessage({ kind: "err", text: msg });
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleExportSpend() {
    if (!sessionId) return;
    setExportLoading(true);
    setExportError(null);
    try {
      const blob = await exportSpendCSV(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maplerewards_spend_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err) {
      setPortalError(
        err instanceof Error ? err.message : "Could not open the billing portal"
      );
      setPortalLoading(false);
    }
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px clamp(20px, 3vw, 40px) 80px" }}>
        <PageMasthead
          eyebrow="Settings"
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>workspace</span> you keep.
            </>
          }
          lede="Account preferences live on the profile page. This is for things that change how the app looks and feels."
        />

        <Section eyebrow="Appearance" title="Set the substrate.">
          <Row label="Theme" hint="Editorial paper or maple-stained dark.">
            <ToggleGroup>
              <ToggleButton active={currentTheme === "light" && theme !== "system"} onClick={() => setTheme("light")}>
                <Sun size={13} /> Light
              </ToggleButton>
              <ToggleButton active={currentTheme === "dark" && theme !== "system"} onClick={() => setTheme("dark")}>
                <Moon size={13} /> Dark
              </ToggleButton>
              <ToggleButton active={theme === "system"} onClick={() => setTheme("system")}>
                System
              </ToggleButton>
            </ToggleGroup>
          </Row>
          <Row label="Reduce motion" hint="Disable hover lifts, transitions, and reveal animations.">
            <Switch on={reduceMotion} onChange={applyMotion} />
          </Row>
        </Section>

        {/* Password change — only meaningful for password-auth accounts.
            Google-only users see a helper hint instead of an empty form. */}
        {isAuthenticated && (
          <Section eyebrow="Security" title="Change your password.">
            {user?.auth_provider === "google" ? (
              <p
                className="serif"
                style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, padding: "16px 4px", marginTop: 0, lineHeight: 1.5 }}
              >
                Your account signs in with Google. Manage the password through your Google account
                instead of here.
              </p>
            ) : (
              <form onSubmit={handleChangePassword} style={{ display: "grid", gap: 12, padding: "16px 4px" }}>
                <label className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)" }}>
                  Current password
                  <input
                    type="password"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    autoComplete="current-password"
                    style={inputStyle}
                    required
                  />
                </label>
                <label className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)" }}>
                  New password (min 8 characters)
                  <input
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    style={inputStyle}
                    required
                  />
                </label>
                {pwdMessage && (
                  <div
                    role={pwdMessage.kind === "err" ? "alert" : "status"}
                    className="serif"
                    style={{
                      fontSize: 13,
                      fontStyle: "italic",
                      color: pwdMessage.kind === "err" ? "var(--loss)" : "var(--gain)",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "var(--surface)",
                      border: `1px solid ${pwdMessage.kind === "err" ? "var(--loss)" : "var(--gain)"}`,
                    }}
                  >
                    {pwdMessage.text}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={pwdLoading || !currentPwd || !newPwd}
                  className="mono"
                  style={{
                    alignSelf: "flex-start",
                    padding: "10px 20px",
                    background: pwdLoading || !currentPwd || !newPwd ? "var(--rule-strong)" : "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    cursor: pwdLoading || !currentPwd || !newPwd ? "not-allowed" : "pointer",
                  }}
                >
                  {pwdLoading ? "Updating…" : "Update password"}
                </button>
              </form>
            )}
          </Section>
        )}

        {/* Billing — Stripe Customer Portal. Makes the "cancel anytime"
            promise real and is the safety valve for the 3-day trial. */}
        {isAuthenticated && (
          <Section eyebrow="Billing" title="Manage your plan.">
            <div style={{ padding: "16px 4px" }}>
              <p
                className="serif"
                style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 14, lineHeight: 1.5 }}
              >
                You&apos;re on the{" "}
                <strong style={{ color: "var(--ink)", fontStyle: "normal" }}>
                  {planLabel(plan, isPro)}
                </strong>{" "}
                plan.
                {isPro
                  ? plan === "lifetime"
                    ? " Lifetime is a one-time purchase — there's nothing to cancel. Open the portal to update your card or download invoices."
                    : " Cancel or change your plan, update your card, and view invoices in the Stripe portal. Cancelling keeps Pro active until the end of the period you've already paid for."
                  : " Upgrade to unlock missed-rewards forensics, the Aeroplan SQC projector, and unlimited AI."}
              </p>

              {portalError && (
                <div
                  role="alert"
                  className="serif"
                  style={{
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--loss)",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "var(--surface)",
                    border: "1px solid var(--loss)",
                    marginBottom: 12,
                  }}
                >
                  {portalError}
                </div>
              )}

              {isPro ? (
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    background: portalLoading ? "var(--rule-strong)" : "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    cursor: portalLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {portalLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CreditCard size={13} />
                  )}
                  {portalLoading ? "Opening…" : "Manage billing"}
                </button>
              ) : (
                <Link
                  href="/pricing"
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    background: "var(--accent)",
                    color: "#fff",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                  }}
                >
                  <ExternalLink size={13} /> See Pro plans
                </Link>
              )}
            </div>
          </Section>
        )}

        {/* Data export — PIPEDA portability. Available to all accounts that
            have a session (anonymous wallets included). */}
        {sessionId && (
          <Section eyebrow="Your data" title="Export your spend ledger.">
            <div style={{ padding: "16px 4px" }}>
              <p
                className="serif"
                style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginBottom: 14, lineHeight: 1.5 }}
              >
                Download every transaction you&apos;ve logged with us as a CSV. Includes date, card,
                category, amount, points earned, and dollar value.
              </p>
              {exportError && (
                <div
                  role="alert"
                  className="serif"
                  style={{
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--loss)",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "var(--surface)",
                    border: "1px solid var(--loss)",
                    marginBottom: 12,
                  }}
                >
                  {exportError}
                </div>
              )}
              <button
                type="button"
                onClick={handleExportSpend}
                disabled={exportLoading}
                className="mono"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  background: "var(--ink)",
                  color: "var(--paper)",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  cursor: exportLoading ? "wait" : "pointer",
                }}
              >
                {exportLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                {exportLoading ? "Preparing…" : "Download CSV"}
              </button>
            </div>
          </Section>
        )}

        <p
          className="serif"
          style={{
            marginTop: 28,
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          Looking for account info, sign-out, or delete-account? Those live on the{" "}
          <Link href="/profile" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            profile page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  height: 40,
  padding: "0 12px",
  background: "var(--surface)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  outline: "none",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  color: "var(--ink)",
};

/* ── Subcomponents ─────────────────────────────────────────────── */

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <header style={{ marginBottom: 14 }}>
        <span className="eyebrow" style={{ color: "var(--accent)" }}>{eyebrow}</span>
        <h2 className="display" style={{ fontSize: 26, margin: "6px 0 0", lineHeight: 1.1, fontStyle: "italic" }}>
          {title}
        </h2>
      </header>
      <div style={{ borderTop: "1px solid var(--ink)" }}>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 16,
        alignItems: "center",
        padding: "16px 4px",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div>
        <div className="display" style={{ fontSize: 16, lineHeight: 1.2, color: "var(--ink)" }}>{label}</div>
        {hint && (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)", fontSize: 13, marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function ToggleGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono"
      style={{
        padding: "8px 14px",
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink-2)",
        border: "none",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "background 160ms",
      }}
    >
      {children}
    </button>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        position: "relative",
        width: 42,
        height: 24,
        borderRadius: 999,
        border: "none",
        background: on ? "var(--accent)" : "var(--rule-strong)",
        cursor: "pointer",
        transition: "background 160ms",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 160ms",
        }}
      />
    </button>
  );
}
