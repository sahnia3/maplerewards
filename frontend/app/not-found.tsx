/* ─────────────────────────────────────────────────────────────────────────────
 * Custom 404. App Router renders this for unmatched routes (and for any
 * notFound() call). It renders inside the root layout, so the app shell + nav
 * stay intact — this is a server component (no client hooks needed), keeping it
 * lightweight.
 * ───────────────────────────────────────────────────────────────────────────── */

import Link from "next/link";

export const metadata = {
  title: "Page not found · Maple Rewards",
};

export default function NotFound() {
  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "clamp(48px, 12vh, 120px) clamp(20px, 4vw, 40px)",
        textAlign: "center",
      }}
    >
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>
        Error 404 · off the map
      </div>
      <h1
        className="display"
        style={{ fontSize: "clamp(48px, 9vw, 96px)", lineHeight: 0.92, margin: "0 0 16px" }}
      >
        This route
        <br />
        <span style={{ fontStyle: "italic", color: "var(--accent)" }}>doesn&rsquo;t</span> exist.
      </h1>
      <p
        className="serif"
        style={{
          fontSize: 16,
          fontStyle: "italic",
          color: "var(--ink-2)",
          lineHeight: 1.55,
          margin: "0 0 28px",
        }}
      >
        The page you&rsquo;re after has moved or never existed. Your wallet, cards and
        optimizer are all still where you left them.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/" className="btn btn-primary">
          Back home
        </Link>
        <Link href="/cards" className="btn btn-ghost">
          Browse cards
        </Link>
      </div>
    </div>
  );
}
