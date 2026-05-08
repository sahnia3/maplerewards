"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useSession } from "@/contexts/session-context";
import { useAuth } from "@/contexts/auth-context";
import { chat } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { MapleLeaf } from "@/components/editorial/leaf-divider";

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
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const sid = await ensureSession();
      if (researchMode) setSearching(true);
      const resp = await chat({ session_id: sid, message: text, history: messages, research_mode: researchMode });
      setMessages(resp.history);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg.includes("UPGRADE_REQUIRED") || msg.includes("Upgrade to Pro")) {
        setRateLimited(true);
        setMessages((prev) => [...prev, { role: "assistant", content: "You've used your free message this month. Upgrade to Pro for unlimited AI access." }]);
      } else {
        setError(msg);
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't process your request. Please try again." }]);
      }
    } finally {
      setLoading(false);
      setSearching(false);
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
    <div className="reveal" style={{ paddingTop: 0, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, maxWidth: 880, width: "100%", margin: "0 auto", padding: "32px clamp(20px, 3vw, 40px) 160px" }}>
        <PageMasthead
          eyebrow="Concierge"
          eyebrowEnd="Claude Sonnet 4.5"
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
                    maxWidth: m.role === "user" ? "78%" : "100%",
                    padding: m.role === "user" ? "12px 16px" : "0",
                    borderRadius: m.role === "user" ? 14 : 0,
                    background: m.role === "user" ? "var(--accent)" : "transparent",
                    color: m.role === "user" ? "#fff" : "var(--ink-2)",
                    borderTop: m.role === "assistant" ? "1px solid var(--rule)" : "none",
                    borderLeft: m.role === "assistant" ? "2px solid var(--accent)" : "none",
                    paddingLeft: m.role === "assistant" ? 18 : undefined,
                    paddingTop: m.role === "assistant" ? 14 : undefined,
                  }}
                >
                  {m.role === "assistant" ? (
                    <div className="serif chat-message" style={{ fontSize: 16, lineHeight: 1.6 }}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="sans" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{m.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderLeft: "2px solid var(--accent)", paddingLeft: 18 }}>
                {searching ? (
                  <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Searching live sources…
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", gap: 5 }}>
                    <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
                  </span>
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
              Free users get one message per month. Pro members get the full concierge.
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

      {/* Input bar — fixed at bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: "color-mix(in srgb, var(--paper) 90%, transparent)",
          borderTop: "1px solid var(--rule)",
          backdropFilter: "blur(20px) saturate(1.4)",
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "14px clamp(20px, 3vw, 40px) 18px" }}>
          {/* Research mode toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
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
              placeholder={rateLimited && !isPro ? "Upgrade to Pro for unlimited messages" : "Ask the editor about your rewards…"}
              rows={1}
              disabled={loading || (rateLimited && !isPro)}
              className="serif"
              style={{
                flex: 1,
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
              }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading || (rateLimited && !isPro)}
              style={{
                width: 36,
                height: 36,
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
        .chat-message h2 { font-family: var(--font-display); font-size: 22px; margin: 18px 0 8px; color: var(--ink); font-style: normal; }
        .chat-message h3 { font-family: var(--font-display); font-size: 18px; margin: 14px 0 6px; color: var(--ink); font-style: normal; }
        .chat-message p { margin: 0 0 12px; font-style: italic; }
        .chat-message ul, .chat-message ol { padding-left: 20px; margin: 0 0 12px; font-style: italic; }
        .chat-message li { margin: 3px 0; }
        .chat-message strong { color: var(--ink); font-weight: 500; font-style: normal; }
        .chat-message a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
        .chat-message code { font-family: var(--font-mono); font-size: 13px; background: var(--card-fill); padding: 2px 6px; border-radius: 4px; font-style: normal; }
      `}</style>
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
