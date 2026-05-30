"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSession } from "@/contexts/session-context";
import { useAuth } from "@/contexts/auth-context";
import { chatStream } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { MapleLeaf } from "@/components/editorial/leaf-divider";

// In-flight tool calls rendered as status pills under the user's last message.
type ToolPill = {
  id: string;
  name: string;
  state: "running" | "done" | "error";
  summary?: string;
};

// Human label for each tool name. Matches the registry in internal/service/ai_tools.go.
const TOOL_LABELS: Record<string, string> = {
  search_award_space: "Searching award space",
  search_cash_flights: "Checking cash prices",
  get_transfer_partners: "Loading transfer partners",
  get_program_cpp: "Looking up CPP",
  web_search: "Searching the web",
  evaluate_buy_points: "Evaluating buy-points deal",
  recommend_stack: "Building optimal stack",
  evaluate_missed_rewards: "Auditing missed rewards",
  project_sqc: "Projecting Aeroplan SQC",
};

const SUGGESTIONS = [
  { label: "Best way to fly business class to London", prompt: "Best way to fly business class to London with my points" },
  { label: "Hotels in Paris using my points", prompt: "Find me hotels in Paris using my points — 3 nights" },
  { label: "Points needed for Tokyo economy", prompt: "How many Aeroplan points do I need for Tokyo economy class from Toronto?" },
  { label: "Which card for my upcoming flight", prompt: "Which card should I use for my upcoming flight purchase?" },
  { label: "Maximize my points value", prompt: "How can I maximize the value of my points across all my cards?" },
  { label: "Best welcome bonuses right now", prompt: "What are the best credit card welcome bonuses available right now in Canada?" },
];

export default function ChatPage() {
  const { sessionId, ensureSession } = useSession();
  const { isPro } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  // Tool-pill state for the in-flight turn. Cleared on send and when the
  // assistant's response arrives.
  const [pills, setPills] = useState<ToolPill[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  async function handleSend(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    setLoading(true);
    setPills([]);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const sid = await ensureSession();
      if (researchMode) setSearching(true);
      await chatStream(
        { session_id: sid, message: text, history: messages, research_mode: researchMode },
        (e) => {
          if (e.type === "tool_start") {
            setPills((prev) => [...prev, { id: e.id, name: e.name, state: "running" }]);
          } else if (e.type === "tool_done") {
            setPills((prev) =>
              prev.map((p) =>
                p.id === e.id ? { ...p, state: "done", summary: e.summary } : p
              )
            );
          } else if (e.type === "done") {
            setMessages(e.history);
            // Clear pills after the final message lands so the answer reads cleanly.
            setPills([]);
          } else if (e.type === "error") {
            setError(e.message);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Sorry, I couldn't process your request. Please try again." },
            ]);
          }
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg.includes("UPGRADE_REQUIRED") || msg.includes("Upgrade to Pro")) {
        setRateLimited(true);
        setMessages((prev) => [...prev, { role: "assistant", content: "You've used your 2 free messages for the month. Upgrade to Pro for unlimited AI access." }]);
      } else {
        setError(msg);
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't process your request. Please try again." }]);
      }
    } finally {
      setLoading(false);
      setSearching(false);
      setPills([]);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    // NOTE: no `reveal` class here. `.reveal`'s entrance animation ends on
    // transform: translateY(0) (fill-mode both), and ANY non-none transform on
    // an ancestor makes it the containing block for position:fixed descendants —
    // which would anchor the fixed input bar to this div's (content-tall) bottom
    // instead of the viewport, pushing the textarea off-screen on mobile.
    <div style={{ paddingTop: 0, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, maxWidth: 880, width: "100%", margin: "0 auto", padding: "32px clamp(20px, 3vw, 40px) 200px" }}>
        <PageMasthead
          eyebrow="Maple"
          eyebrowEnd="Claude Sonnet 4.6"
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>rewards</span> editor.
            </>
          }
          lede="Ask anything about your wallet, card-stack, transfer partners, or sweet-spot redemptions. Wired to your live wallet data."
        />

        {messages.length === 0 ? (
          <>
            {/* Welcome card */}
            <div
              style={{
                border: "1px solid var(--rule)",
                borderTop: "3px solid var(--accent)",
                borderRadius: 14,
                background: "var(--card-fill-strong)",
                padding: "26px 28px",
                marginBottom: 28,
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <MapleLeaf size={20} />
                <div style={{ flex: 1 }}>
                  <span className="eyebrow">From the editor</span>
                  <p
                    className="serif"
                    style={{ fontSize: 17, fontStyle: "italic", lineHeight: 1.5, color: "var(--ink-2)", marginTop: 8 }}
                  >
                    I&rsquo;m wired to your wallet — your cards, your point balances, your spend
                    history. Ask me which card to use, how to transfer points, or how to
                    redeem for a specific trip.
                    {!sessionId && (
                      <> Add cards in the <Link href="/wallet" style={{ color: "var(--accent)" }}>Wallet</Link> tab for personalised advice.</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Suggestion ledger */}
            <div style={{ borderTop: "1px solid var(--ink)" }}>
              <div className="eyebrow" style={{ padding: "16px 4px 12px" }}>Try one of these</div>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => handleSend(s.prompt)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 60px",
                    alignItems: "center",
                    gap: 16,
                    padding: "16px 4px",
                    borderTop: i > 0 ? "1px solid var(--rule)" : "1px solid var(--rule)",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 160ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-fill)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.10em" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="serif" style={{ fontSize: 17, fontStyle: "italic", color: "var(--ink-2)" }}>
                    {s.label}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--accent)", textAlign: "right", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Ask →
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                    maxWidth: m.role === "user" ? "min(560px, 80%)" : "100%",
                    // Padding in one shorthand per role — prior code combined a
                    // shorthand with `paddingLeft/Top: undefined` for non-assistant,
                    // which React serialised to "" and reset those longhands to 0,
                    // so user bubbles ended up flush-left against the rounded edge.
                    padding: m.role === "user" ? "12px 16px" : "14px 0 0 18px",
                    borderRadius: m.role === "user" ? 14 : 0,
                    background: m.role === "user" ? "var(--accent)" : "transparent",
                    color: m.role === "user" ? "#fff" : "var(--ink)",
                    borderTop: m.role === "assistant" ? "1px solid var(--rule)" : "none",
                    borderLeft: m.role === "assistant" ? "2px solid var(--accent)" : "none",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}
                >
                  {m.role === "assistant" ? (
                    <div
                      className="sans chat-message"
                      style={{ fontSize: 15, lineHeight: 1.65, maxWidth: "100%", overflowX: "auto" }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="sans" style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: "#fff", whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>{m.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 0", borderLeft: "2px solid var(--accent)", paddingLeft: 18 }}>
                {/* Always-present, animated "thinking" line so the wait reads as
                   alive motion rather than a static stack of pills. */}
                <ThinkingIndicator searching={searching} />
                {/* Tool-call pills (when the model is using tools) fade in below. */}
                {pills.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {pills.map((p) => (
                      <div key={p.id} className="maple-pill-in">
                        <ToolStatusPill pill={p} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {error && (
          <div
            className="mono"
            style={{
              marginTop: 18,
              padding: "12px 16px",
              border: "1px solid var(--accent-soft)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--accent)",
              letterSpacing: "0.06em",
            }}
          >
            ⚠ {error}
          </div>
        )}

        {rateLimited && !isPro && (
          <div
            style={{
              marginTop: 22,
              border: "1px solid var(--accent)",
              borderRadius: 14,
              padding: "22px 24px",
              background: "var(--accent-soft)",
              textAlign: "center",
            }}
          >
            <span className="eyebrow" style={{ color: "var(--accent)" }}>Free limit reached</span>
            <h3 className="display" style={{ fontSize: 26, margin: "8px 0 6px" }}>
              Upgrade for <span style={{ fontStyle: "italic" }}>unlimited</span> editor access.
            </h3>
            <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", marginBottom: 18, fontSize: 15 }}>
              Free users get 2 messages per month. Pro members get the full concierge.
            </p>
            <Link
              href="/pricing"
              className="mono"
              style={{
                display: "inline-block",
                padding: "12px 22px",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              Upgrade to Pro
            </Link>
          </div>
        )}
      </div>

      {/* Input bar — fixed at bottom. On mobile it must sit ABOVE the bottom
          tab nav (which is also fixed at bottom:0), otherwise the textarea is
          hidden behind the nav and runs off-screen. --bottom-nav-height is 0 on
          desktop and 64px on mobile (set in app-shell), so this anchors the bar
          correctly in both. */}
      <div
        style={{
          position: "fixed",
          bottom: "var(--bottom-nav-height, 0px)",
          left: 0,
          right: 0,
          zIndex: 41,
          background: "color-mix(in srgb, var(--paper) 90%, transparent)",
          borderTop: "1px solid var(--rule)",
          backdropFilter: "blur(20px) saturate(1.4)",
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "14px clamp(20px, 3vw, 40px) 18px" }}>
          {/* Research mode toggle + free-tier quota indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setResearchMode(!researchMode)}
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 11px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                background: researchMode ? "var(--accent-soft)" : "transparent",
                color: researchMode ? "var(--accent)" : "var(--ink-3)",
                border: `1px solid ${researchMode ? "var(--accent)" : "var(--rule)"}`,
                cursor: "pointer",
              }}
            >
              {researchMode ? "● " : ""}Research mode
            </button>
            {researchMode && (
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                web sources cited
              </span>
            )}
            {/* Soft free-tier indicator. Shows remaining count instead of
                hard-disabling the input — user can still compose and only
                hits friction at send time. Hidden for Pro members. */}
            {!isPro && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: rateLimited ? "var(--accent)" : "var(--ink-3)",
                  marginLeft: "auto",
                }}
              >
                {rateLimited ? (
                  <>
                    Free limit reached ·{" "}
                    <Link href="/pricing" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                      Upgrade for unlimited
                    </Link>
                  </>
                ) : (
                  <>Free tier · 2 messages/month · upgrade for unlimited</>
                )}
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 12,
              background: "var(--surface)",
              border: `1px solid ${researchMode ? "var(--accent)" : "var(--rule-strong)"}`,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={rateLimited && !isPro ? "Free monthly limit reached — upgrade for unlimited" : "Ask the editor about your rewards…"}
              rows={1}
              disabled={loading}
              className="serif"
              style={{
                flex: 1,
                minWidth: 0,
                width: "100%",
                background: "transparent",
                resize: "none",
                outline: "none",
                border: "none",
                fontSize: 16,
                color: "var(--ink)",
                fontStyle: "italic",
                maxHeight: 120,
                padding: 0,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading || (rateLimited && !isPro)}
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 8,
                background: input.trim() && !loading ? "var(--accent)" : "var(--surface-2)",
                color: input.trim() && !loading ? "#fff" : "var(--ink-3)",
                border: "none",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          <p className="mono" style={{ fontSize: 9, textAlign: "center", marginTop: 8, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Verify all financial decisions before acting.
          </p>
        </div>
      </div>

      <style jsx global>{`
        .chat-message h2 { font-family: var(--font-display); font-size: 22px; margin: 18px 0 8px; color: var(--ink); font-style: normal; line-height: 1.2; }
        .chat-message h3 { font-family: var(--font-display); font-size: 18px; margin: 14px 0 6px; color: var(--ink); font-style: normal; line-height: 1.25; }
        .chat-message p { margin: 0 0 14px; color: var(--ink); }
        .chat-message ul, .chat-message ol { padding-left: 22px; margin: 0 0 14px; color: var(--ink); }
        .chat-message li { margin: 4px 0; }
        .chat-message strong { color: var(--ink); font-weight: 600; }
        .chat-message em { font-style: italic; color: var(--ink); }
        .chat-message a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
        .chat-message code { font-family: var(--font-mono); font-size: 13px; background: var(--card-fill); padding: 2px 6px; border-radius: 4px; }
        .chat-message table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
        .chat-message th, .chat-message td { border-bottom: 1px solid var(--rule); padding: 8px 10px; text-align: left; }
        .chat-message th { color: var(--ink-3); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; font-size: 11px; }
        .chat-message hr { border: 0; border-top: 1px solid var(--rule); margin: 16px 0; }
        .chat-message pre { background: var(--card-fill); padding: 12px; border-radius: 8px; overflow-x: auto; }

        /* Maple "thinking" indicator — a soft pulsing orb + a phrase that
           cross-fades, so the wait feels like live motion. */
        @keyframes maple-pulse {
          0%, 100% { transform: scale(1); opacity: 0.95; box-shadow: 0 0 0 0 var(--accent-soft); }
          50%      { transform: scale(1.35); opacity: 0.5; box-shadow: 0 0 0 6px transparent; }
        }
        @keyframes maple-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* Loading dots inside in-flight tool-status pills. Was referenced by
           the Dot component but never defined — the dots sat motionless. */
        @keyframes chat-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40%           { transform: translateY(-4px); opacity: 1; }
        }
        .maple-thinking-orb {
          width: 9px; height: 9px; border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 0 4px var(--accent-soft);
          animation: maple-pulse 1.5s ease-in-out infinite;
          flex-shrink: 0;
        }
        .maple-thinking-text { display: inline-block; animation: maple-fade-in 420ms ease both; }
        .maple-pill-in { animation: maple-fade-in 320ms ease both; }
      `}</style>
    </div>
  );
}

function ThinkingIndicator({ searching }: { searching: boolean }) {
  // Phrases cross-fade every couple seconds so the wait reads as live motion.
  const phrases = searching
    ? ["Searching live sources…", "Reading the latest fares…", "Cross-checking award space…"]
    : ["Brewing your answer…", "Thinking it through…", "Checking your wallet…", "Weighing transfer partners…", "Crunching the points math…"];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    const t = setInterval(() => setIdx((i) => (i + 1) % phrases.length), 2200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 11 }} role="status" aria-live="polite">
      <span className="maple-thinking-orb" aria-hidden />
      <span
        key={idx}
        className="serif maple-thinking-text"
        style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-2)" }}
      >
        {phrases[idx]}
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--accent)",
        animation: "chat-bounce 1.2s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}

function ToolStatusPill({ pill }: { pill: ToolPill }) {
  const label = TOOL_LABELS[pill.name] ?? pill.name;
  const isDone = pill.state === "done";
  const isError = pill.state === "error";
  return (
    <div
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        alignSelf: "flex-start",
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${isError ? "var(--loss)" : isDone ? "var(--rule)" : "var(--accent)"}`,
        background: isError ? "var(--accent-soft)" : isDone ? "var(--surface-2)" : "var(--accent-soft)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: isError ? "var(--loss)" : isDone ? "var(--ink-3)" : "var(--accent)",
        transition: "background 200ms, color 200ms, border-color 200ms",
      }}
    >
      {isDone ? (
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gain)" }} />
      ) : isError ? (
        <span aria-hidden>!</span>
      ) : (
        <span aria-hidden style={{ display: "inline-flex", gap: 3 }}>
          <Dot delay="0ms" />
          <Dot delay="150ms" />
          <Dot delay="300ms" />
        </span>
      )}
      <span>
        {label}
        {pill.summary ? <span style={{ color: "var(--ink-2)", textTransform: "none", letterSpacing: "0.02em", marginLeft: 8 }}>· {pill.summary}</span> : null}
      </span>
    </div>
  );
}
