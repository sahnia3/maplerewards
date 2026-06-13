"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getCompare, type CompareResponse } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";
import { EditorialCardVisual } from "@/components/editorial/editorial-card";
import { cardImageUrl } from "@/lib/card-images";
import { ApplyButton } from "@/components/cards/ApplyButton";

/**
 * /compare/[a]/[b] — side-by-side comparison for any two Canadian cards.
 *
 * Public page (no auth). Generates ~5,151 unique URL combinations from the
 * 102-card catalog. Each page is the answer to a high-intent search query
 * like "amex cobalt vs scotia gold" or "td aeroplan vs cibc aventura".
 *
 * Schema.org Product markup helps search engines understand the page is a
 * structured comparison, not editorial.
 */
export default function CompareTwoCards({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = use(params);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getCompare(a, b)
      .then((d) => setData(d))
      .catch((e) => setErr(e?.message ?? "Could not load comparison"));
  }, [a, b]);

  if (err) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <h1 className="display" style={{ fontSize: 32, marginBottom: 12 }}>
          Couldn&rsquo;t load that comparison
        </h1>
        <p style={{ color: "var(--ink-2)" }}>{err}</p>
        <Link href="/cards" style={{ color: "var(--accent)" }}>
          ← Back to the card catalog
        </Link>
      </main>
    );
  }
  if (!data) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <p className="eyebrow" style={{ color: "var(--ink-3)" }}>
          LOADING COMPARISON…
        </p>
      </main>
    );
  }

  const aCard = data.a.card;
  const bCard = data.b.card;
  const diff = data.diff;

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "32px clamp(20px, 4vw, 60px) 80px",
        }}
      >
        <PageMasthead
          eyebrow={`${aCard.issuer} · vs · ${bCard.issuer}`}
          eyebrowEnd="Canadian rewards comparison"
          title={
            <>
              <span style={{ fontStyle: "italic" }}>{aCard.name}</span>{" "}
              <span style={{ color: "var(--ink-3)" }}>vs</span>{" "}
              <span style={{ fontStyle: "italic" }}>{bCard.name}</span>
            </>
          }
          lede={buildVerdict(data)}
        />

        <LeafDivider />

        {/* ── Headline metrics grid ──────────────────────────── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 28,
            marginBottom: 36,
          }}
          className="compare-headline"
        >
          <CardColumn detail={data.a} winner={winnerOf("a", diff)} />
          <CardColumn detail={data.b} winner={winnerOf("b", diff)} />
        </section>

        <LeafDivider />

        {/* ── Side-by-side spec table ───────────────────────── */}
        <h2
          className="display"
          style={{
            fontSize: "clamp(20px, 2.2vw, 28px)",
            marginBottom: 16,
          }}
        >
          The numbers
        </h2>
        <SpecTable a={data.a} b={data.b} diff={diff} />

        {/* ── Category breakdown ────────────────────────────── */}
        <h2
          className="display"
          style={{
            fontSize: "clamp(20px, 2.2vw, 28px)",
            marginTop: 36,
            marginBottom: 16,
          }}
        >
          Where each wins
        </h2>
        <CategoryWinners diff={diff} a={aCard.name} b={bCard.name} />

        {/* ── Schema.org Product markup for SEO ─────────────── */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // Escape </script> breakout and JS line separators. JSON.stringify
            // does NOT escape <, >, & or U+2028/U+2029, so a card name like
            // "</script><script>…" would break out of this inline block.
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: `${aCard.name} vs ${bCard.name}`,
              itemListElement: [
                {
                  "@type": "Product",
                  position: 1,
                  name: aCard.name,
                  brand: aCard.issuer,
                  description: `${aCard.name} is a Canadian credit card from ${aCard.issuer}.`,
                },
                {
                  "@type": "Product",
                  position: 2,
                  name: bCard.name,
                  brand: bCard.issuer,
                  description: `${bCard.name} is a Canadian credit card from ${bCard.issuer}.`,
                },
              ],
            })
              .replace(/</g, "\\u003c")
              .replace(/>/g, "\\u003e")
              .replace(/&/g, "\\u0026")
              .replace(/\u2028/g, "\\u2028")
              .replace(/\u2029/g, "\\u2029"),
          }}
        />
      </div>
    </div>
  );
}

function buildVerdict(d: CompareResponse): string {
  const a = d.a.card.name;
  const b = d.b.card.name;
  if (d.diff.better_welcome_bonus === "a" && d.diff.better_annual_fee === "a") {
    return `The ${a} wins on both annual fee and welcome bonus. Below: the full spec sheet.`;
  }
  if (d.diff.better_welcome_bonus === "b" && d.diff.better_annual_fee === "b") {
    return `The ${b} wins on both annual fee and welcome bonus. Below: the full spec sheet.`;
  }
  return `Two Canadian cards, two strategies. Below: the full spec sheet so you can decide.`;
}

function winnerOf(side: "a" | "b", diff: CompareResponse["diff"]): boolean {
  const wins = [diff.better_annual_fee, diff.better_welcome_bonus, diff.base_cpp_winner].filter(
    (v) => v === side,
  ).length;
  return wins >= 2;
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function CardColumn({
  detail,
  winner,
}: {
  detail: CompareResponse["a"];
  winner: boolean;
}) {
  const c = detail.card;
  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 12,
        padding: 24,
        background: winner ? "var(--accent-wash, rgba(165,31,45,0.06))" : "var(--paper)",
        position: "relative",
      }}
    >
      {winner && (
        <span
          className="eyebrow"
          style={{
            position: "absolute",
            top: 14,
            right: 18,
            color: "var(--accent)",
            background: "var(--paper)",
            padding: "2px 8px",
            borderRadius: 4,
            border: "1px solid var(--accent)",
          }}
        >
          BETTER ON BALANCE
        </span>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 18,
        }}
      >
        <EditorialCardVisual
          card={{
            name: c.name,
            issuer: c.issuer,
            network: c.network,
            imageUrl: cardImageUrl(c.name),
          }}
          size="sm"
        />
      </div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {c.issuer} · {c.network}
      </div>
      <h3
        className="display"
        style={{
          fontSize: "clamp(22px, 2.4vw, 30px)",
          lineHeight: 1.2,
          marginBottom: 14,
        }}
      >
        {c.name}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
          fontSize: 13,
        }}
      >
        <Stat label="Annual fee" value={`$${c.annual_fee.toFixed(0)}`} />
        <Stat
          label="Welcome bonus"
          value={c.welcome_bonus_points.toLocaleString() + " pts"}
        />
        <Stat
          label="Min. spend"
          value={
            c.welcome_bonus_min_spend
              ? `$${c.welcome_bonus_min_spend.toLocaleString()}`
              : "—"
          }
        />
        <Stat label="CPP floor" value={`${(detail.value_range_low ?? 0).toFixed(2)}¢`} />
      </div>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <ApplyButton
          cardId={c.id}
          cardName={c.name}
          hasAffiliate={Boolean(c.affiliate_url)}
          size="sm"
        />
        <Link
          href={`/cards/${c.id}`}
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          Full {c.name} detail →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div className="display" style={{ fontSize: 22, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function SpecTable({
  a,
  b,
  diff,
}: {
  a: CompareResponse["a"];
  b: CompareResponse["b"];
  diff: CompareResponse["diff"];
}) {
  const rows: Array<{
    label: string;
    aValue: string;
    bValue: string;
    winner?: "a" | "b" | "tie";
  }> = [
    {
      label: "Annual fee",
      aValue: `$${a.card.annual_fee.toFixed(0)}`,
      bValue: `$${b.card.annual_fee.toFixed(0)}`,
      winner: diff.better_annual_fee,
    },
    {
      label: "Welcome bonus",
      aValue: `${a.card.welcome_bonus_points.toLocaleString()} pts`,
      bValue: `${b.card.welcome_bonus_points.toLocaleString()} pts`,
      winner: diff.better_welcome_bonus,
    },
    {
      label: "Issuer",
      aValue: a.card.issuer,
      bValue: b.card.issuer,
    },
    {
      label: "Network",
      aValue: a.card.network,
      bValue: b.card.network,
    },
    {
      label: "Loyalty program",
      aValue: a.card.loyalty_program?.name ?? "—",
      bValue: b.card.loyalty_program?.name ?? "—",
    },
    {
      label: "Base CPP",
      aValue: `${(a.card.loyalty_program?.base_cpp ?? 0).toFixed(2)}¢`,
      bValue: `${(b.card.loyalty_program?.base_cpp ?? 0).toFixed(2)}¢`,
      winner: diff.base_cpp_winner,
    },
    {
      label: "Transfer partners",
      aValue: String(a.transfer_partners?.length ?? 0),
      bValue: String(b.transfer_partners?.length ?? 0),
    },
  ];

  return (
    <div className="m-scroll-x">
      <table
        style={{
          width: "100%",
          minWidth: 520,
          borderCollapse: "collapse",
          fontSize: 14,
        }}
      >
        <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "10px 14px", color: "var(--ink-3)", borderBottom: "1px solid var(--ink)" }}>
            Spec
          </th>
          <th style={{ textAlign: "right", padding: "10px 14px", borderBottom: "1px solid var(--ink)" }}>
            {a.card.name}
          </th>
          <th style={{ textAlign: "right", padding: "10px 14px", borderBottom: "1px solid var(--ink)" }}>
            {b.card.name}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--rule)" }}>
            <td style={{ padding: "12px 14px", color: "var(--ink-2)" }}>{row.label}</td>
            <td
              style={{
                padding: "12px 14px",
                textAlign: "right",
                color: row.winner === "a" ? "var(--accent)" : "var(--ink)",
                fontWeight: row.winner === "a" ? 600 : 400,
              }}
            >
              {row.aValue}
              {row.winner === "a" && (
                <span style={{ marginLeft: 6, fontSize: 10 }}>●</span>
              )}
            </td>
            <td
              style={{
                padding: "12px 14px",
                textAlign: "right",
                color: row.winner === "b" ? "var(--accent)" : "var(--ink)",
                fontWeight: row.winner === "b" ? 600 : 400,
              }}
            >
              {row.bValue}
              {row.winner === "b" && (
                <span style={{ marginLeft: 6, fontSize: 10 }}>●</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}

function CategoryWinners({
  diff,
  a,
  b,
}: {
  diff: CompareResponse["diff"];
  a: string;
  b: string;
}) {
  const aWins = diff.categories_where_a_wins ?? [];
  const bWins = diff.categories_where_b_wins ?? [];
  if (aWins.length === 0 && bWins.length === 0) {
    return (
      <p style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
        Neither card carries a category bonus multiplier above 1× — they earn
        the same flat rate everywhere.
      </p>
    );
  }
  return (
    <div
      className="compare-cards"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
      }}
    >
      <CategoryColumn title={a} categories={aWins} />
      <CategoryColumn title={b} categories={bWins} />
    </div>
  );
}

function CategoryColumn({ title, categories }: { title: string; categories: string[] }) {
  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 10,
        padding: 20,
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {title} wins on
      </div>
      {categories.length === 0 ? (
        <p style={{ color: "var(--ink-3)", fontStyle: "italic", fontSize: 13 }}>
          No category-bonus wins.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {categories.map((c) => (
            <li
              key={c}
              style={{
                padding: "6px 0",
                borderBottom: "1px solid var(--rule)",
                textTransform: "capitalize",
                fontSize: 14,
              }}
            >
              {c.replace(/-/g, " ")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
