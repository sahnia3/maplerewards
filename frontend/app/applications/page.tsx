"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import {
  listApplications,
  recordApplication,
  deleteApplication,
  listCards,
  type CardApplication,
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
    setAdding(true);
    try {
      await recordApplication(sessionId, pickedCard, appliedAt, status, notes);
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
    await deleteApplication(sessionId, id);
    await refresh();
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Application tracker"
          eyebrowEnd="Pro · 7-day issuer memory"
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
                onChange={(e) => setPickedCard(e.target.value)}
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
            <button type="submit" disabled={adding || !pickedCard} style={submitStyle}>
              {adding ? "Saving…" : "Record application"}
            </button>
          </form>
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
