import Link from "next/link";
import { MessageCircle, Wrench } from "lucide-react";

// Trip Planner was retired: the live award pipeline returned stale point/cash
// values for some routes (e.g. YYZ→LHR), so rather than surface unverified
// flight data we removed the standalone planner. Award-search questions are now
// handled conversationally by Maple AI, which can pull live availability and
// explain the trade-offs. The original implementation is preserved untouched in
// `page.original.tsx` — restore it by renaming that file back to `page.tsx` and
// re-adding a nav entry in components/layout/sidebar.tsx.
//
// We render an honest "this has moved" page (rather than a silent redirect) so
// anyone landing here from an old link or bookmark understands what changed and
// where to go next.
export default function TripPlannerPage() {
  return (
    <div
      className="mx-auto flex flex-col items-start"
      style={{ maxWidth: 560, padding: "64px 24px" }}
    >
      <span className="eyebrow" style={{ letterSpacing: "0.14em" }}>
        Trip Planner
      </span>
      <h1
        className="display"
        style={{ fontSize: 34, lineHeight: 1.1, marginTop: 12, color: "var(--ink)" }}
      >
        This has moved
      </h1>
      <p
        className="serif"
        style={{
          marginTop: 16,
          fontSize: 16,
          lineHeight: 1.55,
          color: "var(--ink-2)",
        }}
      >
        The standalone trip planner has been retired. Award searches and
        point-vs-cash flight questions are now handled by Maple AI, which can
        pull live availability and walk you through the trade-offs in plain
        language.
      </p>

      <div className="flex flex-wrap gap-3" style={{ marginTop: 28 }}>
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-[9px] mono transition-all"
          style={{
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            background: "var(--accent)",
            color: "#fff",
          }}
        >
          <MessageCircle size={15} strokeWidth={2} />
          Ask Maple AI
        </Link>
        <Link
          href="/tools"
          className="inline-flex items-center gap-2 rounded-[9px] mono transition-all"
          style={{
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "var(--ink)",
            background: "var(--card-fill)",
            border: "1px solid var(--rule)",
          }}
        >
          <Wrench size={15} strokeWidth={1.8} />
          Browse all tools
        </Link>
      </div>
    </div>
  );
}
