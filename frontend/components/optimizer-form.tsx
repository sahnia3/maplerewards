"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { listCategories, optimize, logSpend } from "@/lib/api";
import { useSession } from "@/contexts/session-context";
import { useAuth } from "@/contexts/auth-context";
import { Term } from "@/components/term";
import type { Category, CardRecommendation } from "@/lib/types";
import { EditorialCardVisual } from "@/components/editorial/editorial-card";
import { cardImageUrl } from "@/lib/card-images";

/** Heuristic network detection from card name — Visa Infinite > Visa > Mastercard > Amex. */
function inferNetwork(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("amex") || n.includes("american express") || n.includes("platinum")) return "amex";
  if (n.includes("visa infinite") || n.includes("infinite privilege") || n.includes("avion")) return "visa infinite";
  if (n.includes("mastercard") || n.includes(" mc ") || n.endsWith(" mc")) return "mastercard";
  if (n.includes("visa")) return "visa";
  return "visa";
}
function inferIssuer(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("td ") || n.includes(" td ")) return "TD";
  if (n.includes("rbc") || n.includes("avion")) return "RBC";
  if (n.includes("scotia")) return "Scotia";
  if (n.includes("cibc") || n.includes("aventura") || n.includes("dividend")) return "CIBC";
  if (n.includes("bmo")) return "BMO";
  if (n.includes("amex") || n.includes("american express") || n.includes("cobalt") || n.includes("platinum")) return "Amex";
  if (n.includes("rogers") || n.includes("mastercard")) return "Rogers";
  if (n.includes("tangerine")) return "Tangerine";
  if (n.includes("simplii")) return "Simplii";
  return "";
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Editorial OptimizerForm.
 *
 * Layout per prototype optimizer.jsx:
 *   • Display-serif title above the form (set by parent page)
 *   • Category pills with soft tint + accent on active
 *   • Large mono-stamped amount input
 *   • Quick-amount chips ($25/50/100/250/500/1000)
 *   • Toggles: redemption segment, Costco (MC-only) merchant
 *   • Result row 1 — winner: large display number + serif insight + maple CTA
 *   • Result rows 2-N — runners-up: editorial table rows
 * ───────────────────────────────────────────────────────────────────────────── */

const QUICK_AMOUNTS = [25, 50, 100, 250, 500, 1000];

// Soft category tints (light editorial palette). Hue + tint carry the visual
// identity; per-category emoji markers were removed to stay consistent with
// the editorial system (which is emoji-free everywhere else).
const CAT_TINTS: Record<string, { hue: string; tint: string }> = {
  groceries:        { hue: "var(--chart-forest)",  tint: "rgba(36,116,90,0.12)"  },
  dining:           { hue: "var(--chart-copper)",  tint: "rgba(168,90,40,0.12)"  },
  travel:           { hue: "var(--chart-sky)",     tint: "rgba(56,107,152,0.12)" },
  "gas-transit":    { hue: "var(--chart-glacier)", tint: "rgba(95,126,147,0.12)" },
  pharmacy:         { hue: "var(--chart-plum)",    tint: "rgba(108,78,121,0.12)" },
  entertainment:    { hue: "var(--chart-gold)",    tint: "rgba(167,122,34,0.14)" },
  "streaming-digital": { hue: "var(--chart-teal)", tint: "rgba(46,115,121,0.12)" },
  "everything-else": { hue: "var(--ink-2)",        tint: "var(--card-fill)"      },
};
function tintFor(slug: string) {
  return CAT_TINTS[slug] ?? CAT_TINTS["everything-else"];
}

export function OptimizerForm() {
  const { ensureSession } = useSession();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySlug, setCategorySlug] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [segment, setSegment] = useState<"base" | "business">("base");
  const [merchant, setMerchant] = useState<"" | "costco_ca" | "costco_ca_online" | "loblaws">("");
  const [results, setResults] = useState<CardRecommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listCategories()
      .then((data) => {
        setCategories(data);
        if (data?.[0]?.slug && !categorySlug) setCategorySlug(data[0].slug);
      })
      .catch(() => setError("Could not load categories"))
      .finally(() => setCatLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rank() {
    setError(null);
    if (!categorySlug) {
      setError("Pick a category");
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setLoading(true);
    setLoggedIds(new Set());
    try {
      const sid = await ensureSession();
      const recs = await optimize({
        session_id: sid,
        category_slug: categorySlug,
        spend_amount: amt,
        redemption_segment: segment,
        ...(merchant ? { merchant } : {}),
      });
      setResults(recs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleLog(rec: CardRecommendation) {
    if (loggedIds.has(rec.card_id)) return;
    // Logging a spend writes to a wallet — anonymous visitors must create an
    // account first. Send them to signup (which merges their anon session).
    if (!isAuthenticated) {
      router.push("/signup?redirect=/optimizer");
      return;
    }
    try {
      const sid = await ensureSession();
      await logSpend(sid, {
        card_id: rec.card_id,
        category_slug: categorySlug,
        amount: parseFloat(amount),
      });
      setLoggedIds(prev => new Set(prev).add(rec.card_id));
      setToast(`Logged: ${rec.card_name}`);
      setTimeout(() => setToast(null), 3500);
    } catch {
      setToast("Failed to log spend");
      setTimeout(() => setToast(null), 3500);
    }
  }

  const t = tintFor(categorySlug);
  const best = results?.[0];
  const runners = results ? results.slice(1) : [];

  return (
    <div>
      {/* ── Form panel ───────────────────────────────────────────────── */}
      <div
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 16,
          background: "var(--card-fill-strong)",
          overflow: "hidden",
          boxShadow: "var(--shadow-1)",
        }}
      >
        {/* Amount stamp + ranked CTA */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "stretch",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <label
            style={{
              display: "block",
              padding: "26px 28px 22px",
              cursor: "text",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10 }}>Spend amount</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span
                className="display"
                style={{
                  fontSize: 42,
                  color: "var(--ink-3)",
                  lineHeight: 1,
                }}
              >
                $
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                aria-label="Spend amount in Canadian dollars"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && rank()}
                className="focus-ring"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  fontFamily: "var(--font-display)",
                  fontSize: 56,
                  letterSpacing: "-0.02em",
                  color: "var(--ink)",
                  padding: 0,
                  width: "100%",
                  minWidth: 0,
                }}
              />
              <span
                className="mono"
                style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}
              >
                CAD
              </span>
            </div>
          </label>
          <button
            type="button"
            onClick={rank}
            disabled={loading || !categorySlug || !amount}
            className="mono focus-ring"
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              padding: "0 36px",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: loading ? "default" : "pointer",
              transition: "background 200ms",
              opacity: loading || !categorySlug || !amount ? 0.5 : 1,
              minWidth: 180,
            }}
          >
            {loading ? "Ranking…" : "Rank cards →"}
          </button>
        </div>

        {/* Quick chips */}
        <div
          style={{
            padding: "12px 28px",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span
            className="sans"
            style={{
              fontSize: 12,
              color: "var(--ink-2)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 600,
              marginRight: 4,
            }}
          >
            Quick
          </span>
          {QUICK_AMOUNTS.map((v) => {
            const active = parseFloat(amount) === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="mono"
                style={{
                  cursor: "pointer",
                  border: `1px solid ${active ? t.hue : "var(--rule)"}`,
                  background: active ? t.hue : "transparent",
                  color: active ? "#fff" : "var(--ink-2)",
                  padding: "6px 13px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  transition: "all 160ms",
                }}
              >
                ${v}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setAmount("");
              setResults(null);
            }}
            className="mono"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              color: "var(--ink-3)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Reset ↻
          </button>
        </div>

        {/* Toggles row */}
        <div
          style={{
            padding: "12px 28px 16px",
            display: "flex",
            alignItems: "center",
            gap: 18,
            borderTop: "1px solid var(--rule)",
            flexWrap: "wrap",
          }}
        >
          {/* Redemption segment */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="eyebrow">Value:</span>
            <div style={{ display: "flex", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
              {(["base", "business"] as const).map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSegment(s)}
                  className="mono"
                  style={{
                    padding: "5px 11px",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    background: segment === s ? "var(--ink)" : "transparent",
                    color: segment === s ? "var(--paper)" : "var(--ink-3)",
                    border: "none",
                    borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
                    cursor: "pointer",
                  }}
                >
                  {s === "base" ? "Base" : "Sweet-spot"}
                </button>
              ))}
            </div>
          </div>

          {/* Merchant network constraint */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="eyebrow">Merchant:</span>
            <select
              value={merchant}
              onChange={(e) => setMerchant(e.target.value as typeof merchant)}
              className="mono"
              title="Some Canadian merchants only accept certain card networks — picking one filters the ranking to cards that actually work there."
              style={{
                padding: "5px 11px",
                fontSize: 11,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontWeight: 600,
                background: merchant ? "var(--accent)" : "transparent",
                color: merchant ? "#fff" : "var(--ink-3)",
                border: `1px solid ${merchant ? "var(--accent)" : "var(--rule)"}`,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <option value="">Any merchant</option>
              <option value="costco_ca">Costco (in-warehouse) · MC only</option>
              <option value="costco_ca_online">Costco.ca · Visa/MC</option>
              <option value="loblaws">Loblaws empire · no Amex</option>
            </select>
            <span
              className="serif"
              style={{
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--ink-2)",
                lineHeight: 1.4,
                maxWidth: 320,
              }}
            >
              {merchant === "costco_ca" && "Costco Canada in-warehouse takes Mastercard only — ranking is filtered to your MC cards."}
              {merchant === "costco_ca_online" && "Costco.ca online takes Visa + Mastercard (no Amex)."}
              {merchant === "loblaws" && "Loblaws / No Frills / Superstore / Shoppers / T&T don't accept Amex — Visa/MC only."}
              {!merchant && "Pick a merchant to respect its card-network blackout (Costco = MC-only, Loblaws = no Amex)."}
            </span>
          </div>
        </div>
      </div>

      {/* ── Category pills ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22, marginBottom: 26 }}>
        {catLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ width: 110, height: 36, borderRadius: 999 }} className="shimmer" />
            ))
          : categories.map((c) => {
              const active = categorySlug === c.slug;
              const ct = tintFor(c.slug);
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setCategorySlug(c.slug)}
                  style={{
                    padding: "10px 18px",
                    background: active ? ct.hue : ct.tint,
                    color: active ? "#fff" : ct.hue,
                    border: `1px solid ${active ? ct.hue : "transparent"}`,
                    borderRadius: 999,
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    fontWeight: active ? 600 : 500,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    transition: "all 200ms cubic-bezier(0.2,0.7,0.2,1)",
                    transform: active ? "translateY(-1px)" : "translateY(0)",
                    boxShadow: active ? `0 6px 16px -8px ${ct.hue}` : "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {c.name}
                </button>
              );
            })}
      </div>

      {error && (
        <div
          className="mono"
          style={{
            fontSize: 12,
            color: "var(--accent)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────── */}
      {results && results.length === 0 && (
        <div
          style={{
            padding: "48px 32px",
            textAlign: "center",
            border: "1px solid var(--rule)",
            borderRadius: 14,
            background: "var(--card-fill)",
          }}
        >
          <span className="eyebrow">No cards match</span>
          <h3 className="display" style={{ fontSize: 28, margin: "8px 0 6px" }}>
            Your wallet is empty.
          </h3>
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", marginBottom: 18, fontSize: 15 }}>
            Add cards before we can rank them for this purchase.
          </p>
          <Link href="/wallet" className="btn btn-primary mono" style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 11 }}>
            Build wallet →
          </Link>
        </div>
      )}

      {best && categorySlug === "groceries" && inferNetwork(best.card_name) === "amex" && (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: 14,
            padding: "16px 18px",
            border: "1px solid var(--accent)",
            background: "var(--accent-soft)",
            borderRadius: 12,
            marginBottom: 14,
          }}
          className="serif"
        >
          <span aria-hidden style={{ fontSize: 18, lineHeight: 1.2 }}>⚠</span>
          <div style={{ minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
              Heads up — Amex blackout
            </div>
            <div style={{ fontSize: 14, color: "var(--ink-2)", fontStyle: "italic", lineHeight: 1.45 }}>
              {best.card_name} doesn&rsquo;t work at Costco, Loblaws, No Frills, Superstore, Shoppers, T&amp;T, or any other store in the Loblaws empire — they&rsquo;re Mastercard/Visa only. Best for groceries at Metro, Sobeys, IGA, Whole Foods. Pair with a Tangerine or Costco MC for the rest.
            </div>
          </div>
        </div>
      )}
      {best && (
        <>
          {/* Winner card */}
          <div
            style={{
              border: `1px solid ${t.hue}`,
              borderRadius: 16,
              background: "var(--card-fill-strong)",
              padding: "26px 30px",
              boxShadow: `0 24px 40px -22px ${t.hue}, var(--shadow-1)`,
              position: "relative",
              overflow: "hidden",
              marginBottom: 14,
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: -50,
                right: -50,
                width: 240,
                height: 240,
                borderRadius: "50%",
                background: t.tint,
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                <span
                  className="sans"
                  style={{
                    fontSize: 12,
                    color: t.hue,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  ★ Best card
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.10em" }}
                >
                  Rank 1 / {results.length}
                </span>
              </div>
              <div
                className="optimizer-winner-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 24,
                  alignItems: "start",
                  marginBottom: 18,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h3
                    className="display"
                    style={{
                      fontSize: "clamp(28px, 3.5vw, 40px)",
                      letterSpacing: "-0.015em",
                      margin: 0,
                      lineHeight: 1.05,
                    }}
                  >
                    {best.card_name}
                  </h3>
                  <p
                    className="serif"
                    style={{
                      fontStyle: "italic",
                      color: "var(--ink-2)",
                      fontSize: 15,
                      marginTop: 6,
                      marginBottom: 0,
                      maxWidth: 520,
                      lineHeight: 1.4,
                    }}
                  >
                    {best.note ||
                      `You'd earn about $${best.dollar_value.toFixed(2)} back${amount ? ` on this $${amount}` : ""} via ${best.program_name} — ${best.earn_rate.toFixed(1)}× points (${best.effective_return.toFixed(2)}% effective).`}
                  </p>
                </div>
                <div className="optimizer-winner-card" style={{ flexShrink: 0 }}>
                  <EditorialCardVisual
                    size="md"
                    card={{
                      name: best.card_name,
                      issuer: inferIssuer(best.card_name),
                      network: inferNetwork(best.card_name),
                      imageUrl: cardImageUrl(best.card_name),
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 0,
                  border: "1px solid var(--rule)",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--card-fill)",
                  marginBottom: 18,
                }}
              >
                <Stat label="Cash value" value={`$${best.dollar_value.toFixed(2)}`} accent={t.hue} />
                <Stat label="Points earned" value={Math.round(best.points_earned).toLocaleString()} />
                <Stat label={<>Effective <Term k="redemption">return</Term></>} value={`${best.effective_return.toFixed(2)}%`} />
                <Stat label={<>Program <Term k="cpp">CPP</Term></>} value={`${best.program_cpp.toFixed(2)}¢`} last />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(() => {
                  const isLogged = loggedIds.has(best.card_id);
                  return (
                    <button
                      type="button"
                      onClick={() => handleLog(best)}
                      disabled={isLogged}
                      className="mono"
                      style={{
                        flex: 1,
                        padding: "14px 20px",
                        borderRadius: 12,
                        background: isLogged ? "var(--gain)" : "var(--ink)",
                        color: "var(--paper)",
                        border: "none",
                        cursor: isLogged ? "default" : "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        transition: "transform 160ms, background 200ms",
                      }}
                    >
                      {isLogged ? "✓ Logged" : "Log this purchase →"}
                    </button>
                  );
                })()}
                <Link
                  href={`/cards/${best.card_id}?from=optimizer`}
                  className="mono"
                  style={{
                    padding: "14px 20px",
                    borderRadius: 12,
                    background: "transparent",
                    color: "var(--ink-2)",
                    border: "1px solid var(--rule)",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                  }}
                >
                  Card detail
                </Link>
              </div>
            </div>
          </div>

          {/* Runners-up ledger */}
          {runners.length > 0 && (
            <div style={{ borderTop: "1px solid var(--ink)", marginTop: 22 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  padding: "16px 4px 14px",
                }}
              >
                <span className="eyebrow">Runners-up</span>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}
                >
                  {runners.length} more in wallet
                </span>
              </div>
              {runners.map((rec, i) => {
                const isLogged = loggedIds.has(rec.card_id);
                return (
                  /* Staggered reveal: 60ms gap between rows + ease-out-expo
                   * easing matches the rest of the system. Framer Motion
                   * automatically respects prefers-reduced-motion when the
                   * user has it set. */
                  <motion.div
                    key={rec.card_id}
                    className="optimizer-runner-row m-grid-1"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      ease: [0.16, 1, 0.3, 1],
                      delay: i * 0.06,
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "40px 1fr 90px 90px 100px 110px",
                      alignItems: "center",
                      gap: 14,
                      padding: "16px 4px",
                      borderTop: "1px solid var(--rule)",
                    }}
                  >
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.10em" }}>
                      {String(i + 2).padStart(2, "0")}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="display" style={{ fontSize: 18, lineHeight: 1.1, color: "var(--ink)" }}>
                        {rec.card_name}
                      </div>
                      <div className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                        {rec.program_name}
                        {rec.transfer_partner && <> · transfers via <span style={{ color: "var(--ink-2)" }}>{rec.transfer_partner}</span></>}
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.04em", textAlign: "right" }}>
                      {rec.earn_rate.toFixed(1)}×
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "right" }}>
                      {rec.effective_return.toFixed(2)}%
                    </div>
                    <div className="display" style={{ fontSize: 22, color: "var(--ink)", textAlign: "right", fontStyle: "italic" }}>
                      ${rec.dollar_value.toFixed(2)}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLog(rec)}
                      disabled={isLogged}
                      className="mono"
                      title={isLogged ? "Already logged" : `Log $${parseFloat(amount).toFixed(2)} on ${rec.card_name}`}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: isLogged ? "var(--gain)" : "transparent",
                        color: isLogged ? "#fff" : "var(--ink-2)",
                        border: `1px solid ${isLogged ? "var(--gain)" : "var(--rule-strong)"}`,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        cursor: isLogged ? "default" : "pointer",
                        transition: "background 160ms, color 160ms, border-color 160ms",
                      }}
                    >
                      {isLogged ? "✓ Logged" : "Log →"}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="mono"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: "var(--ink)",
            color: "var(--paper)",
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            boxShadow: "var(--shadow-2)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, last = false }: { label: ReactNode; value: string; accent?: string; last?: boolean }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRight: last ? "none" : "1px solid var(--rule)",
        minWidth: 0,
      }}
    >
      <div className="eyebrow" style={{ letterSpacing: "0.14em", marginBottom: 4 }}>
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 16, color: accent ?? "var(--ink)", letterSpacing: "0.02em", fontWeight: 600 }}
      >
        {value}
      </div>
    </div>
  );
}
