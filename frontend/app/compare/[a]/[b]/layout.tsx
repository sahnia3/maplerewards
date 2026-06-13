import type { Metadata } from "next";

const SITE_URL = "https://maplerewards.app";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

/**
 * Server layout exists solely to give the client compare page real SEO
 * plumbing: per-pair title/description + a canonical URL with the two slugs
 * in stable (alphabetical) order so /compare/a/b and /compare/b/a don't
 * compete as duplicates.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}): Promise<Metadata> {
  const { a, b } = await params;
  const [first, second] = [a, b].sort();
  const canonical = `${SITE_URL}/compare/${encodeURIComponent(first)}/${encodeURIComponent(second)}`;

  try {
    const res = await fetch(
      `${API_URL}/compare/${encodeURIComponent(a)}/${encodeURIComponent(b)}`,
      { next: { revalidate: 3600 } },
    );
    if (res.ok) {
      const data = await res.json();
      const aName: unknown = data?.a?.card?.name;
      const bName: unknown = data?.b?.card?.name;
      if (typeof aName === "string" && aName && typeof bName === "string" && bName) {
        return {
          title: `${aName} vs ${bName} — MapleRewards`,
          description: `${aName} vs ${bName}: annual fees, welcome bonuses, earn rates, and transfer partners compared side by side for Canadian rewards.`,
          alternates: { canonical },
        };
      }
    }
  } catch {
    // API unreachable — fall through to the generic metadata below.
  }

  return {
    title: "Compare Canadian credit cards — MapleRewards",
    description: "Side-by-side comparison of two Canadian credit cards: annual fees, welcome bonuses, earn rates, and transfer partners.",
    alternates: { canonical },
  };
}

export default function CompareTwoCardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
