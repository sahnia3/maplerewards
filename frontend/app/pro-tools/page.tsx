"use client";

import { useMemo, useState } from "react";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAuth } from "@/contexts/auth-context";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

import { ProToolsPersonalStrip } from "@/components/pro-tools/PersonalStrip";
import { WalletStatsStrip } from "@/components/pro-tools/WalletStatsStrip";
import { ProToolsUpsell } from "@/components/pro-tools/UpsellWall";
import { MissedRewardsTile } from "@/components/pro-tools/MissedRewardsTile";
import { WelcomeBonusMissionTile } from "@/components/pro-tools/WelcomeBonusMissionTile";
import { CreditsTile } from "@/components/pro-tools/CreditsTile";
import { CardValueTile } from "@/components/pro-tools/CardValueTile";
import { IssuerChangesTile } from "@/components/pro-tools/IssuerChangesTile";
import { SQCTile } from "@/components/pro-tools/SQCTile";
import { LoyaltyAccountsTile } from "@/components/pro-tools/LoyaltyAccountsTile";
import { AwardWatchTile } from "@/components/pro-tools/AwardWatchTile";
import { StackTemplates } from "@/components/pro-tools/StackTemplates";
import { StackTile } from "@/components/pro-tools/StackTile";
import { BuyPointsTile } from "@/components/pro-tools/BuyPointsTile";
import { CardOffersTile } from "@/components/pro-tools/CardOffersTile";
import { DevaluationTile } from "@/components/pro-tools/DevaluationTile";
import { PCOptimumModule } from "@/components/pro-tools/PCOptimumModule";

/* Pro Tools — coordination only.
 *
 * Tiles live in components/pro-tools/. The editorial substrate (PaperTile) and
 * the EmptyState primitive live in components/editorial/. This file wires
 * tabs, routes free users to the upsell, and renders the personal strip. */

type ProTab = "forensics" | "status" | "stacking" | "knowledge";

interface TabSpec {
  key: ProTab;
  label: string;
  count: number;
  hint: string;
}

const TABS: TabSpec[] = [
  { key: "forensics", label: "Forensics", count: 4, hint: "What you missed, what's expiring, what changed." },
  { key: "status", label: "Status & balances", count: 3, hint: "Aeroplan SQC, loyalty programs, award watches." },
  { key: "stacking", label: "Stacking & math", count: 4, hint: "Card combos, portal stacks, buy-points, offers." },
  { key: "knowledge", label: "Knowledge", count: 3, hint: "Devaluations, India hotels, PC Optimum." },
];

export default function ProToolsPage() {
  const { sessionId, isReady, ensureSession } = useSession();
  const { wallet } = useWallet();
  const { isLoading: authLoading, isAuthenticated, isPro } = useAuth();
  const [active, setActive] = useState<ProTab>("forensics");
  const activeHint = useMemo(() => TABS.find((t) => t.key === active)?.hint, [active]);

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-3)",
        }}
      >
        <div className="mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Loading…
        </div>
      </div>
    );
  }
  if (!isAuthenticated || !isPro) {
    return <ProToolsUpsell signedIn={isAuthenticated} />;
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Pro tools"
          eyebrowEnd="Canada-first · CAD"
          title={
            <>
              The <span style={{ fontStyle: "italic", color: "var(--accent)" }}>Pro</span> toolkit.
            </>
          }
          lede="14 Canadian-rewards tools grouped by purpose. Forensics shows what you've missed. Status tracks what you've earned. Stacking shapes next month's spend. Knowledge keeps you ahead of program changes."
        />

        <ProToolsPersonalStrip sessionId={sessionId} isReady={isReady} />
        <WalletStatsStrip wallet={wallet} />

        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            margin: "8px -8px 22px",
            padding: "10px 8px",
            background: "color-mix(in oklab, var(--surface) 85%, transparent)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <div
            role="tablist"
            aria-label="Pro tool sections"
            style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}
          >
            {TABS.map((t) => {
              const isActive = active === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(t.key)}
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 16px",
                    borderRadius: 999,
                    border: `1px solid ${isActive ? "var(--accent)" : "var(--rule-strong)"}`,
                    background: isActive ? "var(--accent)" : "var(--surface)",
                    color: isActive ? "#fff" : "var(--ink-2)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: isActive ? "var(--shadow-accent-glow)" : "none",
                    transition:
                      "background 220ms cubic-bezier(0.16, 1, 0.3, 1), color 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                    transform: isActive ? "translateY(-1px)" : "translateY(0)",
                  }}
                >
                  {t.label}
                  <span
                    style={{
                      fontSize: 9,
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: isActive ? "rgba(255,255,255,0.24)" : "var(--accent-wash)",
                      color: isActive ? "#fff" : "var(--accent)",
                      letterSpacing: "0.04em",
                      fontWeight: 600,
                    }}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
          <p
            className="serif"
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontSize: 12,
              fontStyle: "italic",
              color: "var(--ink-3)",
              lineHeight: 1.4,
            }}
          >
            {activeHint}
          </p>
        </div>

        {active === "forensics" && (
          <>
            <MissedRewardsTile sessionId={sessionId} isReady={isReady} />
            <LeafDivider />
            <WelcomeBonusMissionTile sessionId={sessionId} isReady={isReady} />
            <LeafDivider />
            <CreditsTile sessionId={sessionId} isReady={isReady} />
            <LeafDivider />
            <CardValueTile sessionId={sessionId} isReady={isReady} />
            <LeafDivider />
            <IssuerChangesTile />
          </>
        )}

        {active === "status" && (
          <>
            <SQCTile sessionId={sessionId} isReady={isReady} />
            <LeafDivider />
            <LoyaltyAccountsTile sessionId={sessionId} isReady={isReady} ensureSession={ensureSession} />
            <LeafDivider />
            <AwardWatchTile sessionId={sessionId} ensureSession={ensureSession} />
          </>
        )}

        {active === "stacking" && (
          <>
            <StackTemplates sessionId={sessionId} />
            <LeafDivider />
            <StackTile sessionId={sessionId} ensureSession={ensureSession} />
            <LeafDivider />
            <BuyPointsTile />
            <LeafDivider />
            <CardOffersTile sessionId={sessionId} isReady={isReady} ensureSession={ensureSession} />
          </>
        )}

        {active === "knowledge" && (
          <>
            <DevaluationTile sessionId={sessionId} isReady={isReady} />
            <LeafDivider />
            <PCOptimumModule />
          </>
        )}
      </div>
    </div>
  );
}
