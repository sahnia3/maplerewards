"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/contexts/wallet-context";
import { listCards, getRecommendations } from "@/lib/api";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import type { Card, CardScore } from "@/lib/types";
import { Check, ChevronRight, ChevronLeft, Loader2, Sparkles } from "lucide-react";

const CATEGORIES = [
  { slug: "groceries",     label: "Groceries",     emoji: "🛒", max: 2000, step: 50,  default: 600 },
  { slug: "dining",        label: "Dining",         emoji: "🍽️", max: 1000, step: 25,  default: 300 },
  { slug: "travel",        label: "Travel",         emoji: "✈️", max: 3000, step: 50,  default: 200 },
  { slug: "gas-transit",   label: "Gas & Transit",  emoji: "⛽", max: 500,  step: 25,  default: 150 },
  { slug: "pharmacy",      label: "Pharmacy",       emoji: "💊", max: 500,  step: 25,  default: 100 },
  { slug: "entertainment", label: "Entertainment",  emoji: "🎬", max: 500,  step: 25,  default: 100 },
];

const INITIAL_SPEND = Object.fromEntries(CATEGORIES.map(c => [c.slug, c.default]));

const CARD_COUNT_OPTIONS = ["1 card", "2–3 cards", "4+ cards"];
const FEE_OPTIONS = ["No fees please", "Up to $150", "Any fee"];
const PERKS = [
  { label: "✈️ Lounge Access", value: "lounge" },
  { label: "🛡️ Insurance",     value: "insurance" },
  { label: "💱 No FX Fees",    value: "no-fx" },
  { label: "🎁 Cashback",      value: "cashback" },
  { label: "🏨 Hotel Points",  value: "hotel" },
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
    setSelectedCardIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const togglePerk = (v: string) =>
    setSelectedPerks(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);

  const handleGetResults = async () => {
    setResultsLoading(true);
    try {
      const data = await getRecommendations({ monthly_spend: monthlySpend });
      setResults(data);
      setStep(4);
    } catch (e) {
      console.error(e);
    } finally {
      setResultsLoading(false);
    }
  };

  const handleAddTopCards = async () => {
    setAddingCards(true);
    try {
      for (const score of results.slice(0, 3)) {
        try { await addCard(score.card_id); } catch {}
      }
      router.push("/");
    } finally {
      setAddingCards(false);
    }
  };

  const progressPct = step * 25;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#08090E", color: "white" }}>
      {/* Progress bar */}
      <div className="h-[2px] w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #0D9488, #A78BFA)" }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center px-5 py-10 w-full max-w-xl mx-auto">
        {/* Header row */}
        <div className="w-full flex items-center justify-between mb-10">
          <span
            className="text-[10px] font-mono tracking-[0.2em] uppercase"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Step {step} of 4
          </span>
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map(s => (
              <div
                key={s}
                className="rounded-full transition-all duration-300"
                style={{
                  width: s === step ? "20px" : "6px",
                  height: "6px",
                  background: s <= step ? "#0D9488" : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>
          {step > 1 && (
            <button
              onClick={() => setStep(s => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-75"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <ChevronLeft size={13} /> Back
            </button>
          )}
        </div>

        {/* ── STEP 1: Choose Your Cards ── */}
        {step === 1 && (
          <div key="step1" className="w-full" style={{ animation: "slideUp 0.35s ease-out" }}>
            <p className="text-xs tracking-widest mb-2 font-mono" style={{ color: "#0D9488" }}>
              GETTING STARTED
            </p>
            <h1 className="text-3xl font-bold mb-1 leading-tight">Which cards<br />do you carry?</h1>
            <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.45)" }}>
              Select all the credit cards you currently own
            </p>

            {cardsLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={28} className="animate-spin" style={{ color: "#0D9488" }} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mb-8">
                {allCards.map(card => {
                  const on = selectedCardIds.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      onClick={() => toggleCard(card.id)}
                      className="relative rounded-2xl p-3 text-left transition-all duration-200 group"
                      style={{
                        background: on ? "rgba(13,148,136,0.10)" : "rgba(255,255,255,0.035)",
                        border: `1.5px solid ${on ? "#0D9488" : "rgba(255,255,255,0.07)"}`,
                        transform: on ? "scale(1.02)" : "scale(1)",
                      }}
                    >
                      <CreditCardVisual card={card} size="sm" />
                      <p
                        className="mt-2 text-xs font-semibold truncate"
                        style={{ color: on ? "#fff" : "rgba(255,255,255,0.65)" }}
                      >
                        {card.name}
                      </p>
                      <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {card.issuer}
                      </p>
                      {on && (
                        <div
                          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: "#0D9488" }}
                        >
                          <Check size={11} color="white" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setStep(2)}
              disabled={selectedCardIds.length === 0}
              className="w-full py-4 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all duration-200 mb-3"
              style={{
                background: selectedCardIds.length > 0 ? "#0D9488" : "rgba(255,255,255,0.06)",
                color: selectedCardIds.length > 0 ? "white" : "rgba(255,255,255,0.25)",
                cursor: selectedCardIds.length > 0 ? "pointer" : "not-allowed",
              }}
            >
              Continue <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setStep(2)}
              className="w-full text-center text-sm py-2 transition-opacity hover:opacity-75"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Skip for now
            </button>
          </div>
        )}

        {/* ── STEP 2: Monthly Spending ── */}
        {step === 2 && (
          <div key="step2" className="w-full" style={{ animation: "slideUp 0.35s ease-out" }}>
            <p className="text-xs tracking-widest mb-2 font-mono" style={{ color: "#0D9488" }}>
              SPENDING PROFILE
            </p>
            <h1 className="text-3xl font-bold mb-1 leading-tight">How do you spend<br />each month?</h1>
            <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.45)" }}>
              Drag to set your typical monthly amount per category
            </p>

            <div className="space-y-6 mb-6">
              {CATEGORIES.map(cat => {
                const val = monthlySpend[cat.slug];
                const pct = (val / cat.max) * 100;
                return (
                  <div key={cat.slug}>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-medium flex items-center gap-2.5">
                        <span className="text-base">{cat.emoji}</span>
                        <span style={{ color: "rgba(255,255,255,0.85)" }}>{cat.label}</span>
                      </span>
                      <span className="text-sm font-mono font-bold tabular-nums" style={{ color: "#0D9488" }}>
                        ${val.toLocaleString()}<span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>/mo</span>
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="range"
                        min={0}
                        max={cat.max}
                        step={cat.step}
                        value={val}
                        onChange={e =>
                          setMonthlySpend(p => ({ ...p, [cat.slug]: Number(e.target.value) }))
                        }
                        className="slider w-full"
                      />
                      <style>{`
                        .slider {
                          -webkit-appearance: none;
                          height: 3px;
                          border-radius: 99px;
                          background: linear-gradient(to right, #0D9488 ${pct}%, rgba(255,255,255,0.1) ${pct}%);
                          outline: none;
                          cursor: pointer;
                        }
                        .slider::-webkit-slider-thumb {
                          -webkit-appearance: none;
                          width: 18px;
                          height: 18px;
                          border-radius: 50%;
                          background: #0D9488;
                          box-shadow: 0 0 0 3px rgba(13,148,136,0.2);
                          cursor: pointer;
                          transition: box-shadow 0.15s;
                        }
                        .slider::-webkit-slider-thumb:hover {
                          box-shadow: 0 0 0 5px rgba(13,148,136,0.25);
                        }
                        .slider::-moz-range-thumb {
                          width: 18px;
                          height: 18px;
                          border-radius: 50%;
                          background: #0D9488;
                          border: none;
                          cursor: pointer;
                        }
                      `}</style>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className="rounded-xl px-4 py-3.5 flex items-center justify-between mb-7"
              style={{
                background: "rgba(13,148,136,0.07)",
                border: "1px solid rgba(13,148,136,0.18)",
              }}
            >
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
                Total monthly spend
              </span>
              <span className="font-bold text-white tabular-nums">
                ${totalMonthly.toLocaleString()}<span className="text-sm font-normal" style={{ color: "rgba(255,255,255,0.4)" }}>/mo</span>
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-4 rounded-2xl font-semibold text-sm transition-all"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-[2] py-4 rounded-2xl font-semibold text-[15px] text-white flex items-center justify-center gap-2 transition-all"
                style={{ background: "#0D9488" }}
              >
                See recommendations <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preferences ── */}
        {step === 3 && (
          <div key="step3" className="w-full" style={{ animation: "slideUp 0.35s ease-out" }}>
            <p className="text-xs tracking-widest mb-2 font-mono" style={{ color: "#0D9488" }}>
              PREFERENCES
            </p>
            <h1 className="text-3xl font-bold mb-1 leading-tight">One last<br />thing</h1>
            <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.45)" }}>
              Help us fine-tune your recommendations
            </p>

            <div className="space-y-8 mb-8">
              <div>
                <p className="text-sm font-medium mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
                  How many cards do you prefer?
                </p>
                <div className="flex flex-wrap gap-2">
                  {CARD_COUNT_OPTIONS.map(opt => (
                    <Pill key={opt} label={opt} active={cardCount === opt} onClick={() => setCardCount(opt)} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Are you okay paying annual fees?
                </p>
                <div className="flex flex-wrap gap-2">
                  {FEE_OPTIONS.map(opt => (
                    <Pill key={opt} label={opt} active={feePreference === opt} onClick={() => setFeePreference(opt)} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>
                  What perks matter most?
                  <span className="ml-2 text-xs font-normal" style={{ color: "rgba(255,255,255,0.3)" }}>
                    select all that apply
                  </span>
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {PERKS.map(p => (
                    <Pill
                      key={p.value}
                      label={p.label}
                      active={selectedPerks.includes(p.value)}
                      onClick={() => togglePerk(p.value)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-4 rounded-2xl font-semibold text-sm transition-all"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
              >
                Back
              </button>
              <button
                onClick={handleGetResults}
                disabled={resultsLoading}
                className="flex-[2] py-4 rounded-2xl font-semibold text-[15px] text-white flex items-center justify-center gap-2 transition-all"
                style={{ background: "#0D9488" }}
              >
                {resultsLoading ? (
                  <><Loader2 size={16} className="animate-spin" /> Calculating...</>
                ) : (
                  <><Sparkles size={16} /> Get my results</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Results ── */}
        {step === 4 && (
          <div key="step4" className="w-full" style={{ animation: "slideUp 0.35s ease-out" }}>
            <p className="text-xs tracking-widest mb-2 font-mono" style={{ color: "#0D9488" }}>
              YOUR RESULTS
            </p>
            <h1 className="text-3xl font-bold mb-1 leading-tight">Your ideal<br />card stack</h1>
            <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.45)" }}>
              Ranked by estimated annual rewards based on your spending
            </p>

            <div className="space-y-3 mb-8">
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
                return (
                  <div
                    key={score.card_id}
                    className="relative rounded-2xl p-4 flex gap-4 items-start"
                    style={{
                      background: idx === 0 ? "rgba(13,148,136,0.09)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${idx === 0 ? "rgba(13,148,136,0.28)" : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    {idx === 0 && (
                      <span
                        className="absolute top-3 right-3 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest"
                        style={{ background: "#0D9488", color: "white" }}
                      >
                        TOP PICK
                      </span>
                    )}
                    <div className="w-[90px] flex-shrink-0">
                      <CreditCardVisual card={cardForVisual} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-semibold text-sm text-white leading-snug">{score.card_name}</p>
                      <p className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.38)" }}>
                        {score.loyalty_program}
                      </p>
                      <div className="flex items-baseline gap-1.5 mb-2">
                        <span className="text-lg font-bold" style={{ color: "#0D9488" }}>
                          ~${Math.max(0, Math.round(score.net_annual_value)).toLocaleString()}
                          <span className="text-xs font-semibold">/yr</span>
                        </span>
                        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                          after ${score.annual_fee} fee
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {score.top_categories.slice(0, 2).map(cat => (
                          <span
                            key={cat.category_slug}
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)" }}
                          >
                            {cat.earn_type === "cashback_pct"
                              ? `${cat.earn_rate}% ${cat.category_name}`
                              : `${cat.earn_rate}x ${cat.category_name}`}
                          </span>
                        ))}
                      </div>
                      {score.welcome_bonus_points > 0 && (
                        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                          🎁 {score.welcome_bonus_points.toLocaleString()} pts · ${score.welcome_bonus_min_spend.toLocaleString()} in {score.welcome_bonus_months}mo
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleAddTopCards}
              disabled={addingCards}
              className="w-full py-4 rounded-2xl font-semibold text-[15px] text-white flex items-center justify-center gap-2 mb-3 transition-all"
              style={{ background: "#0D9488" }}
            >
              {addingCards ? (
                <><Loader2 size={16} className="animate-spin" /> Adding cards...</>
              ) : (
                "Add top 3 cards to wallet"
              )}
            </button>
            <a
              href="/cards"
              className="block w-full text-center text-sm py-2 transition-opacity hover:opacity-75"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Explore all cards →
            </a>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-150"
      style={{
        background: active ? "#0D9488" : "rgba(255,255,255,0.06)",
        color: active ? "white" : "rgba(255,255,255,0.55)",
        border: `1px solid ${active ? "#0D9488" : "rgba(255,255,255,0.09)"}`,
      }}
    >
      {label}
    </button>
  );
}
