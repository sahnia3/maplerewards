"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/contexts/wallet-context";
import { listCards, getRecommendations } from "@/lib/api";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import type { Card, CardScore } from "@/lib/types";
import { Check, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

/* Editorial onboarding — all emoji removed, paper substrate, maple-red CTAs.
 * Four steps: choose cards · spending · preferences · ranked results. */

const CATEGORIES = [
  { slug: "groceries",     label: "Groceries",     max: 2000, step: 50,  default: 600 },
  { slug: "dining",        label: "Dining",         max: 1000, step: 25,  default: 300 },
  { slug: "travel",        label: "Travel",         max: 3000, step: 50,  default: 200 },
  { slug: "gas-transit",   label: "Gas & Transit",  max: 500,  step: 25,  default: 150 },
  { slug: "pharmacy",      label: "Pharmacy",       max: 500,  step: 25,  default: 100 },
  { slug: "entertainment", label: "Entertainment",  max: 500,  step: 25,  default: 100 },
];

const INITIAL_SPEND = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.default]));

const CARD_COUNT_OPTIONS = ["1 card", "2–3 cards", "4+ cards"];
const FEE_OPTIONS = ["No fees", "Up to $150", "Any fee"];
const PERKS = [
  { label: "Lounge access",     value: "lounge" },
  { label: "Travel insurance",  value: "insurance" },
  { label: "No FX fees",        value: "no-fx" },
  { label: "Cashback",          value: "cashback" },
  { label: "Hotel points",      value: "hotel" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { addCard } = useWallet();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [monthlySpend, setMonthlySpend] = useState<Record<string, number>>(INITIAL_SPEND);
  const [cardCount, setCardCount] = useState("2–3 cards");
  const [feePreference, setFeePreference] = useState("Up to $150");
  const [selectedPerks, setSelectedPerks] = useState<string[]>([]);
  const [results, setResults] = useState<CardScore[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [addingCards, setAddingCards] = useState(false);

  useEffect(() => {
    listCards()
      .then(setAllCards)
      .catch(console.error)
      .finally(() => setCardsLoading(false));
  }, []);

  const totalMonthly = Object.values(monthlySpend).reduce((a, b) => a + b, 0);
  const toggleCard = (id: string) =>
    setSelectedCardIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const togglePerk = (v: string) =>
    setSelectedPerks((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const handleGetResults = async () => {
    setResultsLoading(true);
    try {
      const data = await getRecommendations({ monthly_spend: monthlySpend });
      setResults(data);
      setStep(4);
    } catch (e) { console.error(e); }
    finally { setResultsLoading(false); }
  };

  const handleAddTopCards = async () => {
    setAddingCards(true);
    try {
      for (const score of results.slice(0, 3)) {
        try { await addCard(score.card_id); } catch {}
      }
      router.push("/");
    } finally { setAddingCards(false); }
  };

  /* ── editorial primitives reused across steps ─── */
  const ctaPrimary: React.CSSProperties = {
    height: 50,
    padding: "0 24px",
    borderRadius: 10,
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
  const ctaSecondary: React.CSSProperties = {
    ...ctaPrimary,
    background: "transparent",
    color: "var(--ink-2)",
    border: "1px solid var(--rule-strong)",
  };

  const StepHeader = ({
    eyebrow,
    title,
    lede,
  }: {
    eyebrow: string;
    title: React.ReactNode;
    lede: string;
  }) => (
    <header style={{ marginBottom: 32 }}>
      <span className="eyebrow" style={{ color: "var(--accent)" }}>{eyebrow}</span>
      <h1
        className="display"
        style={{
          fontSize: "clamp(36px, 5vw, 52px)",
          margin: "10px 0 12px",
          lineHeight: 0.96,
          letterSpacing: "-0.015em",
        }}
      >
        {title}
      </h1>
      <p className="serif" style={{ fontSize: 17, fontStyle: "italic", color: "var(--ink-2)", margin: 0, lineHeight: 1.45, maxWidth: 520 }}>
        {lede}
      </p>
    </header>
  );

  return (
    <div className="reveal" style={{ paddingTop: 0, minHeight: "100vh" }}>
      {/* Top progress rule */}
      <div style={{ height: 2, width: "100%", background: "var(--rule)" }}>
        <div
          style={{
            height: "100%",
            width: `${step * 25}%`,
            background: "var(--accent)",
            transition: "width 700ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px clamp(20px, 3vw, 40px) 80px" }}>
        {/* Step strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <span className="eyebrow">Step {step} of 4</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[1, 2, 3, 4].map((s) => (
              <span
                key={s}
                style={{
                  width: s === step ? 22 : 6,
                  height: 4,
                  borderRadius: 2,
                  background: s <= step ? "var(--accent)" : "var(--rule)",
                  transition: "all 280ms cubic-bezier(.2,.7,.2,1)",
                }}
              />
            ))}
          </div>
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
              className="mono"
              style={{ background: "transparent", border: "none", color: "var(--ink-3)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <ChevronLeft size={12} /> Back
            </button>
          ) : <span style={{ width: 60 }} />}
        </div>

        {/* ─────────── STEP 1: Choose cards ─────────── */}
        {step === 1 && (
          <>
            <StepHeader
              eyebrow="Getting started"
              title={<>Which cards <span style={{ fontStyle: "italic" }}>do you carry?</span></>}
              lede="Tap every card you currently use. We'll model them against the optimizer to size leakage and missed transfers."
            />

            {cardsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
                <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                {allCards.map((card) => {
                  const on = selectedCardIds.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => toggleCard(card.id)}
                      style={{
                        position: "relative",
                        background: "var(--card-fill)",
                        border: `1px solid ${on ? "var(--accent)" : "var(--rule)"}`,
                        borderRadius: 12,
                        padding: 12,
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "border-color 160ms, transform 160ms",
                        transform: on ? "translateY(-2px)" : "translateY(0)",
                        boxShadow: on ? "0 8px 22px -10px var(--accent-soft), var(--shadow-1)" : "none",
                      }}
                    >
                      <div style={{ width: "100%", aspectRatio: "1.586 / 1", overflow: "hidden", borderRadius: 8, marginBottom: 10 }}>
                        <CreditCardVisual card={card} size="sm" />
                      </div>
                      <div className="display" style={{ fontSize: 15, lineHeight: 1.2, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {card.name}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
                        {card.issuer}
                      </div>
                      {on && (
                        <span
                          style={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "var(--accent)",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={selectedCardIds.length === 0}
                style={{ ...ctaPrimary, flex: 2, opacity: selectedCardIds.length === 0 ? 0.5 : 1 }}
              >
                Continue <ChevronRight size={14} />
              </button>
              <button type="button" onClick={() => setStep(2)} style={{ ...ctaSecondary, flex: 1 }}>
                Skip
              </button>
            </div>
          </>
        )}

        {/* ─────────── STEP 2: Monthly spend ─────────── */}
        {step === 2 && (
          <>
            <StepHeader
              eyebrow="Spending profile"
              title={<>How do you <span style={{ fontStyle: "italic" }}>spend</span> each month?</>}
              lede="Drag each ruled bar to your typical monthly outlay. We use these numbers to model effective return on every card in the catalogue."
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 24 }}>
              {CATEGORIES.map((cat) => {
                const val = monthlySpend[cat.slug];
                const pct = (val / cat.max) * 100;
                return (
                  <div key={cat.slug}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                      <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        {cat.label}
                      </span>
                      <span className="display" style={{ fontSize: 22, fontStyle: "italic", color: "var(--accent)" }}>
                        ${val.toLocaleString()}
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4, fontStyle: "normal" }}>/mo</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={cat.max}
                      step={cat.step}
                      value={val}
                      onChange={(e) => setMonthlySpend((p) => ({ ...p, [cat.slug]: Number(e.target.value) }))}
                      className="onboard-slider"
                      style={{
                        ["--slider-pct" as string]: `${pct}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                padding: "14px 18px",
                border: "1px solid var(--ink)",
                borderRadius: 12,
                background: "var(--card-fill-strong)",
                marginBottom: 28,
              }}
            >
              <span className="eyebrow">Total monthly outlay</span>
              <span className="display" style={{ fontSize: 28, fontStyle: "italic", color: "var(--ink)" }}>
                ${totalMonthly.toLocaleString()}
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 4, fontStyle: "normal" }}>/mo</span>
              </span>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setStep(1)} style={{ ...ctaSecondary, flex: 1 }}>Back</button>
              <button type="button" onClick={() => setStep(3)} style={{ ...ctaPrimary, flex: 2 }}>
                See recommendations <ChevronRight size={14} />
              </button>
            </div>

            <style>{`
              .onboard-slider {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 4px;
                border-radius: 0;
                background: linear-gradient(to right, var(--accent) var(--slider-pct, 0%), var(--rule-strong) var(--slider-pct, 0%));
                outline: none;
                cursor: pointer;
              }
              .onboard-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: var(--accent);
                border: 2px solid var(--paper);
                box-shadow: 0 2px 6px rgba(165,31,45,0.30);
                cursor: pointer;
              }
              .onboard-slider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: var(--accent);
                border: 2px solid var(--paper);
                cursor: pointer;
              }
            `}</style>
          </>
        )}

        {/* ─────────── STEP 3: Preferences ─────────── */}
        {step === 3 && (
          <>
            <StepHeader
              eyebrow="Preferences"
              title={<>One last <span style={{ fontStyle: "italic" }}>thing</span>.</>}
              lede="A few preferences so the optimizer knows what to weigh — wallet size, fee tolerance, perk priority."
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 26, marginBottom: 28 }}>
              <FieldGroup label="How many cards do you prefer?">
                {CARD_COUNT_OPTIONS.map((opt) => (
                  <Pill key={opt} label={opt} active={cardCount === opt} onClick={() => setCardCount(opt)} />
                ))}
              </FieldGroup>
              <FieldGroup label="Are you OK paying annual fees?">
                {FEE_OPTIONS.map((opt) => (
                  <Pill key={opt} label={opt} active={feePreference === opt} onClick={() => setFeePreference(opt)} />
                ))}
              </FieldGroup>
              <FieldGroup label="What perks matter most?" hint="select all that apply">
                {PERKS.map((p) => (
                  <Pill
                    key={p.value}
                    label={p.label}
                    active={selectedPerks.includes(p.value)}
                    onClick={() => togglePerk(p.value)}
                  />
                ))}
              </FieldGroup>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setStep(2)} style={{ ...ctaSecondary, flex: 1 }}>Back</button>
              <button
                type="button"
                onClick={handleGetResults}
                disabled={resultsLoading}
                style={{ ...ctaPrimary, flex: 2, opacity: resultsLoading ? 0.6 : 1 }}
              >
                {resultsLoading ? (
                  <><Loader2 size={14} className="animate-spin" /> Calculating…</>
                ) : (
                  <>Get my results <ChevronRight size={14} /></>
                )}
              </button>
            </div>
          </>
        )}

        {/* ─────────── STEP 4: Ranked results ─────────── */}
        {step === 4 && (
          <>
            <StepHeader
              eyebrow="Your results"
              title={<>Your ideal <span style={{ fontStyle: "italic" }}>card stack</span>.</>}
              lede={`Ranked by estimated annual rewards on $${totalMonthly.toLocaleString()}/month of spend, net of annual fees.`}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
              {results.slice(0, 5).map((score, idx) => {
                const cardForVisual: Card = {
                  id: score.card_id,
                  name: score.card_name,
                  issuer: score.issuer,
                  network: score.network as "visa" | "mastercard" | "amex",
                  loyalty_program_id: "",
                  annual_fee: score.annual_fee,
                  welcome_bonus_points: score.welcome_bonus_points,
                  welcome_bonus_min_spend: score.welcome_bonus_min_spend,
                  welcome_bonus_months: score.welcome_bonus_months,
                  is_active: true,
                  created_at: "",
                };
                const isTop = idx === 0;
                return (
                  <div
                    key={score.card_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      gap: 18,
                      alignItems: "start",
                      padding: 18,
                      border: `1px solid ${isTop ? "var(--accent)" : "var(--rule)"}`,
                      borderRadius: 14,
                      background: "var(--card-fill)",
                      boxShadow: isTop ? "0 16px 40px -22px var(--accent-soft), var(--shadow-1)" : "var(--shadow-1)",
                      position: "relative",
                    }}
                  >
                    {isTop && (
                      <span
                        className="mono"
                        style={{
                          position: "absolute",
                          top: 12,
                          right: 12,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: "var(--accent)",
                          color: "#fff",
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                        }}
                      >
                        Top pick
                      </span>
                    )}
                    <div style={{ width: 160, flexShrink: 0 }}>
                      <CreditCardVisual card={cardForVisual} size="sm" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="display" style={{ fontSize: 20, lineHeight: 1.15, color: "var(--ink)" }}>
                        {score.card_name}
                      </div>
                      <div className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                        {score.loyalty_program} · {score.issuer}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
                        <span className="display" style={{ fontSize: 28, fontStyle: "italic", color: "var(--accent)" }}>
                          ~${Math.max(0, Math.round(score.net_annual_value)).toLocaleString()}
                          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4, fontStyle: "normal" }}>/yr</span>
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                          after ${score.annual_fee} fee
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                        {score.top_categories.slice(0, 3).map((cat) => (
                          <span
                            key={cat.category_slug}
                            className="mono"
                            style={{
                              fontSize: 10,
                              padding: "3px 9px",
                              borderRadius: 999,
                              border: "1px solid var(--rule)",
                              color: "var(--ink-2)",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {cat.earn_type === "cashback_pct"
                              ? `${cat.earn_rate}% ${cat.category_name}`
                              : `${cat.earn_rate}× ${cat.category_name}`}
                          </span>
                        ))}
                      </div>
                      {score.welcome_bonus_points > 0 && (
                        <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10, letterSpacing: "0.02em" }}>
                          Welcome: {score.welcome_bonus_points.toLocaleString()} pts on ${score.welcome_bonus_min_spend.toLocaleString()} in {score.welcome_bonus_months}mo
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddTopCards}
              disabled={addingCards}
              style={{ ...ctaPrimary, width: "100%", marginBottom: 10, opacity: addingCards ? 0.7 : 1 }}
            >
              {addingCards ? (
                <><Loader2 size={14} className="animate-spin" /> Adding…</>
              ) : (
                <>Add top 3 cards to wallet <ChevronRight size={14} /></>
              )}
            </button>
            <a
              href="/cards"
              className="mono"
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "12px 0",
                fontSize: 11,
                color: "var(--ink-3)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              Or explore the full register →
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span className="eyebrow">{label}</span>
        {hint && <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase" }}>{hint}</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono"
      style={{
        padding: "9px 16px",
        borderRadius: 999,
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--ink-2)",
        border: `1px solid ${active ? "var(--accent)" : "var(--rule)"}`,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        cursor: "pointer",
        transition: "background 160ms, border-color 160ms, color 160ms",
      }}
    >
      {label}
    </button>
  );
}
