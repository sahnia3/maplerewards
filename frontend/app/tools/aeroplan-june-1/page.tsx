import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { BASE_URL } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

interface Routing {
  region: string;
  origin: string;
  origin_label: string;
  destination_label: string;
  cabin: string;
  points_before: number;
  points_after: number;
  points_saved: number;
  savings_cad: number;
  notes?: string;
}

interface LockInResponse {
  generated_at: string;
  hike_date: string;
  days_until: number;
  top: Routing[];
  all_matched: Routing[];
  filters: Record<string, string>;
}

/**
 * /tools/aeroplan-june-1 — public Aeroplan June 1 2026 lock-in calculator.
 *
 * Server component so the entire result table is in the initial HTML —
 * critical for SEO (this page is the primary Reddit-shareable artifact) and
 * for the share-card preview. Form is plain HTML submitting GET params, no
 * client-side JS required.
 *
 * Why this exists: Aeroplan is hiking long-haul-business award prices ~17%
 * on June 1 2026. Booking the same itinerary now vs after the hike literally
 * saves $250-$300 per ticket. This page makes that delta obvious.
 */

export const revalidate = 3600; // 1h ISR cache — chart only changes on deploy

export const metadata = {
  title: "Aeroplan June 1 Lock-In Calculator — Maple Rewards",
  description:
    "Aeroplan is hiking long-haul business award prices by ~17% on June 1, 2026. See exactly which routings cost less today and what you'd save by booking before then.",
  openGraph: {
    title: "Aeroplan is hiking award prices June 1, 2026.",
    description:
      "Long-haul business goes up ~17%. We did the math on the most popular Canadian routings — see what you'd save by booking before May 31.",
    type: "website",
  },
};

async function fetchLockIn(params: { airport?: string; region?: string; cabin?: string }): Promise<LockInResponse | null> {
  const qs = new URLSearchParams();
  if (params.airport) qs.set("airport", params.airport);
  if (params.region) qs.set("region", params.region);
  if (params.cabin) qs.set("cabin", params.cabin);
  try {
    const res = await fetch(`${BASE_URL}/tools/aeroplan-june-1?${qs.toString()}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as LockInResponse;
  } catch {
    return null;
  }
}

interface PageProps {
  searchParams: Promise<{ airport?: string; region?: string; cabin?: string }>;
}

export default async function AeroplanJune1Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const airport = (params.airport || "").toUpperCase();
  const region = params.region || "";
  const cabin = params.cabin || "business";

  const data = await fetchLockIn({ airport, region, cabin });
  const daysUntil = data?.days_until ?? 0;
  // The hike is dated June 1, 2026. Once that date passes the backend's
  // days_until (computed server-side) goes to 0/negative — the chart itself is
  // still returned in full, but the "book before May 31" urgency framing is no
  // longer true. Pivot the copy to honest past tense off that server value
  // rather than reading the clock here (keeps this render pure + lets the
  // backend own "now"). The page never needs a redeploy to flip.
  const isPast = daysUntil <= 0;
  // Human-readable hike date for past-tense copy, e.g. "June 1, 2026". Built
  // from the server-supplied hike_date (YYYY-MM-DD), parsed as UTC so the
  // displayed day can't drift by a timezone.
  const hikeDate = data?.hike_date ? new Date(`${data.hike_date}T00:00:00Z`) : null;
  const hikeDateLabel = hikeDate
    ? hikeDate.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    : "June 1, 2026";

  // Preserve the user's filter selection on the retry link so a refresh
  // re-runs the same query rather than dropping them back to defaults.
  const retryQs = new URLSearchParams();
  if (airport) retryQs.set("airport", airport);
  if (region) retryQs.set("region", region);
  if (cabin) retryQs.set("cabin", cabin);
  const retryHref = retryQs.toString()
    ? `/tools/aeroplan-june-1?${retryQs.toString()}`
    : "/tools/aeroplan-june-1";

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Free tool"
          eyebrowEnd={isPast ? "Hike in effect" : `${daysUntil} days to lock in`}
          title={
            isPast ? (
              <>
                Aeroplan hiked long-haul business prices <span style={{ fontStyle: "italic" }}>June 1.</span>
              </>
            ) : (
              <>
                Aeroplan is hiking long-haul business prices <span style={{ fontStyle: "italic" }}>June 1.</span>
              </>
            )
          }
          lede={
            isPast
              ? `Long-haul business class on Aeroplan went up ~17% on ${hikeDateLabel} — about $250-$300 more per ticket. Here's what changed by routing, and what the pre-hike pricing was. Tickets booked before the hike kept their old cost.`
              : "Long-haul business class on Aeroplan goes up ~17% on June 1, 2026 — that's $250-$300 per ticket. Filter to your home airport and we'll show the routings cheapest to book today vs after the hike."
          }
        />

        <LeafDivider />

        <form
          method="get"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 28,
          }}
        >
          <label>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Home airport</div>
            <select name="airport" defaultValue={airport} style={selectStyle}>
              <option value="">Any Canadian airport</option>
              <option value="YYZ">Toronto (YYZ)</option>
              <option value="YVR">Vancouver (YVR)</option>
              <option value="YUL">Montréal (YUL)</option>
              <option value="YYC">Calgary (YYC)</option>
              <option value="YOW">Ottawa (YOW)</option>
            </select>
          </label>
          <label>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Destination region</div>
            <select name="region" defaultValue={region} style={selectStyle}>
              <option value="">Anywhere</option>
              <option value="europe">Europe</option>
              <option value="asia-pacific">Asia-Pacific</option>
              <option value="middle-east-india-africa">Middle East / India / Africa</option>
              <option value="south-america">South America</option>
              <option value="north-america">North America</option>
            </select>
          </label>
          <label>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Cabin</div>
            <select name="cabin" defaultValue={cabin} style={selectStyle}>
              <option value="business">Business class</option>
              <option value="economy">Economy</option>
            </select>
          </label>
          <button type="submit" style={submitStyle}>
            Update
          </button>
        </form>

        {data === null && (
          <div
            role="alert"
            style={{
              background: "var(--card-fill)",
              border: "1px solid var(--accent)",
              borderRadius: 14,
              padding: "32px 28px",
              textAlign: "center",
              boxShadow: "var(--shadow-1)",
              marginBottom: 36,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                margin: "0 auto 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--accent-wash)",
                border: "1px solid var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <AlertTriangle size={22} strokeWidth={1.5} />
            </div>
            <h2 className="display" style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
              Couldn&rsquo;t load the lock-in numbers
            </h2>
            <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 8, lineHeight: 1.55 }}>
              The pricing data didn&rsquo;t come back. This is usually momentary — try again in a few seconds.
            </p>
            <Link
              href={retryHref}
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 20,
                padding: "10px 20px",
                borderRadius: 10,
                background: "var(--accent)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Try again →
            </Link>
          </div>
        )}

        {data && data.top.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h2 className="display" style={{ fontSize: "clamp(22px, 2.6vw, 30px)", marginBottom: 16 }}>
              {isPast ? "The biggest increases by routing" : "The highest-savings lock-ins for you"}
            </h2>
            <div style={{ display: "grid", gap: 14 }}>
              {data.top.map((r, i) => (
                <RoutingCard key={i} r={r} highlight={i === 0} isPast={isPast} />
              ))}
            </div>
          </section>
        )}

        {data && data.all_matched.length > data.top.length && (
          <section style={{ marginBottom: 32 }}>
            <h2 className="display" style={{ fontSize: 22, marginBottom: 12 }}>
              All matching routings
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {data.all_matched.map((r, i) => (
                <RoutingRow key={`m-${i}`} r={r} />
              ))}
            </div>
          </section>
        )}

        {data && data.top.length === 0 && (
          <p className="serif" style={{ fontSize: 16, fontStyle: "italic", color: "var(--ink-2)", padding: 32 }}>
            No routings matched those filters. Try widening the destination or removing the airport filter.
          </p>
        )}

        <LeafDivider />

        <aside
          style={{
            padding: "20px 24px",
            background: "var(--card-fill-strong)",
            border: "1px solid var(--rule)",
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div className="eyebrow" style={{ color: "var(--accent)" }}>{isPast ? "Booking now" : "How to book"}</div>
          <p className="serif" style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
            Search award space on{" "}
            <a href="https://www.aircanada.com/aeroplan" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
              aircanada.com/aeroplan
            </a>
            {isPast ? (
              <>
                . The {hikeDateLabel} chart prices above are now in effect — the &ldquo;before&rdquo; column is shown
                for reference. Star Alliance partners (Lufthansa, SWISS, ANA, EVA) typically open business award space ~355 days out.
              </>
            ) : (
              <>
                {" "}for any date through May 31, 2026 — once the booking is confirmed, the points cost is locked in even if you fly post-June 1.
                Star Alliance partners (Lufthansa, SWISS, ANA, EVA) typically open business award space ~355 days out.
              </>
            )}
          </p>
          <p className="serif" style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "var(--ink-3)" }}>
            Numbers assume 2.0¢/point valuation. Real CPP varies — check our{" "}
            <Link href="/loyalty/aeroplan" style={{ color: "var(--accent)" }}>Aeroplan profile</Link>{" "}
            for the current cents-per-point.
          </p>
        </aside>
      </div>
    </div>
  );
}

function RoutingCard({ r, highlight, isPast }: { r: Routing; highlight: boolean; isPast: boolean }) {
  return (
    <article
      style={{
        padding: 22,
        border: `1px solid ${highlight ? "var(--accent)" : "var(--rule)"}`,
        borderRadius: 14,
        background: highlight ? "var(--accent-soft, rgba(165,31,45,0.06))" : "var(--surface)",
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 8, color: highlight ? "var(--accent)" : "var(--ink-3)" }}>
        {r.origin_label} → {r.destination_label} · {r.cabin.toUpperCase()}
      </div>
      <div className="display" style={{ fontSize: "clamp(22px, 2.4vw, 28px)", marginBottom: 8 }}>
        {isPast ? (
          <>This routing now costs <span style={{ color: "var(--accent)" }}>${r.savings_cad.toFixed(0)}</span> more</>
        ) : (
          <>Save <span style={{ color: "var(--accent)" }}>${r.savings_cad.toFixed(0)}</span> by booking before May 31</>
        )}
      </div>
      <div
        className="serif"
        style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}
      >
        {isPast ? "Before June 1" : "Today"}: <strong>{r.points_before.toLocaleString()} pts</strong> &nbsp;·&nbsp;
        {isPast ? "Now" : "After June 1"}: <strong>{r.points_after.toLocaleString()} pts</strong> &nbsp;·&nbsp;
        Difference: <strong>{r.points_saved.toLocaleString()} pts</strong>
      </div>
      {r.notes && (
        <p className="serif" style={{ marginTop: 12, marginBottom: 0, fontSize: 13, fontStyle: "italic", color: "var(--ink-3)" }}>
          {r.notes}
        </p>
      )}
    </article>
  );
}

function RoutingRow({ r }: { r: Routing }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto auto",
        gap: 16,
        padding: "14px 18px",
        border: "1px solid var(--rule)",
        borderRadius: 10,
        alignItems: "center",
      }}
    >
      <div>
        <div className="display" style={{ fontSize: 15, lineHeight: 1.2 }}>
          {r.origin_label} → {r.destination_label}
        </div>
        <div className="eyebrow" style={{ marginTop: 4, color: "var(--ink-3)" }}>
          {r.cabin}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        {r.points_before.toLocaleString()} → {r.points_after.toLocaleString()}
      </div>
      <div className="display" style={{ fontSize: 16, color: r.savings_cad > 0 ? "var(--accent)" : "var(--ink-3)" }}>
        {r.savings_cad > 0 ? `$${r.savings_cad.toFixed(0)}` : "—"}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--rule-strong)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 14,
};

const submitStyle: React.CSSProperties = {
  alignSelf: "end",
  padding: "12px 18px",
  borderRadius: 8,
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};
