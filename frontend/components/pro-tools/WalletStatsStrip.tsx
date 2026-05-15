"use client";

interface WalletEntry { card_id: string; point_balance: number }

/** Coarse wallet stats band — always visible on /pro-tools for Pros. */
export function WalletStatsStrip({ wallet }: { wallet: WalletEntry[] }) {
  const cardCount = wallet.length;
  const totalPoints = wallet.reduce((s, c) => s + (c.point_balance ?? 0), 0);
  const stats = [
    { label: "Cards in wallet", value: cardCount.toString(), sub: cardCount === 0 ? "add cards on /wallet" : "tracked" },
    { label: "Tracked points", value: totalPoints >= 1000 ? `${(totalPoints / 1000).toFixed(1)}K` : totalPoints.toString(), sub: "across programs", tone: "var(--accent)" },
    { label: "Tools live", value: "14", sub: "Canada-first" },
    { label: "Currency", value: "CAD", sub: "always priced", tone: "var(--ink-3)" },
  ];
  return (
    <section
      className="protools-hero"
      style={{
        marginTop: 4,
        marginBottom: 18,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 0,
        border: "1px solid var(--rule)",
        borderRadius: 14,
        background: "var(--card-fill)",
        overflow: "hidden",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          style={{
            padding: "16px 18px",
            borderRight: i < stats.length - 1 ? "1px solid var(--rule)" : "none",
          }}
        >
          <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6, color: "var(--ink-3)", letterSpacing: "0.14em" }}>
            {s.label}
          </div>
          <div
            className="display"
            style={{ fontSize: 26, lineHeight: 1.05, color: s.tone ?? "var(--ink)", letterSpacing: "-0.005em" }}
          >
            {s.value}
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.04em" }}>
            {s.sub}
          </div>
        </div>
      ))}
    </section>
  );
}
