"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { getTransferSweetSpots } from "@/lib/api";
import type { TransferSweetSpotReport, TransferSweetSpotSource } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { ExportButton, Stat, fmtCAD, fmtCAD2, progLabel, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

function ptsLabel(n: number) {
  return `${n.toLocaleString("en-CA")} pts`;
}

function SourceRow({ src }: { src: TransferSweetSpotSource }) {
  const best = src.best_transfer;
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="display" style={{ fontSize: 16, color: "var(--ink)" }}>{progLabel(src.program_slug)}</div>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {ptsLabel(src.points)} · keep {fmtCAD(src.keep_value_cad)}
        </span>
      </div>

      {best ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <ArrowLeftRight size={13} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden />
            <span className="serif" style={{ fontSize: 14, color: "var(--ink-2)" }}>
              Transfer to <strong style={{ color: "var(--ink)" }}>{progLabel(best.to_program_slug)}</strong>
              {best.transfer_ratio !== 1 && (
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}> ({best.transfer_ratio}:1)</span>
              )}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>
            {ptsLabel(best.transferred_points)} → worth {fmtCAD(best.transfer_value_cad)} ·{" "}
            <span style={{ color: "var(--gain)", fontWeight: 600 }}>+{fmtCAD2(best.uplift_cad)} uplift</span>
          </div>
          {best.min_transfer > 0 && (
            <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4 }}>
              Min {best.min_transfer.toLocaleString("en-CA")} pts to transfer
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <Link
              href={`/loyalty/${best.to_program_slug}`}
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: "0.02em",
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              See how to redeem {progLabel(best.to_program_slug)}
              <ArrowRight size={12} aria-hidden style={{ flexShrink: 0 }} />
            </Link>
          </div>
          {best.bonus_label && (
            <div
              className="mono"
              style={{
                display: "inline-block",
                marginTop: 6,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: "var(--gain)",
                background: "rgba(26,122,58,0.10)",
                border: "1px solid var(--gain)",
                borderRadius: 999,
                padding: "2px 10px",
              }}
            >
              {best.bonus_label}
            </div>
          )}
        </>
      ) : (
        <p className="serif" style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "6px 0 0", lineHeight: 1.5 }}>
          {src.all_transfers.some((t) => !t.eligible)
            ? "No worthwhile transfer yet — you're below the minimum transfer amount on the partners that would add value."
            : "Keeping these points is worth more than any transfer we track for this program."}
        </p>
      )}
    </div>
  );
}

export function TransferSweetSpotsTile({ sessionId, isReady }: Props) {
  const [report, setReport] = useState<TransferSweetSpotReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    getTransferSweetSpots(sessionId)
      .then(setReport)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load transfer sweet-spots"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  const sweetSpots = report?.sources.filter((s) => s.best_transfer != null).length ?? 0;

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="stack"
        eyebrow="Transfer sweet-spots"
        title={<>Move points where they&apos;re <span style={{ fontStyle: "italic" }}>worth more</span>.</>}
        accent
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          For every program you hold points in, Maple checks each transfer partner and surfaces the move that most increases value over leaving the points where they sit.
        </p>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Scanning your balances…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && report && report.sources.length === 0 && (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transferable balances yet"
            body="Add cards or loyalty accounts with points in programs that have transfer partners — then Maple can find the value-increasing moves."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        )}

        {!loading && !err && report && report.sources.length > 0 && (
          <>
            <div
              className="protool-stat-row"
              style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--card-fill)", marginBottom: 16 }}
            >
              <Stat label="Sweet spots" value={String(sweetSpots)} />
              <Stat label="Potential uplift" value={fmtCAD(report.total_potential_uplift_cad)} last />
            </div>

            {report.sources.map((s) => (
              <SourceRow key={s.program_slug} src={s} />
            ))}

            {report.note && (
              <p
                className="serif"
                style={{ marginTop: 14, marginBottom: 0, fontSize: 12.5, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.5 }}
              >
                {report.note}
              </p>
            )}

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <ExportButton sessionId={sessionId} report="sweet-spots" label="Export sweet-spots" />
            </div>
          </>
        )}
      </PaperTile>
    </section>
  );
}
