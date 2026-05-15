"use client";

import { useEffect, useState } from "react";
import { listIssuerChanges } from "@/lib/api";
import type { IssuerPageChange } from "@/lib/types";

/* ─────────────────────────────────────────────────────────────────────────────
 * IssuerChangesTile — live feed of changes detected on Canadian issuer pages
 * by the diff-watch cron worker. The strongest editorial moat in Canadian
 * rewards is being first to news; this turns "did the Cobalt page change?"
 * from a manual blog vigil into an automatic signal.
 *
 * Each change shows: detected timestamp, source page, AI-summarized headline,
 * link to the source page, and (collapsible) the raw diff snippet for users
 * who want to see what actually moved.
 * ───────────────────────────────────────────────────────────────────────── */

export function IssuerChangesTile() {
  const [changes, setChanges] = useState<IssuerPageChange[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    listIssuerChanges(20)
      .then(setChanges)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load issuer changes"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section style={{ marginBottom: 22 }}>
      <header style={{ marginBottom: 18, display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>Issuer-page watch</span>
            <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
          </div>
          <h2
            className="display"
            style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}
          >
            What <span style={{ fontStyle: "italic" }}>changed</span> on the issuer pages.
          </h2>
          <p
            className="serif"
            style={{ marginTop: 8, fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", maxWidth: 680, lineHeight: 1.45 }}
          >
            A daily diff-watch on every Canadian issuer card page we monitor. When a welcome
            bonus shifts, an earn rate quietly drops, or a new credit appears, you hear about it
            here &mdash; usually before US blogs notice the Canadian-specific change.
          </p>
        </div>
      </header>

      <div
        style={{
          border: "1px solid var(--rule)",
          background: "var(--card-fill-strong)",
          borderRadius: 14,
          padding: "20px 22px",
          boxShadow: "var(--shadow-1)",
        }}
      >
        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading the desk…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}
        {!loading && !err && changes && changes.length === 0 && (
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)", fontSize: 14, margin: 0 }}>
            No detected changes yet. The worker runs daily &mdash; check back tomorrow.
          </p>
        )}
        {!loading && !err && changes && changes.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, borderTop: "1px solid var(--rule)" }}>
            {changes.map((c) => {
              const open = expanded.has(c.id);
              const detected = new Date(c.detected_at);
              const dateLabel = detected.toLocaleDateString("en-CA", {
                month: "short", day: "numeric", year: "numeric",
              });
              return (
                <li
                  key={c.id}
                  style={{
                    padding: "16px 0",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 16,
                      alignItems: "baseline",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="display" style={{ fontSize: 17, lineHeight: 1.25, color: "var(--ink)" }}>
                        {c.diff_summary}
                      </div>
                      <div
                        className="serif"
                        style={{ marginTop: 4, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}
                      >
                        <a href={c.page_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                          {c.page_label}
                        </a>
                        {" · "}
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                          {dateLabel}
                        </span>
                        {c.ai_confidence != null && (
                          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 8 }}>
                            · {Math.round(c.ai_confidence * 100)}% AI confidence
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="mono"
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: "1px solid var(--rule-strong)",
                        background: "transparent",
                        color: "var(--ink-2)",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      {open ? "Hide diff" : "Show diff"}
                    </button>
                  </div>
                  {open && (
                    <pre
                      className="mono"
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 8,
                        background: "var(--card-fill)",
                        border: "1px solid var(--rule)",
                        fontSize: 11,
                        color: "var(--ink-2)",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: 240,
                        overflowY: "auto",
                      }}
                    >
                      {c.diff_snippet}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p
          className="mono"
          style={{ marginTop: 14, fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}
        >
          Diffs are auto-detected by the cron worker; AI summary is a guideline, not gospel.
          Open the source page to confirm before acting on a change.
        </p>
      </div>
    </section>
  );
}
