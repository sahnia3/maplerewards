"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { useSession } from "@/contexts/session-context";
import { chat } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import ReactMarkdown from "react-markdown";

export function ChatFab() {
  const [open, setOpen] = useState(false);
  const { ensureSession } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    try {
      const sid = await ensureSession();
      const resp = await chat({ session_id: sid, message: text, history: messages });
      setMessages(resp.history);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't reach the AI right now." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <>
      {/* Panel */}
      <div
        className="fixed z-50 transition-all duration-300 ease-out lg:hidden"
        style={{
          bottom: 72,
          right: 16,
          left: 16,
          height: open ? 420 : 0,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transform: open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-mid)",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Panel header */}
        <div className="flex items-center gap-2.5 px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border-dim)" }}
        >
          <div className="w-7 h-7 rounded-lg maple-bg flex items-center justify-center"
            style={{ boxShadow: "0 2px 8px rgba(13,148,136,0.3)" }}>
            <span className="text-[12px]">🍁</span>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white">AI Assistant</div>
            <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {loading ? "Thinking…" : "Your rewards advisor"}
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="ml-auto"
            style={{ color: "var(--text-tertiary)" }}>
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🍁</div>
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Ask me anything about your rewards
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] rounded-2xl px-3 py-2 text-[13px]"
                style={msg.role === "user"
                  ? { background: "linear-gradient(135deg, #0D9488, #0F766E)", color: "white" }
                  : { background: "var(--bg-elevated)", border: "1px solid var(--border-dim)", color: "var(--text-primary)" }
                }
              >
                {msg.role === "assistant"
                  ? <div className="prose prose-invert prose-sm max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                  : msg.content
                }
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3 py-2"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}>
                <div className="flex gap-1">
                  {[0,150,300].map(d => (
                    <div key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: "#0D9488", animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 shrink-0" style={{ borderTop: "1px solid var(--border-dim)" }}>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about rewards…"
              disabled={loading}
              className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
            />
            <button onClick={handleSend} disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
              style={{
                background: input.trim() && !loading ? "linear-gradient(135deg, #0D9488, #0F766E)" : "rgba(255,255,255,0.06)",
                opacity: input.trim() && !loading ? 1 : 0.4,
              }}
            >
              <Send size={13} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* FAB — desktop: bottom-right, above tab bar on mobile */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed z-50 w-14 h-14 rounded-full maple-bg accent-glow flex items-center justify-center transition-all duration-200 lg:bottom-6 lg:right-6"
        style={{
          bottom: open ? 500 : 80,
          right: 20,
          transform: open ? "scale(0.9)" : "scale(1)",
        }}
      >
        {open
          ? <X size={22} className="text-white" />
          : <MessageCircle size={22} className="text-white" />
        }
      </button>
    </>
  );
}
