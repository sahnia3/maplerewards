"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─────────────────────────────────────────────────────────────────────────────
 * MarketingFooter — slim global footer (Privacy, Terms, Pricing, Tools,
 * Glossary). QA P2-6: nothing linked to /terms once the cookie banner was
 * dismissed, and the new /glossary reference page had no home. This is the
 * single legal/reference footer wired into the AppShell so it appears on every
 * chrome'd page.
 *
 * Self-hides on the auth/embed routes (which render without sidebar/nav), and
 * offsets by --sidebar-width so it lines up under the page content rather than
 * sliding behind the fixed sidebar. Editorial styling matches the inline footer
 * it generalises from on the landing page (eyebrow / mono classes + CSS-var
 * palette).
 * ───────────────────────────────────────────────────────────────────────────── */

const LINKS: ReadonlyArray<readonly [string, string]> = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Pricing", "/pricing"],
  ["Tools", "/tools"],
  ["Glossary", "/glossary"],
];

// Routes that render chrome-less (mirrors AppShell's AUTH_PATHS) — no footer there.
const HIDE_PREFIXES = ["/login", "/signup", "/embed/"];
// The landing page ("/") ships its own inline footer; don't double it up.
// (/chat keeps the footer: its composer is now sticky, not fixed, so it releases
// at the bottom and the footer sits below it instead of being overlapped.)
const HIDE_EXACT = ["/"];

export function MarketingFooter() {
  const pathname = usePathname();
  if (HIDE_EXACT.includes(pathname)) return null;
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return null;
  }

  return (
    <footer
      className="relative z-10"
      style={{
        marginLeft: "var(--sidebar-width, 0px)",
        paddingBottom: "var(--bottom-nav-height, 0px)",
        transition: "margin-left 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px, 4vw, 60px) 40px" }}>
        <div
          style={{
            borderTop: "1px solid var(--rule)",
            paddingTop: 20,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span className="eyebrow">Maple Rewards · Canada</span>
          <nav aria-label="Footer" style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {LINKS.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ink-2)",
                  textDecoration: "none",
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
