"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import {
  listBuyPromos, evaluateBuyPoints,
  listDevaluations,
  listMerchants, recommendStack,
  getIndiaArbitrage,
  listAwardWatches, createAwardWatch, deleteAwardWatch,
} from "@/lib/api";
import type {
  BuyPromo, BuyPointsVerdict,
  DevaluationEvent,
  Merchant, StackRecommendation,
  IndiaArbitrageProperty,
  AwardWatch,
} from "@/lib/types";
import { Trash2, Plus } from "lucide-react";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/* ─────────────────────────────────────────────────────────────────────────────
 * Pro Tools — editorial treatment
 *
 * Each tool gets a section: kicker line + display title + italic lede +
 * paper-surface tile with mono inputs, maple-red CTAs, and ruled progress.
 * ───────────────────────────────────────────────────────────────────────────── */

function fmtCAD(v: number) {
  return `$${v.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const PROGRAM_LABELS: Record<string, string> = {
  aeroplan: "Aeroplan",
  marriott: "Marriott Bonvoy",
  hilton: "Hilton Honors",
  hyatt: "World of Hyatt",
  ihg: "IHG One Rewards",
  "amex-mr-canada": "Amex MR Canada",
  "rbc-avion": "RBC Avion",
  "scene-plus": "Scene+",
  "hdfc-rewards": "HDFC Reward Points",
  "axis-edge-miles": "Axis EDGE Miles",
  "hilton-honors": "Hilton Honors",
  "marriott-bonvoy": "Marriott Bonvoy",
};
function progLabel(slug: string) { return PROGRAM_LABELS[slug] ?? slug; }

export default function ProToolsPage() {
  const { sessionId, isReady, ensureSession } = useSession();

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Pro tools"
          eyebrowEnd="Canada-first · CAD"
          title={<>The <span style={{ fontStyle: "italic", color: "var(--accent)" }}>power-user</span> toolkit.</>}
          lede="Buy-points break-even, triple-stack calculator, devaluation alarms, award watcher, India-outbound arbitrage — built on your wallet data."
        />

        <BuyPointsTile />
        <LeafDivider />
        <StackTile sessionId={sessionId} ensureSession={ensureSession} />
        <LeafDivider />
        <DevaluationTile sessionId={sessionId} isReady={isReady} />
        <LeafDivider />
        <AwardWatchTile sessionId={sessionId} ensureSession={ensureSession} />
        <LeafDivider />
        <IndiaArbTile sessionId={sessionId} isReady={isReady} />
      </div>
    </div>
  );
}

/* ─── Editorial primitives ──────────────────────────────────────────────── */

/** Single-stroke line-art motif rendered next to the section title. */
function ToolMotif({ kind }: { kind: "gauge" | "stack" | "alarm" | "plane" | "mountain" }) {
  const stroke = "var(--ink-3)";
  const sw = 1.2;
  if (kind === "gauge") {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
        <path d="M 6 26 A 12 12 0 1 1 30 26" strokeLinecap="round" />
        <line x1="18" y1="26" x2="24" y2="14" stroke="var(--accent)" strokeLinecap="round" />
        <circle cx="18" cy="26" r="1.6" fill="var(--accent)" stroke="none" />
        <line x1="9" y1="26" x2="11" y2="26" strokeLinecap="round" />
        <line x1="25" y1="26" x2="27" y2="26" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "stack") {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
        <rect x="6" y="14" width="22" height="10" rx="2" />
        <rect x="9" y="10" width="22" height="10" rx="2" />
        <rect x="12" y="6" width="18" height="10" rx="2" stroke="var(--accent)" />
      </svg>
    );
  }
  if (kind === "alarm") {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
        <path d="M 9 22 L 9 16 A 9 9 0 0 1 27 16 L 27 22 L 30 26 L 6 26 Z" strokeLinejoin="round" />
        <path d="M 14 28 A 4 4 0 0 0 22 28" strokeLinecap="round" />
        <line x1="18" y1="9" x2="18" y2="6" strokeLinecap="round" stroke="var(--accent)" />
      </svg>
    );
  }
  if (kind === "plane") {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
        <path d="M 6 18 L 30 18" strokeLinecap="round" />
        <path d="M 16 12 L 22 6 L 24 6 L 19 13" stroke="var(--accent)" strokeLinejoin="round" />
        <path d="M 12 18 L 6 14 L 4 16 L 9 19" strokeLinejoin="round" />
        <path d="M 12 18 L 6 22 L 4 20 L 9 17" strokeLinejoin="round" />
        <path d="M 16 24 L 22 30 L 24 30 L 19 23" strokeLinejoin="round" />
        <circle cx="28" cy="18" r="1.6" fill="var(--accent)" stroke="none" />
      </svg>
    );
  }
  /* mountain */
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
      <path d="M 4 28 L 14 12 L 20 22 L 24 16 L 32 28 Z" strokeLinejoin="round" />
      <line x1="14" y1="12" x2="16" y2="14" stroke="var(--accent)" strokeLinecap="round" />
      <circle cx="26" cy="8" r="2" stroke="var(--accent)" />
    </svg>
  );
}

function ToolHeader({
  kicker,
  title,
  lede,
  motif,
}: {
  kicker: string;
  title: React.ReactNode;
  lede: string;
  motif: "gauge" | "stack" | "alarm" | "plane" | "mountain";
}) {
  return (
    <header style={{ marginBottom: 18, display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0, paddingTop: 4 }}>
        <ToolMotif kind={motif} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
          <span className="eyebrow" style={{ color: "var(--accent)" }}>{kicker}</span>
          <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
        </div>
        <h2
          className="display"
          style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
        <p
          className="serif"
          style={{ marginTop: 8, fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", maxWidth: 640, lineHeight: 1.45 }}
        >
          {lede}
        </p>
      </div>
    </header>
  );
}

function PaperTile({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${accent ? "var(--accent)" : "var(--rule)"}`,
        background: "var(--card-fill-strong)",
        borderRadius: 14,
        padding: "20px 22px",
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
      }}
    >
      {/* Subtle radial accent — top-right, never bright enough to flood */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 45% at 100% 0%, var(--accent-soft), transparent 65%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow" style={{ marginBottom: 6 }}>{children}</div>;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  background: "var(--surface)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "var(--font-mono)",
  color: "var(--ink)",
  outline: "none",
  transition: "border-color 160ms",
};

const ctaStyle: React.CSSProperties = {
  height: 42,
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
  transition: "background 160ms, transform 160ms",
};

function VerdictPill({ verdict }: { verdict: string }) {
  const v = verdict.toUpperCase().replace(/_/g, " ");
  const tone = verdict === "buy" ? "var(--gain)" : verdict === "earn" ? "var(--accent)" : "var(--ink-2)";
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 12px",
        border: `1px solid ${tone}`,
        color: tone,
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: 600,
        borderRadius: 999,
      }}
    >
      {v}
    </span>
  );
}

/* ─── Buy-points break-even ─────────────────────────────────────────────── */
function BuyPointsTile() {
  const [promos, setPromos] = useState<BuyPromo[]>([]);
  const [program, setProgram] = useState("aeroplan");
  const [points, setPoints] = useState("60000");
  const [cash, setCash] = useState("1500");
  const [verdict, setVerdict] = useState<BuyPointsVerdict | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listBuyPromos().then(setPromos).catch(()=>{}); }, []);

  async function evalIt() {
    setLoading(true);
    try {
      const v = await evaluateBuyPoints({
        program_slug: program,
        points_needed: parseInt(points) || 0,
        cash_alternative_cad: parseFloat(cash) || 0,
      });
      setVerdict(v);
    } finally { setLoading(false); }
  }

  return (
    <section style={{ marginBottom: 22 }}>
      <ToolHeader
        motif="gauge"
        kicker="Buy-points break-even"
        title={<>Should you <span style={{ fontStyle: "italic" }}>buy</span> or earn?</>}
        lede="Live promo pricing across five programs. Break-even maths against the cash alternative — no spreadsheet required."
      />
      <PaperTile>
        <div className="protool-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <FieldLabel>Program</FieldLabel>
            <select value={program} onChange={(e) => setProgram(e.target.value)} style={fieldStyle}>
              {promos.map(p => <option key={p.program_slug} value={p.program_slug}>{progLabel(p.program_slug)}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Points needed</FieldLabel>
            <input type="number" value={points} onChange={e => setPoints(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Cash alternative (CAD)</FieldLabel>
            <input type="number" value={cash} onChange={e => setCash(e.target.value)} style={fieldStyle} />
          </div>
          <button onClick={evalIt} disabled={loading} style={{ ...ctaStyle, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Evaluating…" : "Evaluate →"}
          </button>
        </div>

        {verdict && (
          <div
            style={{
              marginTop: 18,
              borderTop: "1px solid var(--rule)",
              paddingTop: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="eyebrow">Verdict</span>
              <VerdictPill verdict={verdict.verdict} />
            </div>
            <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.5, marginBottom: 14 }}>
              {verdict.rationale}
            </p>
            <div
              className="protool-stat-row"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                border: "1px solid var(--rule)",
                borderRadius: 10,
                overflow: "hidden",
                background: "var(--card-fill)",
              }}
            >
              <Stat label="Buy cost" value={fmtCAD(verdict.buy_cost_cad)} />
              <Stat label="Promo CPP" value={`${verdict.current_promo_cents_per_point.toFixed(2)}¢`} />
              <Stat label="Break-even" value={`${verdict.break_even_cents_per_point.toFixed(2)}¢`} last />
            </div>
            {verdict.promo_label && (
              <p className="mono" style={{ fontSize: 11, marginTop: 10, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                {verdict.promo_label}
                {verdict.source_url && <> · <a href={verdict.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>source</a></>}
              </p>
            )}
          </div>
        )}
      </PaperTile>
    </section>
  );
}

function Stat({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ padding: "12px 14px", borderRight: last ? "none" : "1px solid var(--rule)" }}>
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, color: "var(--ink)", fontWeight: 600, letterSpacing: "0.02em" }}>{value}</div>
    </div>
  );
}

/* ─── Triple-stack ──────────────────────────────────────────────────────── */
function StackTile({ sessionId, ensureSession }: { sessionId: string | null; ensureSession: () => Promise<string> }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantSlug, setMerchantSlug] = useState("");
  const [spend, setSpend] = useState("200");
  const [rec, setRec] = useState<StackRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listMerchants().then(m => { setMerchants(m); if (m[0]) setMerchantSlug(m[0].slug); }).catch(()=>{}); }, []);

  async function recommend() {
    setLoading(true);
    try {
      const sid = await ensureSession();
      const r = await recommendStack({ session_id: sid, merchant_slug: merchantSlug, spend_amount: parseFloat(spend) || 0 });
      setRec(r);
    } finally { setLoading(false); }
  }

  return (
    <section style={{ marginBottom: 22 }}>
      <ToolHeader
        motif="stack"
        kicker="Triple-stack calculator"
        title={<>Best <span style={{ fontStyle: "italic" }}>portal × card × offer</span>.</>}
        lede="Layer cashback portals over multipliers over network offers — the optimizer handles the order so nothing leaves money on the table."
      />
      <PaperTile>
        <div className="protool-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <FieldLabel>Merchant</FieldLabel>
            <select value={merchantSlug} onChange={e => setMerchantSlug(e.target.value)} style={fieldStyle}>
              {merchants.map(m => <option key={m.slug} value={m.slug}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Spend (CAD)</FieldLabel>
            <input type="number" value={spend} onChange={e => setSpend(e.target.value)} style={fieldStyle} />
          </div>
          <button onClick={recommend} disabled={loading || !sessionId} style={{ ...ctaStyle, opacity: loading || !sessionId ? 0.6 : 1 }}>
            {loading ? "Stacking…" : "Stack →"}
          </button>
        </div>

        {rec && (
          <div style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 14,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <span className="eyebrow">Stack total on {fmtCAD(rec.spend_amount)}</span>
                <div className="display" style={{ fontSize: 36, color: "var(--accent)", lineHeight: 1, marginTop: 4 }}>
                  {fmtCAD(rec.total_value_cad)}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", letterSpacing: "0.04em" }}>
                {rec.effective_return_pct.toFixed(2)}% effective return
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--rule)" }}>
              {rec.components.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 16,
                    alignItems: "center",
                    padding: "12px 4px",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontSize: 16, color: "var(--ink)" }}>{c.source}</div>
                    <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>{c.detail}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--gain)", fontWeight: 600 }}>+{fmtCAD(c.value_cad)}</div>
                </div>
              ))}
            </div>
            {rec.warnings && rec.warnings.length > 0 && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderLeft: "2px solid var(--accent)" }}>
                {rec.warnings.map((w, i) => (
                  <p key={i} className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", margin: 0 }}>
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </PaperTile>
    </section>
  );
}

/* ─── Devaluation alarms ────────────────────────────────────────────────── */
function DevaluationTile({ sessionId, isReady }: { sessionId: string | null; isReady: boolean }) {
  const [events, setEvents] = useState<DevaluationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const e = await listDevaluations(sessionId ?? undefined);
      setEvents(e);
    } finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { if (isReady) load(); }, [isReady, load]);

  return (
    <section style={{ marginBottom: 22 }}>
      <ToolHeader
        motif="alarm"
        kicker="Devaluation watch"
        title={<>Dispatches from the <span style={{ fontStyle: "italic" }}>devaluation desk</span>.</>}
        lede="Every announced and rumoured program change in the past 12 months. Items affecting balances in your wallet are flagged."
      />
      <PaperTile>
        {loading ? (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>Loading the desk…</div>
        ) : events.length === 0 ? (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>No active alerts. The desk is quiet.</div>
        ) : (
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {events.map(e => {
              const urgent = e.user_holds_balance && e.days_until >= 0 && e.days_until <= 60;
              const dayCopy = e.days_until >= 0 ? `in ${e.days_until} days` : `${-e.days_until} days ago`;
              return (
                <div
                  key={e.id}
                  style={{
                    padding: "16px 4px",
                    borderBottom: "1px solid var(--rule)",
                    borderLeft: urgent ? "2px solid var(--accent)" : "2px solid transparent",
                    paddingLeft: urgent ? 14 : 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        padding: "3px 8px",
                        border: "1px solid var(--rule-strong)",
                        color: e.severity === "major" ? "var(--accent)" : "var(--ink-2)",
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      {e.severity}
                    </span>
                    <span className="eyebrow">{progLabel(e.program_slug)}</span>
                    {e.user_holds_balance && (
                      <span className="eyebrow" style={{ color: "var(--accent)" }}>★ Your wallet</span>
                    )}
                    <span
                      className="mono"
                      style={{ marginLeft: "auto", fontSize: 11, color: urgent ? "var(--accent)" : "var(--ink-3)" }}
                    >
                      {dayCopy}
                    </span>
                  </div>
                  <h3 className="display" style={{ fontSize: 20, margin: 0, lineHeight: 1.15 }}>{e.title}</h3>
                  {e.description && (
                    <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.45 }}>
                      {e.description}
                    </p>
                  )}
                  {e.source_url && (
                    <a href={e.source_url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "underline" }}>
                      Source →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PaperTile>
    </section>
  );
}

/* ─── Award watcher ─────────────────────────────────────────────────────── */
function AwardWatchTile({ sessionId, ensureSession }: { sessionId: string | null; ensureSession: () => Promise<string> }) {
  const [watches, setWatches] = useState<AwardWatch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [origin, setOrigin] = useState("YYZ");
  const [destination, setDestination] = useState("NRT");
  const [date, setDate] = useState("");
  const [flex, setFlex] = useState("3");
  const [cabin, setCabin] = useState<"economy" | "business" | "first">("business");
  const [maxPoints, setMaxPoints] = useState("80000");

  const load = useCallback(async () => {
    if (!sessionId) return;
    try { setWatches(await listAwardWatches(sessionId)); } catch {}
  }, [sessionId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const sid = await ensureSession();
    await createAwardWatch(sid, {
      origin, destination, depart_date: date,
      flex_days: parseInt(flex) || 3, cabin,
      max_points: parseInt(maxPoints) || null, program_slug: "aeroplan",
    });
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    if (!sessionId) return;
    await deleteAwardWatch(sessionId, id);
    load();
  }

  return (
    <section style={{ marginBottom: 22 }}>
      <ToolHeader
        motif="plane"
        kicker="Aeroplan watcher"
        title={<>Save the <span style={{ fontStyle: "italic" }}>itinerary</span>. Wait for the open seat.</>}
        lede="Track Aeroplan award availability for the routes you actually want to fly. Cron worker + push notifications coming next sprint."
      />
      <PaperTile>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <span className="eyebrow">{watches.length} active watch{watches.length === 1 ? "" : "es"}</span>
          <button
            onClick={() => setShowForm(s => !s)}
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${showForm ? "var(--rule-strong)" : "var(--accent)"}`,
              background: showForm ? "transparent" : "var(--accent)",
              color: showForm ? "var(--ink-2)" : "#fff",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            <Plus size={12} />
            {showForm ? "Cancel" : "New watch"}
          </button>
        </div>

        {showForm && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              border: "1px solid var(--rule)",
              background: "var(--card-fill)",
              marginBottom: 16,
              display: "grid",
              gap: 10,
            }}
          >
            <div className="protool-watch-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 10 }}>
              <input value={origin} onChange={e => setOrigin(e.target.value.toUpperCase())} placeholder="YYZ" style={fieldStyle} />
              <input value={destination} onChange={e => setDestination(e.target.value.toUpperCase())} placeholder="NRT" style={fieldStyle} />
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldStyle} />
            </div>
            <div className="protool-watch-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <input type="number" value={flex} onChange={e => setFlex(e.target.value)} placeholder="±days" style={fieldStyle} />
              <select value={cabin} onChange={e => setCabin(e.target.value as typeof cabin)} style={fieldStyle}>
                <option value="economy">Economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
              <input type="number" value={maxPoints} onChange={e => setMaxPoints(e.target.value)} placeholder="max points" style={fieldStyle} />
            </div>
            <button onClick={add} disabled={!date} style={{ ...ctaStyle, opacity: date ? 1 : 0.6, alignSelf: "start" }}>
              Save watch →
            </button>
          </div>
        )}

        {watches.length === 0 ? (
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)", fontSize: 14, margin: 0 }}>
            No watches yet. Pick a route and a date — we&apos;ll keep an eye on it.
          </p>
        ) : (
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {watches.map(w => (
              <div
                key={w.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 4px",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <div>
                  <div className="display" style={{ fontSize: 18 }}>
                    {w.origin} <span style={{ color: "var(--ink-3)" }}>→</span> {w.destination}
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 10, letterSpacing: "0.10em", textTransform: "uppercase" }}>
                      {w.cabin}
                    </span>
                  </div>
                  <div className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                    {w.depart_date} · ±{w.flex_days}d
                    {w.max_points ? ` · max ${w.max_points.toLocaleString()} pts` : ""}
                  </div>
                </div>
                <button
                  onClick={() => w.id && remove(w.id)}
                  className="mono"
                  style={{
                    padding: 8,
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    background: "transparent",
                    color: "var(--ink-3)",
                    cursor: "pointer",
                  }}
                  aria-label="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </PaperTile>
    </section>
  );
}

/* ─── India hotel arbitrage ─────────────────────────────────────────────── */
function IndiaArbTile({ sessionId, isReady }: { sessionId: string | null; isReady: boolean }) {
  const [props, setProps] = useState<IndiaArbitrageProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    getIndiaArbitrage(sessionId).then(setProps).catch(()=>{}).finally(() => setLoading(false));
  }, [isReady, sessionId]);

  return (
    <section style={{ marginBottom: 22 }}>
      <ToolHeader
        motif="mountain"
        kicker="India arbitrage"
        title={<>Canadian points, <span style={{ fontStyle: "italic" }}>Indian rates</span>.</>}
        lede="Marriott, Hilton, and Hyatt fixed-night charts make Indian properties some of the highest-CPP redemptions on earth. Set point balances on /wallet for personalised math."
      />
      <PaperTile>
        {loading ? (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>Loading properties…</div>
        ) : props.length === 0 ? (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>
            No properties found. Try seeding a hotel-program balance at <Link href="/wallet" style={{ color: "var(--accent)" }}>/wallet</Link>.
          </div>
        ) : (
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {props.slice(0, 8).map((p, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 4px",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="display" style={{ fontSize: 18, lineHeight: 1.1 }}>{p.property_name}</div>
                  <div className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                    {p.city} · {progLabel(p.program_slug)} · {p.points_per_night.toLocaleString()} pts/night
                    <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: "var(--gain)" }}>
                      {(p.value_cad_per_point * 100).toFixed(2)}¢/pt
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="display" style={{ fontSize: 22, fontStyle: p.nights_affordable > 0 ? "italic" : "normal", color: p.nights_affordable > 0 ? "var(--gain)" : "var(--ink-3)" }}>
                    {p.nights_affordable > 0 ? `${p.nights_affordable} nights` : fmtCAD(p.cash_rate_cad)}
                  </div>
                  {p.total_savings_cad > 0 && (
                    <div className="mono" style={{ fontSize: 11, color: "var(--gain)", marginTop: 2 }}>
                      save {fmtCAD(p.total_savings_cad)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mono" style={{ fontSize: 10, marginTop: 14, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
          Cash rates sampled at booking time. Set point balances at{" "}
          <Link href="/wallet" style={{ color: "var(--accent)", textDecoration: "underline" }}>/wallet</Link> for personalised savings math.
        </p>
      </PaperTile>
    </section>
  );
}
