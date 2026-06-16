"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/contexts/wallet-context";
import { useAuth } from "@/contexts/auth-context";
import { listCards, getRecommendations } from "@/lib/api";
import { useReportableError } from "@/lib/use-reportable-error";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import type { Card, CardScore } from "@/lib/types";
import { Check, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

/* Editorial onboarding — all emoji removed, paper substrate, maple-red CTAs.
 * Four steps: choose cards · spending · preferences · ranked results. */

// All step-by-step inputs are mirrored into localStorage so a refresh or a
// browser tab swap doesn't drop ~5 minutes of typing on the floor. Cleared
// by the "Add top 3" success handler so a returning user starts fresh.
const ONBOARDING_KEY = "maple_onboarding_v1";

interface OnboardingState {
  step: 1 | 2 | 3 | 4;
  selectedCardIds: string[];
  monthlySpend: Record<string, number>;
  cardCount: string;
  feePreference: string;
  selectedPerks: string[];
}

function readOnboardingState(): Partial<OnboardingState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Schema guard: ignore unknown shapes from a past version of the form.
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeOnboardingState(state: OnboardingState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
  } catch {
    /* quota or private-mode — silently ignore */
  }
}

function clearOnboardingState() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(ONBOARDING_KEY); } catch { /* noop */ }
}

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
  const { addCard, wallet } = useWallet();
  const { isAuthenticated } = useAuth();

  // Lazy initializers hydrate from localStorage so a refresh mid-flow
  // doesn't wipe partially-entered answers. The form should feel like a
  // single continuous session, not a series of separate visits.
  const restored = typeof window !== "undefined" ? readOnboardingState() : null;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(restored?.step ?? 1);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsError, setCardsError] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>(restored?.selectedCardIds ?? []);
  const [monthlySpend, setMonthlySpend] = useState<Record<string, number>>(
    restored?.monthlySpend ?? INITIAL_SPEND
  );
  const [cardCount, setCardCount] = useState(restored?.cardCount ?? "2–3 cards");
  const [feePreference, setFeePreference] = useState(restored?.feePreference ?? "Up to $150");
  const [selectedPerks, setSelectedPerks] = useState<string[]>(restored?.selectedPerks ?? []);
  const [results, setResults] = useState<CardScore[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [addingCards, setAddingCards] = useState(false);
  const [addCardsError, setAddCardsError] = useState<string | null>(null);
  // Per-card "Track this card" state on the step-4 result rows (NU-1). Keyed by
  // card_id: tracks the in-flight add + any per-card failure independently of
  // the bulk "Add my cards" button.
  const [trackingCardId, setTrackingCardId] = useState<string | null>(null);
  const [trackedCardIds, setTrackedCardIds] = useState<string[]>([]);
  const [trackError, setTrackError] = useState<Record<string, string>>({});

  const reportCards = useReportableError("onboarding.listCards");
  const reportResults = useReportableError("onboarding.getRecommendations");

  const loadCards = useCallback(() => {
    setCardsLoading(true);
    setCardsError(false);
    listCards()
      .then(setAllCards)
      .catch((e) => { reportCards(e); setCardsError(true); })
      .finally(() => setCardsLoading(false));
  }, [reportCards]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Mirror every step input into localStorage. The results array isn't
  // persisted — it's derived from the inputs and regenerable on demand.
  useEffect(() => {
    writeOnboardingState({ step, selectedCardIds, monthlySpend, cardCount, feePreference, selectedPerks });
  }, [step, selectedCardIds, monthlySpend, cardCount, feePreference, selectedPerks]);

  const totalMonthly = Object.values(monthlySpend).reduce((a, b) => a + b, 0);
  // Step-3 wallet-size preference → concrete count. Honoured in the /recommend
  // request (backend caps the list) and everywhere results are shown/added.
  const desiredCount = cardCount === "1 card" ? 1 : cardCount === "4+ cards" ? 5 : 3;
  // How many cards the terminal CTA actually adds: the cards the user said they
  // carry, else the top recommendations capped to their desired wallet size.
  const addCount =
    selectedCardIds.length > 0 ? selectedCardIds.length : Math.min(desiredCount, results.length);
  const toggleCard = (id: string) =>
    setSelectedCardIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const togglePerk = (v: string) =>
    setSelectedPerks((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const handleGetResults = async () => {
    setResultsLoading(true);
    setResultsError(null);
    try {
      // Honour the step-3 preferences as hard constraints: "No fees" excludes
      // every fee-bearing card; the wallet-size choice caps how many come back.
      const maxAnnualFee =
        feePreference === "No fees" ? 0 : feePreference === "Up to $150" ? 150 : null;
      const data = await getRecommendations({
        monthly_spend: monthlySpend,
        max_annual_fee: maxAnnualFee,
        card_count: desiredCount,
      });
      setResults(data);
      setStep(4);
    } catch (e) {
      reportResults(e);
      setResultsError(
        e instanceof Error
          ? e.message
          : "Couldn't generate your recommendations. Check your connection and try again."
      );
    }
    finally { setResultsLoading(false); }
  };

  // Per-card "Track this card" on a step-4 result row (NU-1). Unauthenticated
  // sessions are handled by addCard itself (stash + redirect to /signup), so we
  // don't optimistically mark tracked in that case — the redirect takes over.
  const handleTrackCard = async (cardId: string) => {
    setTrackingCardId(cardId);
    setTrackError((p) => {
      const next = { ...p };
      delete next[cardId];
      return next;
    });
    try {
      await addCard(cardId);
      if (isAuthenticated) {
        setTrackedCardIds((p) => (p.includes(cardId) ? p : [...p, cardId]));
      }
    } catch (e) {
      setTrackError((p) => ({
        ...p,
        [cardId]: e instanceof Error && e.message ? e.message : "Couldn't track this card. Try again.",
      }));
    } finally {
      setTrackingCardId(null);
    }
  };

  const handleAddTopCards = async () => {
    // Seed the wallet with the cards the user said they CARRY (step 1),
    // not the recommendations — adding cards they don't hold misrepresents
    // their wallet. Recommendations stay on-screen as suggestions. Fall
    // back to the top-3 recs only if (somehow) nothing was selected.
    const toAdd = selectedCardIds.length > 0
      ? selectedCardIds
      : results.slice(0, desiredCount).map((s) => s.card_id);

    // Logged-out sessions can't write to a server wallet. addCard stashes
    // each pick and redirects to /signup?redirect= — let that flow run
    // instead of clobbering it with router.push("/") below. The post-auth
    // drain in wallet-context replays the stash once they're back.
    if (!isAuthenticated) {
      for (const id of toAdd) {
        await addCard(id);
      }
      return;
    }

    setAddingCards(true);
    setAddCardsError(null);
    const failed: string[] = [];
    let succeeded = 0;
    let lastError: unknown = null;
    try {
      for (const id of toAdd) {
        try {
          await addCard(id);
          succeeded += 1;
        } catch (e) {
          failed.push(id);
          lastError = e;
        }
      }
      // Surface every per-card failure regardless of outcome (NU-3).
      if (failed.length > 0) {
        const names = failed
          .map((id) => allCards.find((c) => c.id === id)?.name ?? "a card")
          .join(", ");
        setAddCardsError(
          `Couldn't add ${names}${lastError instanceof Error && lastError.message ? ` — ${lastError.message}` : ""}`
        );
      }
      // Only leave the page once at least one card actually landed in the
      // wallet. On zero successful adds we stay put so the error above is
      // visible and the user can retry — never navigate away on a total
      // failure (NU-3).
      if (succeeded > 0) {
        // User finished onboarding — discard the cached form state so a
        // returning user (e.g. resetting their wallet) starts fresh.
        clearOnboardingState();
        router.push("/");
      }
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 32 }}>
          <span className="eyebrow" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>About 90 seconds · 4 steps · Step {step}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
              lede="Tap every card you currently use. We'll model them against the optimizer to measure missed rewards and unused transfers."
            />

            {/* Beginner branch (NU-1): a true new user has no cards to tap.
                Clear any selection and route straight into the spend →
                recommend flow so step 4 answers "what should I get?". */}
            <button
              type="button"
              onClick={() => {
                setSelectedCardIds([]);
                setStep(2);
              }}
              className="m-tap"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                width: "100%",
                marginBottom: 24,
                padding: "16px 18px",
                borderRadius: 12,
                border: "1px dashed var(--rule-strong)",
                background: "var(--card-fill)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span className="display" style={{ display: "block", fontSize: 16, color: "var(--ink)", lineHeight: 1.2 }}>
                  I&rsquo;m new — I don&rsquo;t have any cards yet
                </span>
                <span className="serif" style={{ display: "block", fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                  Skip this step and we&rsquo;ll recommend cards from your spending.
                </span>
              </span>
              <ChevronRight size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
            </button>

            {cardsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
                <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
              </div>
            ) : cardsError ? (
              <div
                role="alert"
                style={{
                  border: "1px solid var(--accent)",
                  borderLeft: "3px solid var(--accent)",
                  borderRadius: 14,
                  padding: "20px 24px",
                  background: "var(--card-fill)",
                  marginBottom: 28,
                }}
              >
                <p className="serif" style={{ fontStyle: "italic", color: "var(--accent)", fontSize: 15, margin: 0 }}>
                  Couldn&rsquo;t load the card catalog. Check your connection and try again.
                </p>
                <button
                  type="button"
                  onClick={loadCards}
                  className="mono"
                  style={{
                    marginTop: 10,
                    background: "transparent",
                    border: "1px solid var(--rule-strong)",
                    color: "var(--ink-2)",
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Try again →
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <input
                    type="search"
                    value={cardSearch}
                    onChange={(e) => setCardSearch(e.target.value)}
                    placeholder="Search by card name or issuer (e.g. Cobalt, RBC, Aeroplan)"
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "1px solid var(--rule-strong)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                  {cardSearch && (
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, letterSpacing: "0.10em", textTransform: "uppercase" }}>
                      {allCards.filter((c) => {
                        const q = cardSearch.toLowerCase();
                        return c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q);
                      }).length} of {allCards.length} cards
                    </div>
                  )}
                </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                {allCards.filter((card) => {
                  if (!cardSearch) return true;
                  const q = cardSearch.toLowerCase();
                  return card.name.toLowerCase().includes(q) || card.issuer.toLowerCase().includes(q);
                }).map((card) => {
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
                      <div style={{ width: "100%", marginBottom: 10 }}>
                        <CreditCardVisual card={card} size="sm" fill />
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
              </>
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
              lede="Drag each slider to your typical monthly outlay. We use these numbers to model the effective return on every card in the catalog."
            />

            <button
              type="button"
              onClick={() => setMonthlySpend({
                "groceries": 900,
                "dining": 400,
                "travel": 250,
                "gas-transit": 220,
                "pharmacy": 80,
                "entertainment": 150,
              })}
              className="mono"
              style={{
                marginBottom: 22,
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px dashed var(--rule-strong)",
                background: "transparent",
                color: "var(--ink-2)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
              title="Pre-fill with realistic numbers for a Canadian household ($2,000/mo total). Adjust from there."
            >
              I don&rsquo;t track my spend → use typical defaults
            </button>

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
              lede="A few preferences so the optimizer knows what to weigh: wallet size, fee tolerance, perk priority."
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

            {resultsError && (
              <div
                role="alert"
                style={{
                  border: "1px solid var(--accent)",
                  borderLeft: "3px solid var(--accent)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  background: "var(--card-fill)",
                  marginBottom: 14,
                }}
              >
                <p className="serif" style={{ fontStyle: "italic", color: "var(--accent)", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                  {resultsError}
                </p>
              </div>
            )}
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
                  <>{resultsError ? "Try again" : "Get my results"} <ChevronRight size={14} /></>
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
              title={<>Your ideal <span style={{ fontStyle: "italic" }}>wallet</span>.</>}
              lede={`Ranked by estimated annual rewards on $${totalMonthly.toLocaleString()}/month of spend, net of annual fees.`}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
              {results.slice(0, desiredCount).map((score, idx) => {
                // CardScore.network is typed as a loose string. Normalize it to
                // the Card network union so an unexpected backend value (e.g.
                // "discover", "") falls back to a known network instead of being
                // silently asserted and producing a broken visual.
                const network: Card["network"] =
                  score.network === "mastercard" || score.network === "amex"
                    ? score.network
                    : "visa";
                const cardForVisual: Card = {
                  id: score.card_id,
                  name: score.card_name,
                  issuer: score.issuer,
                  network,
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
                    className="m-grid-1"
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

                      {/* Per-card actions (NU-1): a "View card →" link into the
                          in-app card detail page, and an "Add to wallet" button
                          wiring the existing addCard. Once added, the row turns
                          into a link straight to /wallet so the saved card is
                          discoverable. No affiliate Apply button — deferred (REF-2). */}
                      {(() => {
                        const alreadyTracked =
                          trackedCardIds.includes(score.card_id) ||
                          wallet.some((c) => c.card_id === score.card_id);
                        const tracking = trackingCardId === score.card_id;
                        return (
                          <>
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 14 }}>
                              <Link
                                href={`/cards/${score.card_id}`}
                                className="mono m-tap"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "8px 14px",
                                  borderRadius: 8,
                                  border: "1px solid var(--rule-strong)",
                                  color: "var(--ink-2)",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  letterSpacing: "0.10em",
                                  textTransform: "uppercase",
                                  textDecoration: "none",
                                }}
                              >
                                View card <ChevronRight size={12} />
                              </Link>
                              {alreadyTracked ? (
                                <Link
                                  href="/wallet"
                                  className="mono m-tap"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "8px 14px",
                                    borderRadius: 8,
                                    border: "1px solid var(--rule)",
                                    background: "transparent",
                                    color: "var(--ink-2)",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    letterSpacing: "0.10em",
                                    textTransform: "uppercase",
                                    textDecoration: "none",
                                  }}
                                >
                                  <Check size={12} strokeWidth={3} /> In your wallet <ChevronRight size={12} />
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleTrackCard(score.card_id)}
                                  disabled={tracking}
                                  className="mono m-tap"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "8px 14px",
                                    borderRadius: 8,
                                    border: "1px solid var(--accent)",
                                    background: "var(--accent)",
                                    color: "#fff",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    letterSpacing: "0.10em",
                                    textTransform: "uppercase",
                                    cursor: tracking ? "default" : "pointer",
                                    opacity: tracking ? 0.7 : 1,
                                  }}
                                >
                                  {tracking ? (
                                    <><Loader2 size={12} className="animate-spin" /> Adding…</>
                                  ) : (
                                    "Add to wallet"
                                  )}
                                </button>
                              )}
                            </div>
                            {trackError[score.card_id] && (
                              <p role="alert" className="serif" style={{ fontStyle: "italic", color: "var(--accent)", fontSize: 13, margin: "8px 0 0", lineHeight: 1.4 }}>
                                {trackError[score.card_id]}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>

            {results.length === 0 && (
              <div
                role="status"
                style={{
                  border: "1px solid var(--rule)",
                  borderLeft: "3px solid var(--accent)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  background: "var(--card-fill)",
                  marginBottom: 12,
                }}
              >
                <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                  No cards fit those preferences. Go back and allow a small annual fee, or choose a larger wallet.
                </p>
              </div>
            )}

            {addCardsError && (
              <div
                role="alert"
                style={{
                  border: "1px solid var(--accent)",
                  borderLeft: "3px solid var(--accent)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  background: "var(--card-fill)",
                  marginBottom: 12,
                }}
              >
                <p className="serif" style={{ fontStyle: "italic", color: "var(--accent)", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                  {addCardsError}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={handleAddTopCards}
              disabled={addingCards || addCount === 0}
              style={{ ...ctaPrimary, width: "100%", marginBottom: 10, opacity: addingCards || addCount === 0 ? 0.7 : 1 }}
            >
              {addingCards ? (
                <><Loader2 size={14} className="animate-spin" /> Adding…</>
              ) : (
                <>Add my {addCount} card{addCount === 1 ? "" : "s"} to wallet <ChevronRight size={14} /></>
              )}
            </button>
            <Link
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
              Or explore the full card catalog →
            </Link>
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
      className="mono m-tap"
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
