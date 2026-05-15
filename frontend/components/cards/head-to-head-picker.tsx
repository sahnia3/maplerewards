"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import type { Card } from "@/lib/types";

/**
 * HeadToHeadPicker — two dropdowns + a Compare button.
 *
 * Drives the head-to-head comparison page at /compare/[a]/[b] by URL-slugging
 * the picked card names. The same slug regex the backend's SQL uses lives in
 * `nameSlug()` below so frontend ↔ backend always produce identical paths.
 *
 * Designed to be droppable anywhere a `Card[]` is in scope (most prominently
 * the top of /cards, but also the welcome card detail page).
 */
export function HeadToHeadPicker({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");

  // Stable alphabetical sort so users can scan two long select lists.
  const sorted = useMemo(
    () => [...cards].sort((x, y) => x.name.localeCompare(y.name)),
    [cards],
  );

  const a = sorted.find((c) => c.id === aId);
  const b = sorted.find((c) => c.id === bId);
  const canCompare = a && b && a.id !== b.id;

  function go() {
    if (!a || !b) return;
    router.push(`/compare/${nameSlug(a.name)}/${nameSlug(b.name)}`);
  }

  return (
    <section
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Head-to-head compare
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr auto",
          gap: 12,
          alignItems: "center",
        }}
        className="h2h-picker"
      >
        <select
          aria-label="First card"
          value={aId}
          onChange={(e) => setAId(e.target.value)}
          className="input-maple"
          style={selectStyle}
        >
          <option value="">Pick a card…</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id} disabled={c.id === bId}>
              {c.name}
            </option>
          ))}
        </select>
        <ArrowLeftRight size={16} color="var(--ink-3)" aria-hidden />
        <select
          aria-label="Second card"
          value={bId}
          onChange={(e) => setBId(e.target.value)}
          className="input-maple"
          style={selectStyle}
        >
          <option value="">Pick another…</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id} disabled={c.id === aId}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={go}
          disabled={!canCompare}
          className="mono"
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            background: canCompare ? "var(--accent)" : "var(--surface-2)",
            color: canCompare ? "#fff" : "var(--ink-3)",
            border: "none",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: canCompare ? "pointer" : "not-allowed",
            whiteSpace: "nowrap",
          }}
        >
          Compare →
        </button>
      </div>
    </section>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontFamily: "var(--font-jetbrains-mono)",
  fontSize: 13,
  borderRadius: 8,
  minWidth: 0,
};

/**
 * nameSlug mirrors the backend `lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))`
 * exactly so a slug produced here always resolves on the server.
 */
function nameSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
