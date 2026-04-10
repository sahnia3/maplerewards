"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "@/contexts/session-context";
import { useAuth } from "@/contexts/auth-context";
import { chat } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import { AnimatedSection } from "@/components/ui/animated-list";
import Link from "next/link";
import { Lock } from "lucide-react";

const SUGGESTIONS = [
  {
    icon: "✈️",
    label: "Best way to fly business class to London",
    prompt: "Best way to fly business class to London with my points",
  },
  {
    icon: "🏨",
    label: "Hotels in Paris using my points",
    prompt: "Find me hotels in Paris using my points — 3 nights",
  },
  {
    icon: "🗾",
    label: "Points needed for Tokyo economy",
    prompt: "How many Aeroplan points do I need for Tokyo economy class from Toronto?",
  },
  {
    icon: "💳",
    label: "Which card for my upcoming flight",
    prompt: "Which card should I use for my upcoming flight purchase?",
  },
  {
    icon: "💡",
    label: "Maximize my points value",
    prompt: "How can I maximize the value of my points across all my cards?",
  },
  {
    icon: "🎁",
    label: "Best welcome bonuses right now",
    prompt: "What are the best credit card welcome bonuses available right now in Canada?",
  },
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 120) + "px";
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
      const resp = await chat({
        session_id: sid,
        message: text,
        history: messages,
        research_mode: researchMode,
      });

      setMessages(resp.history);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Something went wrong";

      // Detect pro gating / upgrade required
      if (errorMsg.includes("UPGRADE_REQUIRED") || errorMsg.includes("Upgrade to Pro")) {
        setRateLimited(true);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "You've used your free AI message this month. Upgrade to Pro for unlimited access to the AI Assistant.",
          },
        ]);
      } else {
        setError(errorMsg);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I couldn't process your request right now. Please try again.",
          },
        ]);
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

  const hasSession = !!sessionId;

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col">
      <div
        className="orb w-[400px] h-[250px] top-[-60px] right-[-80px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(13,148,136,0.05) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-2xl mx-auto px-6 pt-8 pb-32 flex-1 w-full">
        {/* Header */}
        <AnimatedSection className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center maple-bg"
              style={{ boxShadow: "0 2px 12px rgba(13,148,136,0.3)" }}
            >
              <span className="text-[16px]">🍁</span>
            </div>
            <div>
              <h1 className="text-[20px] font-semibold text-white">
                AI Assistant
              </h1>
              <p
                className="text-[12px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                Your personal rewards advisor
              </p>
            </div>
          </div>
        </AnimatedSection>

        {/* Messages */}
        {messages.length === 0 ? (
          <AnimatedSection delay={0.05}>
            {/* Welcome */}
            <div
              className="rounded-2xl p-6 mb-6"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
              }}
            >
              <p
                className="text-[14px] leading-relaxed mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Hi! I&apos;m your Canadian credit card rewards assistant.
                I can help you figure out which card to use, how to maximize
                your points, and the best ways to redeem them.
              </p>
              {!hasSession && (
                <p
                  className="text-[13px] mt-3"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Tip: Add your cards in the Wallet tab for personalized
                  advice.
                </p>
              )}
            </div>

            {/* Suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleSend(s.prompt)}
                  disabled={loading}
                  className="text-left p-4 rounded-xl text-[13px]"
                  style={{
                    background: "rgba(13,148,136,0.06)",
                    border: "1px solid rgba(13,148,136,0.15)",
                    color: "var(--text-secondary)",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    const t = e.currentTarget;
                    t.style.background = "rgba(13,148,136,0.12)";
                    t.style.borderColor = "rgba(13,148,136,0.3)";
                    t.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    const t = e.currentTarget;
                    t.style.background = "rgba(13,148,136,0.06)";
                    t.style.borderColor = "rgba(13,148,136,0.15)";
                    t.style.transform = "translateY(0)";
                  }}
                >
                  <span className="mr-2">{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </AnimatedSection>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                  }`}
                  style={
                    msg.role === "user"
                      ? {
                          background:
                            "linear-gradient(135deg, #0D9488, #0F766E)",
                          color: "white",
                        }
                      : {
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-dim)",
                          color: "var(--text-primary)",
                        }
                  }
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-invert prose-sm max-w-none text-[14px] leading-relaxed [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>p:last-child]:mb-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-[14px] leading-relaxed">
                      {msg.content}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl rounded-bl-md px-4 py-3"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-dim)",
                  }}
                >
                  {searching ? (
                    <div className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" style={{ color: "#0D9488" }} viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        Searching the web…
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{
                          background: "#0D9488",
                          animationDelay: "0ms",
                        }}
                      />
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{
                          background: "#0D9488",
                          animationDelay: "150ms",
                        }}
                      />
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{
                          background: "#0D9488",
                          animationDelay: "300ms",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {error && (
          <div
            className="mt-4 rounded-xl p-3 text-[13px]"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#F87171",
            }}
          >
            {error}
          </div>
        )}

        {rateLimited && !isPro && (
          <div
            className="mt-4 rounded-2xl p-5 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(139,92,246,0.06))",
              border: "1px solid rgba(13,148,136,0.2)",
            }}
          >
            <Lock size={24} className="mx-auto mb-2" style={{ color: "#14B8A6" }} />
            <p className="text-[14px] font-semibold text-white mb-1">
              Free message limit reached
            </p>
            <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
              Free users get 1 AI message per month. Upgrade to Pro for unlimited access.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #0D9488, #0F766E)",
                boxShadow: "0 4px 16px rgba(13,148,136,0.3)",
              }}
            >
              Upgrade to Pro — $5.00/mo
            </Link>
          </div>
        )}
      </div>

      {/* Input bar — fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div
          className="border-t"
          style={{
            background: "rgba(8,9,14,0.90)",
            backdropFilter: "blur(20px) saturate(1.5)",
            WebkitBackdropFilter: "blur(20px) saturate(1.5)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <div className="max-w-2xl mx-auto px-6 py-5">
            {/* Research mode toggle */}
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setResearchMode(!researchMode)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-all"
                style={{
                  background: researchMode ? "rgba(13,148,136,0.15)" : "rgba(255,255,255,0.04)",
                  border: researchMode ? "1px solid rgba(13,148,136,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  color: researchMode ? "#14B8A6" : "var(--text-tertiary)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Research Mode
                {researchMode && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#14B8A6" }} />
                )}
              </button>
              {researchMode && (
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Web search enabled — answers backed by live sources
                </span>
              )}
            </div>

            <div
              className="flex items-end gap-3 rounded-xl px-4 py-3.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: researchMode ? "1px solid rgba(13,148,136,0.2)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={rateLimited && !isPro ? "Upgrade to Pro for unlimited messages" : "Ask about your credit card rewards..."}
                rows={1}
                disabled={loading || (rateLimited && !isPro)}
                className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 resize-none outline-none"
                style={{ maxHeight: "120px" }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading || (rateLimited && !isPro)}
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150"
                style={{
                  background:
                    input.trim() && !loading
                      ? "linear-gradient(135deg, #0D9488, #0F766E)"
                      : "rgba(255,255,255,0.06)",
                  opacity: input.trim() && !loading ? 1 : 0.4,
                  cursor:
                    input.trim() && !loading ? "pointer" : "not-allowed",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p
              className="text-[11px] text-center mt-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              AI Assistant may make mistakes. Always verify important financial
              decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
