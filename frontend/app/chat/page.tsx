"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSession } from "@/contexts/session-context";
import { useAuth } from "@/contexts/auth-context";
import { useWallet } from "@/contexts/wallet-context";
import { chatStream, request, ApiError } from "@/lib/api";
import type { ChatMessage, ChatRequest, ChatResult } from "@/lib/api";
import { IssuerBadge } from "@/components/editorial/issuer-badge";
import { FREE_LIMITS } from "@/lib/pro-features";

const LOGO = "/brand/maple-leaf-origami.png";

// A chat message plus the optional structured headline result the backend may
// emit (via the SSE "result" event) for the assistant turn it belongs to. We
// keep `result` on the local message so the 3-up grid renders for that reply.
type ChatMessageWithResult = ChatMessage & { result?: ChatResult };

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
  search_hotels: "Searching hotels",
  get_transfer_partners: "Loading transfer partners",
  get_program_cpp: "Looking up CPP",
  get_devaluation_history: "Loading devaluation history",
  web_search: "Searching the web",
  evaluate_buy_points: "Evaluating buy-points deal",
  recommend_stack: "Building optimal stack",
  evaluate_missed_rewards: "Auditing missed rewards",
  project_sqc: "Projecting Aeroplan SQC",
  find_card_for_merchant: "Finding your best card",
  lookup_card: "Looking up card details",
  simulate_transfer_with_bonus: "Simulating points transfer",
  project_aeroplan_devaluation: "Projecting devaluation exposure",
  list_my_award_watches: "Checking your award watches",
  create_award_watch: "Creating award watch",
};

// One row from GET /chat/conversations — enough to label the history list.
type ConversationSummary = {
  id: number;
  title?: string;
  updated_at: string;
};

async function fetchConversationMessages(id: number): Promise<ChatMessage[]> {
  const res = await request<{ messages: Array<{ role: string; content: string }> }>(
    `/chat/conversations/${id}/messages`,
  );
  return (res.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as ChatMessage["role"], content: m.content }));
}

function conversationLabel(c: ConversationSummary): string {
  const title = (c.title ?? "").trim();
  const short = title.length > 48 ? `${title.slice(0, 48)}…` : title;
  const date = c.updated_at
    ? new Date(c.updated_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : "";
  if (short) return date ? `${short} · ${date}` : short;
  return date || `Conversation ${c.id}`;
}

// Compact point-balance formatter for the wallet-context chips (e.g. 214.6K).
function formatPoints(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

// Drop the issuer prefix from a card name so the chip reads short ("Cobalt",
// "Aeroplan Visa Infinite") — the issuer badge already carries the brand.
function shortCardName(name: string, issuer: string): string {
  let out = (name ?? "").trim();
  const lead = (issuer ?? "").trim();
  if (lead && out.toLowerCase().startsWith(lead.toLowerCase())) {
    out = out.slice(lead.length).trim();
  }
  return out || name || "Card";
}

export default function ChatPage() {
  const { sessionId, ensureSession } = useSession();
  const { isPro, isAuthenticated } = useAuth();
  const { summary } = useWallet();
  const [messages, setMessages] = useState<ChatMessageWithResult[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  // Screen-reader announcement for the COMPLETED assistant reply. The
  // ThinkingIndicator's live region only voices the rotating "thinking"
  // phrases; this politely announces the real answer once, when it lands.
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  // Server-side history (signed-in users only). conversationId rides along on
  // every send so the backend appends to the same thread across reloads.
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  // Tool-pill state for the in-flight turn. Cleared on send and when the
  // assistant's response arrives.
  const [pills, setPills] = useState<ToolPill[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Holds the structured result for the in-flight turn (arrives as a "result"
  // SSE event before the final "done"); merged onto the assistant message once
  // `done` rebuilds the history.
  const pendingResultRef = useRef<ChatResult | null>(null);
  // Guards the mount-time auto-restore against clobbering a thread the user
  // already started or picked before the history fetch resolved.
  const hasInteractedRef = useRef(false);
  // In-flight request controller — lets the "Stop" button abort streaming.
  const abortRef = useRef<AbortController | null>(null);
  // Set true when the user hits Stop, so the catch block can swallow the
  // resulting AbortError instead of surfacing it as a failure.
  const abortedRef = useRef(false);
  // True once the first `token` for the current turn has landed. While true, an
  // in-flight assistant message holds the live-typing prose, so the rotating
  // ThinkingIndicator is suppressed (the real text has taken its place).
  const [streamingReply, setStreamingReply] = useState(false);
  // Accumulates the streamed prose for the current turn. The in-flight assistant
  // message is the LAST message in `messages` while streamingReply is true.
  const streamedTextRef = useRef("");

  // Wallet-context chips: source from the live wallet summary. Each card →
  // issuer badge + short name + balance, plus an accent "total" pill.
  const walletCards = summary?.cards ?? [];
  const walletTotal = summary?.total_points ?? walletCards.reduce((s, c) => s + (c.point_balance ?? 0), 0);
  // Maple AI chips: only the top 3 cards (by point balance) are shown, with a
  // "+N" pill for the rest, so a large wallet doesn't wrap into several rows.
  const topCards = [...walletCards].sort((a, b) => (b.point_balance ?? 0) - (a.point_balance ?? 0)).slice(0, 3);
  const extraCards = Math.max(0, walletCards.length - topCards.length);

  // Wallet-aware starter prompts for the empty state. When the page already
  // holds the user's top card, one chip references it by name; otherwise the
  // defaults are used. Tapping a chip submits it as the user's message.
  const starterPrompts: string[] = (() => {
    const defaults = [
      "Best card for groceries?",
      "Am I leaving points on the table?",
      "How do I fly to Tokyo in business class with my points?",
      "Which card should I cancel?",
    ];
    const lead = topCards[0];
    if (!lead) return defaults;
    const cardLabel = shortCardName(lead.card_name, lead.issuer);
    // Swap the second default for one that names a real held card/program.
    const personalised = lead.program_name
      ? `What's the best way to redeem my ${lead.program_name} points?`
      : `Am I getting the most out of my ${cardLabel}?`;
    return [defaults[0], personalised, defaults[2], defaults[3]];
  })();

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

  // Restore history on mount for signed-in users: load the conversation list,
  // then resume the most recent thread (server-side persistence already works —
  // the frontend just never called it).
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await request<{ conversations: ConversationSummary[] }>("/chat/conversations");
        if (cancelled) return;
        const convos = res.conversations ?? [];
        setConversations(convos);
        if (convos.length === 0 || hasInteractedRef.current) return;
        const msgs = await fetchConversationMessages(convos[0].id);
        if (cancelled || msgs.length === 0 || hasInteractedRef.current) return;
        setConversationId(convos[0].id);
        setMessages(msgs);
      } catch {
        // History unavailable — start a fresh thread.
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  async function openConversation(id: number) {
    if (loading) return;
    hasInteractedRef.current = true;
    try {
      const msgs = await fetchConversationMessages(id);
      setConversationId(id);
      setMessages(msgs);
      setError(null);
      setPills([]);
    } catch {
      setError("Couldn't load that conversation. Please try again.");
    }
  }

  function startNewConversation() {
    if (loading) return;
    hasInteractedRef.current = true;
    setConversationId(null);
    setMessages([]);
    setError(null);
    setPills([]);
  }

  function handleStop() {
    if (!loading) return;
    abortedRef.current = true;
    abortRef.current?.abort();
  }

  async function handleSend(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (!text || loading) return;
    hasInteractedRef.current = true;
    setInput("");
    setError(null);
    setLoading(true);
    setPills([]);
    setLiveAnnouncement("");
    pendingResultRef.current = null;
    abortedRef.current = false;
    setStreamingReply(false);
    streamedTextRef.current = "";
    const controller = new AbortController();
    abortRef.current = controller;
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const sid = await ensureSession();
      if (researchMode) setSearching(true);
      const req: ChatRequest & { conversation_id?: number } = {
        session_id: sid,
        message: text,
        history: messages,
        research_mode: researchMode,
      };
      if (conversationId) req.conversation_id = conversationId;
      await chatStream(
        req,
        (e) => {
          if (e.type === "tool_start") {
            setPills((prev) => [...prev, { id: e.id, name: e.name, state: "running" }]);
          } else if (e.type === "tool_done") {
            setPills((prev) =>
              prev.map((p) =>
                p.id === e.id ? { ...p, state: "done", summary: e.summary } : p
              )
            );
          } else if (e.type === "result") {
            // Structured headline (Points / Cash / Value-per-pt) for the turn —
            // stash it; merged onto the assistant message when `done` lands.
            pendingResultRef.current = {
              points: e.points,
              cash_cad: e.cash_cad,
              value_per_pt_cents: e.value_per_pt_cents,
              label: e.label,
            };
          } else if (e.type === "token") {
            // Live prose delta. On the FIRST token, append a fresh assistant
            // message (which makes the rotating ThinkingIndicator yield to real
            // typing text); thereafter, append the delta to that in-flight
            // message so it types out live.
            streamedTextRef.current += e.text;
            const full = streamedTextRef.current;
            setStreamingReply((already) => {
              if (already) {
                // Update the existing in-flight assistant message (last one).
                setMessages((prev) => {
                  if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") {
                    return [...prev, { role: "assistant", content: full }];
                  }
                  const next = prev.slice();
                  next[next.length - 1] = { ...next[next.length - 1], content: full };
                  return next;
                });
                return true;
              }
              // First token: create the streaming assistant message.
              setMessages((prev) => [...prev, { role: "assistant", content: full }]);
              return true;
            });
          } else if (e.type === "replace") {
            // Post-stream self-check rewrote the reply. Swap the in-flight
            // assistant message's content for the corrected full text.
            streamedTextRef.current = e.text;
            setMessages((prev) => {
              if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") {
                return [...prev, { role: "assistant", content: e.text }];
              }
              const next = prev.slice();
              next[next.length - 1] = { ...next[next.length - 1], content: e.text };
              return next;
            });
          } else if (e.type === "done") {
            // Rebuild from the canonical history, then attach any pending
            // structured result to the final assistant message.
            const pending = pendingResultRef.current;
            const next: ChatMessageWithResult[] = e.history.slice();
            if (pending) {
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === "assistant") {
                  next[i] = { ...next[i], result: pending };
                  break;
                }
              }
            }
            setMessages(next);
            // Streaming for this turn is finished; the canonical history above
            // now holds the final assistant reply (reconciled against the
            // streamed/replaced in-flight message).
            setStreamingReply(false);
            streamedTextRef.current = "";
            // Politely announce the completed assistant reply to screen
            // readers (the live region voices this content, not every token).
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === "assistant") {
                setLiveAnnouncement(next[i].content);
                break;
              }
            }
            pendingResultRef.current = null;
            // The done payload carries the conversation_id (new or existing)
            // for signed-in users — keep it so the next send continues the
            // same thread, and surface a freshly minted thread in the list.
            const convoID = (e as { conversation_id?: number }).conversation_id;
            if (convoID) {
              setConversationId(convoID);
              setConversations((prev) =>
                prev.some((c) => c.id === convoID)
                  ? prev
                  : [{ id: convoID, title: text, updated_at: new Date().toISOString() }, ...prev]
              );
            }
            // Clear pills after the final message lands so the answer reads cleanly.
            setPills([]);
          } else if (e.type === "error") {
            setError(e.message);
            setStreamingReply(false);
            streamedTextRef.current = "";
            // If prose had begun streaming, overwrite that in-flight assistant
            // message with the error note instead of appending a second one.
            setMessages((prev) => {
              const note = "Sorry, I couldn't process your request. Please try again.";
              if (prev.length > 0 && prev[prev.length - 1].role === "assistant") {
                const next = prev.slice();
                next[next.length - 1] = { role: "assistant", content: note };
                return next;
              }
              return [...prev, { role: "assistant", content: note }];
            });
          }
        },
        controller.signal,
      );
    } catch (err) {
      // User pressed Stop — finalize the partial reply gracefully. The stream
      // may have already appended assistant text to `messages`; if nothing
      // landed, leave a short note so the turn doesn't read as a dead end.
      if (abortedRef.current || (err instanceof DOMException && err.name === "AbortError")) {
        setMessages((prev) =>
          prev.length > 0 && prev[prev.length - 1].role === "assistant"
            ? prev
            : [...prev, { role: "assistant", content: "_Response stopped._" }]
        );
        return;
      }
      const msg = err instanceof Error ? err.message : "Something went wrong";
      // Prefer the machine code (chatStream throws an ApiError carrying it) over
      // a brittle message-substring match. UPGRADE_REQUIRED = free monthly cap,
      // USER_RATE_LIMITED = per-user RPM cap — both route to the upsell.
      const code = err instanceof ApiError ? err.code : undefined;
      const isUpsell = code === "UPGRADE_REQUIRED" || code === "USER_RATE_LIMITED" ||
        msg.includes("UPGRADE_REQUIRED") || msg.includes("Upgrade to Pro");
      if (isUpsell) {
        setRateLimited(true);
        setMessages((prev) => [...prev, { role: "assistant", content: `You've used your ${FREE_LIMITS.maxChatMessagesPerMonth} free messages for the month. Upgrade to Pro for unlimited AI access.` }]);
      } else {
        setError(msg);
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't process your request. Please try again." }]);
      }
    } finally {
      setLoading(false);
      setSearching(false);
      setPills([]);
      setStreamingReply(false);
      streamedTextRef.current = "";
      abortRef.current = null;
      abortedRef.current = false;
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
    // an ancestor makes it the containing block for position:sticky descendants —
    // which would break the floating input bar's viewport pinning.
    <div style={{ paddingTop: 0, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: 1,
          maxWidth: 840,
          width: "100%",
          margin: "0 auto",
          padding: "28px clamp(20px, 3vw, 40px) 0",
          minHeight: "calc(100vh - 116px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header: logo + glow, title, status, new-chat ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          <div style={{ position: "relative", flexShrink: 0, width: 50, height: 50 }}>
            {/* Soft radial glow behind the leaf — blurred accent-soft, pulsing. */}
            <span
              aria-hidden
              className="mr-orb-pulse"
              style={{
                position: "absolute",
                inset: -10,
                borderRadius: "50%",
                background: "radial-gradient(circle, var(--accent-soft), transparent 70%)",
                filter: "blur(8px)",
                zIndex: 0,
              }}
            />
            <Image
              src={LOGO}
              alt="Maple AI"
              width={50}
              height={50}
              priority
              style={{ position: "relative", zIndex: 1, objectFit: "contain", display: "block" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="display" style={{ fontSize: 26, lineHeight: 1 }}>
              Maple <span style={{ fontStyle: "italic", color: "var(--accent)" }}>AI</span>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: 5,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <span
                aria-hidden
                className="mr-dot-pulse"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--gain)",
                  boxShadow: "0 0 0 3px var(--gain-soft)",
                }}
              />
              Wired to your wallet · Powered by Claude
            </div>
          </div>
          <button
            type="button"
            onClick={startNewConversation}
            disabled={loading}
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 16px",
              borderRadius: 10,
              border: "1px solid var(--rule-strong)",
              background: "var(--surface)",
              color: "var(--ink-2)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              flexShrink: 0,
              transition: "border-color 160ms, color 160ms",
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--ink)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--rule-strong)"; e.currentTarget.style.color = "var(--ink-2)"; }}
          >
            ＋ New chat
          </button>
        </div>

        {/* ── Wallet-context chips ── */}
        {walletCards.length > 0 ? (
          <div
            data-tour-id="maple-chat"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              margin: "16px 0 22px",
              paddingBottom: 18,
              borderBottom: "1px solid var(--rule)",
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 2 }}
            >
              Maple can see
            </span>
            {topCards.map((c) => (
              <span
                key={c.card_id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 11px",
                  borderRadius: 999,
                  border: "1px solid var(--rule)",
                  background: "var(--card-fill)",
                }}
              >
                <IssuerBadge issuer={c.issuer} cardName={c.card_name} size={26} />
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
                  {shortCardName(c.card_name, c.issuer)}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink)" }}>
                  {formatPoints(c.point_balance)}
                </span>
              </span>
            ))}
            {extraCards > 0 && (
              <span
                title={`${extraCards} more card${extraCards === 1 ? "" : "s"} in your wallet`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--rule-strong)",
                  background: "var(--card-fill)",
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", fontWeight: 600 }}>
                  +{extraCards} more
                </span>
              </span>
            )}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 999,
                border: "1px solid var(--accent)",
                background: "var(--accent-soft)",
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                {formatPoints(walletTotal)} total
              </span>
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              margin: "16px 0 22px",
              paddingBottom: 18,
              borderBottom: "1px solid var(--rule)",
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Maple can see
            </span>
            <Link
              href="/wallet"
              className="mono"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", letterSpacing: "0.04em" }}
            >
              Add cards to your wallet for personalised advice →
            </Link>
          </div>
        )}

        {/* Conversation history — signed-in users only (anon chats aren't persisted). */}
        {isAuthenticated && conversations.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <span className="eyebrow">History</span>
            <select
              value={conversationId ?? ""}
              onChange={(e) => { if (e.target.value) openConversation(Number(e.target.value)); }}
              disabled={loading}
              aria-label="Previous conversations"
              className="mono"
              style={{
                flex: 1,
                minWidth: 0,
                maxWidth: 380,
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid var(--rule-strong)",
                background: "var(--surface)",
                color: "var(--ink-2)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <option value="">Pick a past conversation…</option>
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>{conversationLabel(c)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Screen-reader live region: politely announces the COMPLETED
            assistant reply (set on the "done" event), not every token. Visually
            hidden; the ThinkingIndicator's own live region covers the wait. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {liveAnnouncement}
        </div>

        {/* ── Conversation / empty state ── */}
        {messages.length === 0 ? (
          <div
            style={{
              border: "1px solid var(--rule)",
              borderTop: "3px solid var(--accent)",
              borderRadius: 16,
              background: "var(--card-fill-strong)",
              padding: "26px 28px",
            }}
          >
            <span className="eyebrow">From the editor</span>
            <p
              className="serif"
              style={{ fontSize: 17, fontStyle: "italic", lineHeight: 1.5, color: "var(--ink-2)", marginTop: 10 }}
            >
              I&rsquo;m wired to your wallet — your cards, your point balances, your spend history.
              Ask me which card to use, how to transfer points, or how to redeem for a specific trip.
              {!sessionId && (
                <> Add cards in the <Link href="/wallet" style={{ color: "var(--accent)" }}>Wallet</Link> tab for personalised advice.</>
              )}
            </p>

            {/* Tappable starter prompts — tapping one submits it as the user's
                message. Wallet-aware: one chip names a real held card/program. */}
            <div
              role="group"
              aria-label="Suggested questions"
              style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 20 }}
            >
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  disabled={loading || (rateLimited && !isPro)}
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "9px 14px",
                    borderRadius: 999,
                    border: "1px solid var(--rule-strong)",
                    background: "var(--surface)",
                    color: "var(--ink-2)",
                    fontSize: 12,
                    letterSpacing: "0.02em",
                    textAlign: "left",
                    cursor: loading || (rateLimited && !isPro) ? "not-allowed" : "pointer",
                    opacity: loading || (rateLimited && !isPro) ? 0.6 : 1,
                    transition: "border-color 160ms, color 160ms, background 160ms",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !(rateLimited && !isPro)) {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.color = "var(--ink)";
                      e.currentTarget.style.background = "var(--accent-soft)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--rule-strong)";
                    e.currentTarget.style.color = "var(--ink-2)";
                    e.currentTarget.style.background = "var(--surface)";
                  }}
                >
                  <span aria-hidden style={{ color: "var(--accent)" }}>↗</span>
                  {prompt}
                </button>
              ))}
            </div>

            {/* One concrete worked-example preview — shows newcomers exactly the
               shape of answer Maple gives (question → card → math → cashback),
               so the empty state demonstrates value instead of just listing
               prompts. Static + editorial; tapping it runs the example query. */}
            <button
              type="button"
              onClick={() => handleSend("Best card for $80 of groceries?")}
              disabled={loading || (rateLimited && !isPro)}
              aria-label="Try the worked example: Best card for $80 of groceries?"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginTop: 22,
                padding: "16px 18px",
                borderRadius: 12,
                border: "1px solid var(--rule)",
                borderLeft: "3px solid var(--gain)",
                background: "var(--surface)",
                cursor: loading || (rateLimited && !isPro) ? "not-allowed" : "pointer",
                opacity: loading || (rateLimited && !isPro) ? 0.6 : 1,
                transition: "border-color 160ms, background 160ms",
              }}
              onMouseEnter={(e) => {
                if (!loading && !(rateLimited && !isPro)) {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.background = "var(--card-fill)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--rule)";
                e.currentTarget.style.background = "var(--surface)";
              }}
            >
              <span
                className="mono"
                style={{ fontSize: 9, color: "var(--gain)", letterSpacing: "0.10em", textTransform: "uppercase" }}
              >
                A sample answer
              </span>
              <p
                className="serif"
                style={{ fontSize: 15, fontStyle: "italic", lineHeight: 1.55, color: "var(--ink-2)", margin: "8px 0 0" }}
              >
                Ask: <span style={{ color: "var(--ink)", fontStyle: "normal", fontWeight: 600 }}>“Best card for $80 of groceries?”</span>{" "}
                → your <span style={{ color: "var(--accent)", fontStyle: "normal" }}>Cobalt at 5×</span> earns ~400 MR{" "}
                ≈ <span style={{ color: "var(--gain)", fontStyle: "normal", fontWeight: 600 }}>$5.40 back</span> at 1.35¢/pt.
              </p>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div
                    style={{
                      maxWidth: "80%",
                      minWidth: 0,
                      padding: "13px 17px",
                      borderRadius: "16px 16px 4px 16px",
                      background: "var(--accent)",
                      color: "#fff",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    <p
                      className="sans"
                      style={{ fontSize: 15, lineHeight: 1.5, margin: 0, color: "#fff", whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}
                    >
                      {m.content}
                    </p>
                  </div>
                </div>
              ) : (
                <div key={i} style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                  <Image
                    src={LOGO}
                    alt="Maple"
                    width={30}
                    height={30}
                    style={{ objectFit: "contain", flexShrink: 0, marginTop: 2 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="sans chat-message"
                      style={{ fontSize: 15, lineHeight: 1.65, maxWidth: "100%", overflowX: "auto" }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                    {m.result && <ResultGrid result={m.result} />}
                  </div>
                </div>
              )
            )}

            {/* While loading, show the avatar + a status block. Once prose has
               started streaming (streamingReply), the live assistant message is
               already rendered above — so we suppress the rotating
               ThinkingIndicator (the real text replaced it) and only keep the
               tool pills, which can still resolve during tool rounds. The whole
               block hides when streaming AND no pills remain, so the answer reads
               cleanly without a trailing placeholder. */}
            {loading && !(streamingReply && pills.length === 0) && (
              <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                <Image
                  src={LOGO}
                  alt="Maple"
                  width={30}
                  height={30}
                  style={{ objectFit: "contain", flexShrink: 0, marginTop: 2 }}
                />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
                  {/* Animated "thinking" line — only until real prose streams in;
                     once tokens land it would double up under the live text. */}
                  {!streamingReply && <ThinkingIndicator searching={searching} />}
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
              borderRadius: 16,
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
              Free users get {FREE_LIMITS.maxChatMessagesPerMonth} messages per month. Pro members get the full concierge.
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

        {/* ── Floating input bar — sticky, pinned to viewport bottom ── */}
        <div style={{ position: "sticky", bottom: 16, marginTop: "auto", paddingTop: 26, paddingBottom: 16, zIndex: 41 }}>
          <div
            style={{
              border: `1px solid ${researchMode ? "var(--accent)" : "var(--rule-strong)"}`,
              borderRadius: 16,
              background: "var(--surface)",
              boxShadow: "var(--shadow-2)",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={rateLimited && !isPro ? "Free monthly limit reached — upgrade for unlimited" : "Ask Maple anything about your rewards…"}
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
              {loading ? (
                // Stop / abort — aborts the in-flight stream and finalizes the
                // partial reply gracefully (handled in handleSend's catch).
                <button
                  type="button"
                  onClick={handleStop}
                  style={{
                    width: 42,
                    height: 42,
                    flexShrink: 0,
                    borderRadius: 11,
                    background: "var(--surface-2)",
                    color: "var(--ink)",
                    border: "1px solid var(--rule-strong)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 160ms, border-color 160ms",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--rule-strong)"; }}
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: 2, background: "var(--ink)", display: "block" }} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || (rateLimited && !isPro)}
                  style={{
                    width: 42,
                    height: 42,
                    flexShrink: 0,
                    borderRadius: 11,
                    background: input.trim() ? "var(--accent)" : "var(--surface-2)",
                    color: input.trim() ? "#fff" : "var(--ink-3)",
                    border: "none",
                    cursor: input.trim() ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: input.trim() ? "var(--shadow-accent-glow)" : "none",
                    transition: "background 160ms, box-shadow 160ms",
                  }}
                  aria-label="Send"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              )}
            </div>

            {/* Research-mode toggle (only pill) + quiet free-tier quota indicator. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
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
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: researchMode ? "var(--accent-soft)" : "transparent",
                  color: researchMode ? "var(--accent)" : "var(--ink-3)",
                  border: `1px solid ${researchMode ? "var(--accent)" : "var(--rule)"}`,
                  cursor: "pointer",
                  transition: "background 160ms, color 160ms, border-color 160ms",
                }}
              >
                {researchMode ? "● " : ""}Research mode
              </button>
              {/* Soft free-tier indicator. Shows remaining count instead of
                  hard-disabling the input — user can still compose and only
                  hits friction at send time. Hidden for Pro members. */}
              {!isPro && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
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
                  ) : isAuthenticated ? (
                    <>Free tier · {FREE_LIMITS.maxChatMessagesPerMonth} messages/month</>
                  ) : (
                    <>
                      Free tier ·{" "}
                      <Link href="/login?redirect=/chat" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                        Sign in to save your chats
                      </Link>
                    </>
                  )}
                </span>
              )}
            </div>
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
        /* Loading dots inside in-flight tool-status pills. */
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

// 3-up structured result grid: Points / Cash / Value-per-pt. Rendered only when
// a `result` event arrived for the assistant message. value_per_pt_cents is
// ALREADY cents-per-point — render as-is with a ¢ suffix (do not transform).
function ResultGrid({ result }: { result: ChatResult }) {
  const pointsLabel = Number.isFinite(result.points) ? result.points.toLocaleString("en-CA") : "—";
  const cashLabel = Number.isFinite(result.cash_cad)
    ? `$${result.cash_cad.toLocaleString("en-CA", { maximumFractionDigits: 0 })}`
    : "—";
  const valueLabel = Number.isFinite(result.value_per_pt_cents) ? `${result.value_per_pt_cents}¢` : "—";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
      <div style={{ border: "1px solid var(--rule)", borderRadius: 12, padding: "14px 16px", background: "var(--card-fill)" }}>
        <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Points</div>
        <div className="display" style={{ fontSize: 24, marginTop: 4 }}>{pointsLabel}</div>
      </div>
      <div style={{ border: "1px solid var(--rule)", borderRadius: 12, padding: "14px 16px", background: "var(--card-fill)" }}>
        <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Cash</div>
        <div className="display" style={{ fontSize: 24, marginTop: 4 }}>{cashLabel}</div>
      </div>
      <div style={{ border: "1px solid var(--gain)", borderRadius: 12, padding: "14px 16px", background: "var(--gain-soft)" }}>
        <div className="mono" style={{ fontSize: 9, color: "var(--gain)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Value / pt</div>
        <div className="display" style={{ fontSize: 24, marginTop: 4, color: "var(--gain)" }}>{valueLabel}</div>
      </div>
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
