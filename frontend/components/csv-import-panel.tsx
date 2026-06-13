"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { previewCSVImport, commitCSVImport } from "@/lib/api";
import type { CSVPreviewResponse } from "@/lib/api";
import { Upload, AlertTriangle, Check } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
 * CSVImportPanel — drag a Canadian-bank statement onto Maple, get a preview,
 * confirm the card, commit. Each row is auto-categorized server-side from
 * the merchant description (Cobalt 5× on Metro, 1× on Walmart, etc.) and
 * fed through WalletService.LogSpend so points + dollar value populate the
 * wallet, insights, and portfolio automatically.
 *
 * Two-step flow: Preview (server parses + categorizes, no DB write) →
 * Commit (server re-parses + writes). The frontend never picks per-row
 * categories — that's what the categorizer is for.
 * ───────────────────────────────────────────────────────────────────────── */

const CATEGORY_LABEL: Record<string, string> = {
  groceries: "Groceries",
  dining: "Dining",
  travel: "Travel",
  "gas-transit": "Gas & transit",
  pharmacy: "Pharmacy",
  entertainment: "Entertainment",
  "streaming-digital": "Streaming",
  "online-shopping": "Online shopping",
  "recurring-bills": "Recurring bills",
  "everything-else": "Other",
};

const CATEGORY_TONE: Record<string, string> = {
  groceries: "var(--gain)",
  dining: "var(--accent)",
  travel: "#0EA5E9",
  "gas-transit": "#A855F7",
  pharmacy: "#10B981",
  entertainment: "#F97316",
  "streaming-digital": "#EC4899",
  "online-shopping": "#6366F1",
  "recurring-bills": "#64748B",
  "everything-else": "var(--ink-3)",
};

export function CSVImportPanel() {
  const { sessionId } = useSession();
  const { wallet } = useWallet();
  const [csv, setCSV] = useState("");
  const [preview, setPreview] = useState<CSVPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; error?: string } | null>(null);
  const [cardId, setCardId] = useState("");

  useEffect(() => {
    if (wallet.length > 0 && !cardId) setCardId(wallet[0].card_id);
  }, [wallet, cardId]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setDone(null);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = () => setCSV(String(reader.result || ""));
    reader.onerror = () => setErr("Could not read file");
    reader.readAsText(file);
  }

  async function runPreview() {
    if (!csv.trim() || !sessionId) return;
    setLoading(true);
    setErr(null);
    try {
      setPreview(await previewCSVImport(sessionId, csv));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function runCommit() {
    if (!csv.trim() || !sessionId || !cardId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await commitCSVImport(sessionId, csv, cardId);
      setDone(res);
      setCSV("");
      setPreview(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        border: "1px solid var(--rule)",
        background: "var(--card-fill)",
        borderRadius: 14,
        padding: "20px 24px",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <span className="eyebrow" style={{ color: "var(--accent)" }}>Import statement</span>
        <h3
          className="display"
          style={{ fontSize: 22, margin: "6px 0 4px", lineHeight: 1.15, fontStyle: "italic" }}
        >
          Bulk-import a CSV statement.
        </h3>
        <p className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.45, margin: 0 }}>
          Drag a CSV exported from RBC, TD, Scotia, BMO, Amex, or Tangerine.
          We parse the columns, drop credits, and write each transaction to your
          spend log so the missed-rewards report lights up.
        </p>
      </header>

      {/* Drop zone */}
      <label
        htmlFor="mr-csv-input"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "26px 18px",
          border: "1.5px dashed var(--rule-strong)",
          borderRadius: 12,
          background: csv ? "var(--accent-soft)" : "transparent",
          color: csv ? "var(--accent)" : "var(--ink-2)",
          cursor: "pointer",
          transition: "background 160ms",
        }}
      >
        <Upload size={20} />
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase" }}>
          {csv ? "CSV loaded — pick a file again to replace" : "Drop CSV here or click to choose"}
        </span>
        <input
          id="mr-csv-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            // Reset so picking the same file again (e.g. right after a commit)
            // still fires a change event.
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
      </label>

      {csv && !preview && (
        <button
          onClick={runPreview}
          disabled={loading}
          className="mono"
          style={{ ...ctaStyle, marginTop: 14, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Parsing…" : "Preview parse →"}
        </button>
      )}

      {err && (
        <div role="alert" style={{ marginTop: 12, color: "var(--loss)", fontSize: 13 }} className="serif">
          <AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          {err}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 10, border: "1px solid var(--rule)", background: "var(--surface)" }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", marginBottom: 10 }}>
            Detected: <strong style={{ color: "var(--ink)" }}>{preview.parsed_rows}</strong> spend rows of{" "}
            {preview.total_rows} total. Columns: {Object.keys(preview.detected_columns).join(", ")}
          </div>

          {preview.samples && preview.samples.length > 0 && (
            <table style={{ width: "100%", fontSize: 12, marginBottom: 12 }} className="mono">
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-3)" }}>
                  <th style={{ padding: "4px 6px" }}>Date</th>
                  <th style={{ padding: "4px 6px" }}>Description</th>
                  <th style={{ padding: "4px 6px" }}>Auto-category</th>
                  <th style={{ padding: "4px 6px", textAlign: "right" }}>Amount (CAD)</th>
                </tr>
              </thead>
              <tbody>
                {preview.samples.map((s, i) => {
                  const tone = CATEGORY_TONE[s.category] ?? "var(--ink-3)";
                  const label = CATEGORY_LABEL[s.category] ?? s.category;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid var(--rule)" }}>
                      <td style={{ padding: "6px" }}>{s.date}</td>
                      <td style={{ padding: "6px", color: "var(--ink-2)" }}>{s.description}</td>
                      <td style={{ padding: "6px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: `1px solid ${tone}`,
                            color: tone,
                            fontSize: 10,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          {label}
                        </span>
                      </td>
                      <td style={{ padding: "6px", textAlign: "right" }}>
                        ${s.amount.toFixed(2)}
                        {s.original_currency && s.original_amount ? (
                          <div
                            className="mono"
                            style={{
                              fontSize: 9,
                              color: "var(--ink-3)",
                              letterSpacing: "0.04em",
                              marginTop: 2,
                            }}
                            title={`Converted from ${s.original_currency} to CAD via 2026-05 rate snapshot`}
                          >
                            {s.original_amount.toLocaleString("en-CA")} {s.original_currency}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {preview.warnings && preview.warnings.length > 0 && (
            <details style={{ marginBottom: 12 }}>
              <summary className="mono" style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer", letterSpacing: "0.06em" }}>
                {preview.warnings.length} parse warning{preview.warnings.length === 1 ? "" : "s"}
              </summary>
              <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 11, color: "var(--ink-3)" }}>
                {preview.warnings.slice(0, 10).map((w, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Card picker — category is per-row, no need to pick. */}
          <div style={{ marginBottom: 12 }}>
            <label className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
              These transactions are from
            </label>
            <select value={cardId} onChange={(e) => setCardId(e.target.value)} style={fieldStyle}>
              <option value="">Pick the card whose statement this is</option>
              {wallet.map((uc) => (
                <option key={uc.id} value={uc.card_id}>{uc.card?.name ?? "Unknown"}</option>
              ))}
            </select>
          </div>

          <button
            onClick={runCommit}
            disabled={loading || !cardId || preview.parsed_rows === 0}
            className="mono"
            style={{
              ...ctaStyle,
              opacity: loading || !cardId || preview.parsed_rows === 0 ? 0.5 : 1,
            }}
          >
            {loading ? "Importing…" : `Import ${preview.parsed_rows} transactions →`}
          </button>
          <p className="mono" style={{ marginTop: 8, fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
            Each row is auto-categorized from the merchant name (Cobalt earns 5× on Metro,
            1× on Walmart, etc.). Points and dollar value land in your wallet, insights, and
            portfolio automatically &mdash; nothing else to do.
          </p>
        </div>
      )}

      {done && (
        <div
          role="status"
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${done.error ? "var(--accent)" : "var(--gain)"}`,
            background: done.error ? "var(--accent-soft)" : "var(--gain-soft)",
            color: done.error ? "var(--accent)" : "var(--gain)",
          }}
          className="serif"
        >
          <Check size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          {done.created === 0 && !done.error ? (
            <>0 new — these look like duplicates of transactions already in your ledger.</>
          ) : (
            <>
              Imported {done.created} transactions{done.error ? ` (then errored: ${done.error})` : ""}.
              Visit Pro Tools → Missed-rewards forensics to see the report.
            </>
          )}
        </div>
      )}
    </section>
  );
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
};

const ctaStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 22px",
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
};
