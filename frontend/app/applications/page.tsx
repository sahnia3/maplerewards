"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import {
  listApplications,
  recordApplication,
  deleteApplication,
  listCards,
  getCardEligibility,
  type CardApplication,
  type CardEligibility,
} from "@/lib/api";
import type { Card } from "@/lib/types";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/**
 * /applications — user-recorded card application history with issuer-cooldown
 * eligibility warnings (5/24-style, but for Canada). Warns before they apply
 * again within an issuer's typical cooldown window.
 */
export default function ApplicationsPage() {
  const { ensureSession } = useSession();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [apps, setApps] = useState<CardApplication[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Add form
  const [pickedCard, setPickedCard] = useState("");
  const [appliedAt, setAppliedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<"pending" | "approved" | "declined">("pending");
  const [notes, setNotes] = useState("");

  // "Safe to apply?" advisor — fetched whenever a card is picked, BEFORE the
  // user logs/applies (founder decision: make this page an eligibility
  // advisor, not a dumb log). Driven by the issuer-cooldown rules backend.
  const [elig, setElig] = useState<CardEligibility | null>(null);
  const [eligLoading, setEligLoading] = useState(false);

  // Post-record consequence: recording silently fed the cooldown engine, so
  // the user couldn't see the point. After logging we re-check eligibility and
  // surface exactly what the recorded application now does.
  const [recordedMsg, setRecordedMsg] = useState<{ tone: "warn" | "ok"; text: string } | null>(null);

  useEffect(() => {
    if (!sessionId || !pickedCard) { setElig(null); return; }
    let cancelled = false;
    setEligLoading(true);
    getCardEligibility(sessionId, pickedCard)
      .then((r) => { if (!cancelled) setElig(r); })
      .catch(() => { if (!cancelled) setElig(null); })
      .finally(() => { if (!cancelled) setEligLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, pickedCard]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const sid = await ensureSession();
      setSessionId(sid);
      const [a, c] = await Promise.all([listApplications(sid), listCards()]);
      setApps(a);
      setCards(c);
    } finally {
      setLoading(false);
    }
  }, [ensureSession]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !pickedCard || !appliedAt) return;
    const card = cards.find((c) => c.id === pickedCard);
    const justRecorded = pickedCard;
    setAdding(true);
    try {
      await recordApplication(sessionId, pickedCard, appliedAt, status, notes);
      // Re-check eligibility for the SAME card: it now reflects the
      // application we just logged. This is the visible payoff that was
      // missing — recording silently fed the cooldown engine before.
      let msg: { tone: "warn" | "ok"; text: string };
      try {
        const after = await getCardEligibility(sessionId, justRecorded);
        const issuer = card?.issuer ?? "this issuer";
        if (after.severity === "warn") {
          const until = after.eligible_at
            ? new Date(after.eligible_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : null;
          msg = {
            tone: "warn",
            text: `Logged. You're now inside ${issuer}'s cooldown — Maple will flag new ${issuer} cards as “wait”${until ? ` until ${until}` : ""}. That's the point of tracking this.`,
          };
        } else {
          msg = {
            tone: "ok",
            text: `Logged. ${issuer} has no documented cooldown rule, so this is kept for your history and churn timeline.`,
          };
        }
      } catch {
        msg = { tone: "ok", text: "Logged to your application history." };
      }
      setRecordedMsg(msg);
      setPickedCard("");
      setNotes("");
      setStatus("pending");
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!sessionId) return;
    try {
      await deleteApplication(sessionId, id);
      await refresh();
    } catch (e) {
      setRecordedMsg({ tone: "warn", text: e instanceof Error ? e.message : "Couldn't delete that application. Try again." });
    }
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Application tracker"
          eyebrowEnd="Pro · issuer cooldown tracker"
          title={<>Stop hitting the <span style={{ fontStyle: "italic" }}>cooldown</span> wall.</>}
          lede="Record every card application here and we'll warn before you apply again inside an issuer's typical cooldown window — RBC 90 days, TD 12 months, BMO 90 days, and so on."
        />

        <LeafDivider />

        <section style={{ marginBottom: 32 }}>
          <h2 className="display" style={{ fontSize: 22, marginBottom: 12 }}>Record an application</h2>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ gridColumn: "1 / -1" }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Card</div>
              <select
                value={pickedCard}
                onChange={(e) => { setPickedCard(e.target.value); setRecordedMsg(null); }}
                required
                style={inputStyle}
              >
                <option value="">Pick a card…</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.issuer})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Applied on</div>
              <input
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Status</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                style={inputStyle}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Notes (optional)</div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. used MR signup link, instant approval"
                style={inputStyle}
              />
            </label>
            {pickedCard && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  border: "1px solid var(--rule)",
                  borderLeft: `3px solid ${
                    elig?.severity === "ok"
                      ? "var(--gain)"
                      : elig?.severity === "warn"
                        ? "var(--accent)"
                        : "var(--ink-4, var(--ink-3))"
                  }`,
                  background: "var(--surface)",
                  borderRadius: 8,
                  padding: "12px 16px",
                }}
              >
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  Safe to apply?
                </div>
                {eligLoading ? (
                  <p style={{ margin: 0, color: "var(--ink-3)", fontStyle: "italic", fontSize: 14 }}>
                    Checking issuer cooldown…
                  </p>
                ) : elig ? (
                  <>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 600,
                        fontSize: 14,
                        color:
                          elig.severity === "ok"
                            ? "var(--gain)"
                            : elig.severity === "warn"
                              ? "var(--accent)"
                              : "var(--ink-2)",
                      }}
                    >
                      {elig.severity === "ok"
                        ? "✓ Clear to apply"
                        : elig.severity === "warn"
                          ? "⚠ Within cooldown — wait"
                          : "Proceed with caution"}
                    </p>
                    <p style={{ margin: "4px 0 0", color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.5 }}>
                      {elig.reason}
                    </p>
                    {elig.issuer_rule && (
                      <p style={{ margin: "4px 0 0", color: "var(--ink-3)", fontSize: 12 }}>
                        Rule: {elig.issuer_rule}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13.5 }}>
                    Couldn’t check eligibility right now — you can still log this application.
                  </p>
                )}
              </div>
            )}
            <button type="submit" disabled={adding || !pickedCard} style={submitStyle}>
              {adding ? "Saving…" : "Record application"}
            </button>
          </form>

          {recordedMsg && (
            <div
              role="status"
              style={{
                marginTop: 16,
                padding: "14px 16px",
                borderRadius: 10,
                border: `1px solid ${recordedMsg.tone === "warn" ? "var(--accent)" : "var(--gain)"}`,
                background:
                  recordedMsg.tone === "warn"
                    ? "color-mix(in srgb, var(--accent) 9%, transparent)"
                    : "color-mix(in srgb, var(--gain) 9%, transparent)",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--ink)", flex: 1 }}>
                {recordedMsg.tone === "warn" ? "⚠ " : "✓ "}
                {recordedMsg.text}
              </span>
              <button
                type="button"
                onClick={() => setRecordedMsg(null)}
                aria-label="Dismiss"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ink-3)",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 2,
                }}
              >
                ×
              </button>
            </div>
          )}
        </section>

        <LeafDivider />

        <section>
          <h2 className="display" style={{ fontSize: 22, marginBottom: 12 }}>History</h2>
          {loading && (
            <p className="eyebrow" style={{ color: "var(--ink-3)" }}>LOADING…</p>
          )}
          {!loading && apps.length === 0 && (
            <p style={{ color: "var(--ink-2)", fontStyle: "italic" }}>
              No applications on file yet. Add your first above to start tracking issuer cooldowns.
            </p>
          )}
          {!loading && apps.length > 0 && (
            <div style={{ display: "grid", gap: 12 }}>
              {apps.map((a) => (
                <article
                  key={a.id}
                  style={{
                    border: "1px solid var(--rule)",
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontSize: 18 }}>{a.card_name}</div>
                    <div className="eyebrow" style={{ color: "var(--ink-3)", marginTop: 4 }}>
                      {a.issuer} · {a.applied_at} · {a.status}
                    </div>
                    {a.notes && (
                      <p className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", marginTop: 6 }}>
                        {a.notes}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    className="mono"
                    style={{
                      padding: "6px 10px",
                      border: "1px solid var(--rule)",
                      borderRadius: 8,
                      background: "transparent",
                      color: "var(--ink-3)",
                      fontSize: 10,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <div style={{ marginTop: 32 }}>
          <Link href="/cards" style={{ color: "var(--accent)" }}>← Back to the catalog</Link>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--rule-strong)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 14,
  outline: "none",
};

const submitStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  padding: "12px 18px",
  minHeight: 44,
  borderRadius: 8,
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};
