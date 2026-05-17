"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  LogOut,
  Trash2,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useWallet } from "@/contexts/wallet-context";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";
import { ApiError, createPortalSession } from "@/lib/api";

// Shared style for the full-width billing action button (matches the
// Sign-out button treatment elsewhere on this page).
function billingBtnStyle(loading: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "14px 18px",
    borderRadius: 10,
    background: "transparent",
    border: "1px solid var(--rule-strong)",
    color: "var(--ink-2)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    cursor: loading ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    opacity: loading ? 0.6 : 1,
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isPro, plan, isAuthenticated, isLoading, logout, updateProfile } = useAuth();
  const { wallet, totalPoints } = useWallet();

  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    router.push("/login?redirect=/profile");
    return null;
  }

  async function handleSave() {
    if (!displayName.trim()) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateProfile(displayName.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      /* swallow */
    } finally {
      setSaving(false);
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err) {
      // request() now throws ApiError with a human .message + machine .code.
      const code = err instanceof ApiError ? err.code : undefined;
      const msg =
        code === "NO_BILLING_ACCOUNT"
          ? "No Stripe subscription is linked to this account, so there's nothing to manage here yet. If you subscribed, complete checkout again so billing links up."
          : err instanceof Error
          ? err.message
          : "Could not open the billing portal";
      setPortalError(msg);
      setPortalLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    try {
      const { deleteAccount } = await import("@/lib/api");
      await deleteAccount();
      await logout();
      router.push("/login");
    } catch { /* swallow */ }
  }

  const initials = (user.display_name || user.email || "U")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const planText =
    plan === "lifetime"
      ? "Lifetime"
      : plan === "pro_plus"
      ? "Pro Plus"
      : plan === "pro"
      ? "Pro"
      : isPro
      ? "Pro"
      : "Free";

  /* ── editorial primitives ─────────────────────────────────────────── */
  const fieldStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    padding: "0 14px",
    background: "var(--surface)",
    border: "1px solid var(--rule)",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "var(--font-mono)",
    color: "var(--ink)",
    outline: "none",
  };
  const ctaStyle: React.CSSProperties = {
    height: 44,
    padding: "0 22px",
    borderRadius: 8,
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    cursor: "pointer",
  };

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px clamp(20px, 3vw, 40px) 80px" }}>
        <PageMasthead
          eyebrow="Account"
          eyebrowEnd={isPro ? "Pro" : "Free"}
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>working</span> account.
            </>
          }
          lede={`Member since ${memberSince}. ${wallet.length} card${wallet.length === 1 ? "" : "s"}, ${totalPoints.toLocaleString()} points across the wallet.`}
        />

        {/* Identity row — initials medallion + name + email */}
        <section
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "20px 0 24px",
            borderBottom: "1px solid var(--rule)",
            marginBottom: 26,
          }}
        >
          <div
            className="display"
            style={{
              width: 72,
              height: 72,
              borderRadius: 14,
              background: "var(--card-fill-strong)",
              border: "1px solid var(--rule)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontStyle: "italic",
              color: "var(--accent)",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 className="display" style={{ fontSize: 28, margin: 0, lineHeight: 1.05 }}>
              {user.display_name || user.email || "User"}
            </h2>
            <p className="serif" style={{ marginTop: 4, fontSize: 14, fontStyle: "italic", color: "var(--ink-3)" }}>
              {user.email}
            </p>
            {isPro && (
              <span
                className="mono"
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                ★ {planText}
              </span>
            )}
          </div>
        </section>

        {/* Display name — editorial paper card */}
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Display name</div>
          <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !displayName.trim()}
              style={{ ...ctaStyle, opacity: saving || !displayName.trim() ? 0.55 : 1 }}
            >
              {saving ? "Saving…" : "Save →"}
            </button>
          </div>
          {saveSuccess && (
            <p className="mono" style={{ marginTop: 8, fontSize: 11, color: "var(--gain)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              ✓ Profile updated
            </p>
          )}
        </section>

        {/* Account ledger — ruled rows */}
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Account information</div>
          <div style={{ borderTop: "1px solid var(--ink)" }}>
            {[
              ["Email", user.email || "—"],
              ["Auth provider", (user.auth_provider || "email").toString()],
              ["Member since", memberSince],
              ["Plan", planText],
              ["Cards in wallet", String(wallet.length)],
              ["Total points", totalPoints.toLocaleString()],
            ].map(([k, v]) => (
              <div
                key={k as string}
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 1fr",
                  alignItems: "baseline",
                  padding: "14px 4px",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <span className="eyebrow">{k}</span>
                <span className="mono" style={{ fontSize: 14, color: "var(--ink)", letterSpacing: "0.02em" }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Billing. Lifetime has no subscription to cancel — say so plainly
            instead of dropping the user into an empty Stripe portal.
            Subscription tiers get a clear "manage" button plus a cancel
            link that's one click away (Stripe ToS + click-to-cancel law). */}
        {isPro && (
          <section style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Billing</div>
            {portalError && (
              <p
                className="mono"
                style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em", marginBottom: 10, lineHeight: 1.5 }}
              >
                {portalError}
              </p>
            )}

            {planText === "Lifetime" ? (
              <>
                <p
                  className="serif"
                  style={{ fontSize: 14, color: "var(--ink-2)", fontStyle: "italic", lineHeight: 1.5, marginBottom: 12 }}
                >
                  You own MapleRewards <strong style={{ color: "var(--ink)" }}>for life</strong>.
                  It was a one-time purchase — there&rsquo;s no subscription to cancel and
                  nothing to renew. You&rsquo;re set, forever.
                </p>
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="mono"
                  style={billingBtnStyle(portalLoading)}
                >
                  {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  {portalLoading ? "Opening…" : "View receipt & invoices"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="mono"
                  style={billingBtnStyle(portalLoading)}
                >
                  {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  {portalLoading ? "Opening…" : "Manage billing & payment method"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/cancel")}
                  className="mono"
                  style={{
                    marginTop: 10,
                    background: "none",
                    border: "none",
                    color: "var(--ink-3)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Cancel subscription
                </button>
              </>
            )}
          </section>
        )}

        {/* Plan — only shown when Free */}
        {!isPro && (
          <section
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 14,
              background: "var(--card-fill-strong)",
              padding: "22px 24px",
              marginBottom: 26,
              display: "flex",
              gap: 18,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Pro upgrade</span>
              <h3 className="display" style={{ fontSize: 24, margin: "8px 0 4px", fontStyle: "italic" }}>
                Unlock the full toolkit.
              </h3>
              <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, margin: 0, lineHeight: 1.45 }}>
                Award watcher, devaluation alarms, missed-rewards forensics, unlimited optimizer history.
              </p>
            </div>
            <Link
              href="/pricing"
              className="mono"
              style={{
                padding: "12px 22px",
                borderRadius: 8,
                background: "var(--accent)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              See pricing →
            </Link>
          </section>
        )}

        <LeafDivider />

        {/* Sign-out */}
        <section style={{ marginBottom: 18 }}>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
            className="mono"
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: 10,
              background: "transparent",
              border: "1px solid var(--rule-strong)",
              color: "var(--ink-2)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </section>

        {/* Danger zone — maple-red rule */}
        <section
          style={{
            borderTop: "2px solid var(--accent)",
            paddingTop: 22,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>Danger zone</span>
            <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
          </div>
          <h3 className="display" style={{ fontSize: 22, margin: "0 0 6px", fontStyle: "italic" }}>
            Delete account.
          </h3>
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.45, marginBottom: 14 }}>
            Permanent. All wallet, spend, and watch data is removed. There is no recovery path — this is the editorial nuclear option.
          </p>
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="mono"
            style={{
              padding: "12px 18px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid var(--accent)",
              color: "var(--accent)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Trash2 size={13} />
            Delete account
          </button>
        </section>
      </div>

      {/* Delete confirm — paper-on-paper modal */}
      {deleteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(11,17,24,0.55)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--surface)",
              border: "1px solid var(--ink)",
              borderRadius: 14,
              padding: "24px 26px",
              boxShadow: "var(--shadow-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <h3 className="display" style={{ fontSize: 22, margin: 0, fontStyle: "italic" }}>
                Confirm delete.
              </h3>
            </div>
            <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>
              Permanent. Cards, spend log, and settings are removed.
            </p>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", marginBottom: 8 }}>
              Type <span style={{ color: "var(--accent)", fontWeight: 600 }}>DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              style={{ ...fieldStyle, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirm(""); }}
                className="mono"
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 8,
                  background: "transparent",
                  border: "1px solid var(--rule-strong)",
                  color: "var(--ink-2)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "DELETE"}
                className="mono"
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 8,
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  cursor: deleteConfirm === "DELETE" ? "pointer" : "not-allowed",
                  opacity: deleteConfirm === "DELETE" ? 1 : 0.4,
                }}
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
