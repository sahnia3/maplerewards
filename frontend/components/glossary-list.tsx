"use client";

import { GLOSSARY } from "@/lib/glossary";

/* Renders the GLOSSARY map (single source of truth in lib/glossary.ts). Falls
 * back to the tooltip label/definition when an entry has no longer reference
 * copy. */
const ENTRIES = Object.values(GLOSSARY)
  .map((e) => ({ full: e.full ?? e.label, detail: e.detail ?? e.definition }))
  .sort((a, b) => a.full.localeCompare(b.full));

export function GlossaryList() {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 16,
        margin: 0,
      }}
    >
      {ENTRIES.map((def) => (
        <div
          key={def.full}
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 14,
            background: "var(--card-fill)",
            padding: "20px 22px",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <dt className="display" style={{ fontSize: 20, color: "var(--ink)", lineHeight: 1.15, margin: 0 }}>
            {def.full}
          </dt>
          <dd
            className="serif"
            style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.55, marginTop: 8, marginLeft: 0 }}
          >
            {def.detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}
