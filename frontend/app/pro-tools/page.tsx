"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAuth } from "@/contexts/auth-context";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

import { ProToolsPersonalStrip } from "@/components/pro-tools/PersonalStrip";
import { WalletStatsStrip } from "@/components/pro-tools/WalletStatsStrip";
import { ProToolsUpsell } from "@/components/pro-tools/UpsellWall";
import { WorkspaceDirectory, WORKSPACES, type WorkspaceKey } from "@/components/pro-tools/WorkspaceDirectory";
import { WorkspaceHeader } from "@/components/pro-tools/WorkspaceHeader";

import { MissedRewardsTile } from "@/components/pro-tools/MissedRewardsTile";
import { WelcomeBonusMissionTile } from "@/components/pro-tools/WelcomeBonusMissionTile";
import { CreditsTile } from "@/components/pro-tools/CreditsTile";
import { CardValueTile } from "@/components/pro-tools/CardValueTile";
import { IssuerChangesTile } from "@/components/pro-tools/IssuerChangesTile";
import { SQCTile } from "@/components/pro-tools/SQCTile";
import { RenewalTile } from "@/components/pro-tools/RenewalTile";
import { TransferSweetSpotsTile } from "@/components/pro-tools/TransferSweetSpotsTile";
import { LoyaltyAccountsTile } from "@/components/pro-tools/LoyaltyAccountsTile";
import { ExpiryGuardianTile } from "@/components/pro-tools/ExpiryGuardianTile";
import { AwardWatchTile } from "@/components/pro-tools/AwardWatchTile";
import { StackTemplates } from "@/components/pro-tools/StackTemplates";
import { StackTile } from "@/components/pro-tools/StackTile";
import { ChurnPlannerTile } from "@/components/pro-tools/ChurnPlannerTile";
import { SimulatorTile } from "@/components/pro-tools/SimulatorTile";
import { HouseholdTile } from "@/components/pro-tools/HouseholdTile";
import { BuyPointsTile } from "@/components/pro-tools/BuyPointsTile";
import { CardOffersTile } from "@/components/pro-tools/CardOffersTile";
import { DevaluationTrackerTile } from "@/components/pro-tools/DevaluationTrackerTile";
import { PCOptimumModule } from "@/components/pro-tools/PCOptimumModule";

/* Pro Tools — coordination only.
 *
 * The page is a single route. The landing view is a directory of four
 * workspaces; a ?ws=<key> query param swaps in that workspace's full-width
 * stacked tiles. Because there is one route, the sidebar "Pro Tools" item stays
 * active on every sub-view automatically. useSearchParams is wrapped in a
 * <Suspense> boundary, as Next requires. Tiles live in components/pro-tools/;
 * this file wires routing, the upsell wall, and the personal strips. */

const VALID_WS = new Set<WorkspaceKey>(["forensics", "status", "stacking", "knowledge"]);

function isWorkspace(v: string | null): v is WorkspaceKey {
  return v != null && VALID_WS.has(v as WorkspaceKey);
}

const WORKSPACE_COPY: Record<WorkspaceKey, { name: string; title: React.ReactNode; lede: string }> = {
  forensics: {
    name: "Forensics",
    title: <>What you <span style={{ fontStyle: "italic", color: "var(--accent)" }}>missed</span>.</>,
    lede: "The backward-looking audit: every dollar your wallet left on the table, every credit you forgot, every fee about to hit.",
  },
  status: {
    name: "Status & balances",
    title: <>What you&apos;ve <span style={{ fontStyle: "italic", color: "var(--accent)" }}>earned</span>.</>,
    lede: "Where you stand right now — status progress, live balances, the best ways to move points, and what's at risk of expiring.",
  },
  stacking: {
    name: "Stacking & math",
    title: <>Shape next month&apos;s <span style={{ fontStyle: "italic", color: "var(--accent)" }}>spend</span>.</>,
    lede: "Your next-best card, a wallet-swap simulator, household math, combos, portal stacks, buy-points break-even and cart-linked offers.",
  },
  knowledge: {
    name: "Knowledge",
    title: <>Stay <span style={{ fontStyle: "italic", color: "var(--accent)" }}>ahead</span> of the change.</>,
    lede: "Programs devalue quietly. These two tools warn you before a chart change or a points reset costs you real money.",
  },
};

export default function ProToolsPage() {
  const { isLoading: authLoading, isAuthenticated, isPro } = useAuth();

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
    <Suspense fallback={<ProToolsFallback />}>
      <ProToolsRouter />
    </Suspense>
  );
}

function ProToolsFallback() {
  return (
    <div style={{ minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}>
      <div className="mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
        Loading toolkit…
      </div>
    </div>
  );
}

function ProToolsRouter() {
  const { sessionId, isReady, ensureSession } = useSession();
  const { wallet } = useWallet();
  const router = useRouter();
  const params = useSearchParams();

  const raw = params.get("ws");
  const ws = isWorkspace(raw) ? raw : null;

  const openWorkspace = (key: WorkspaceKey) => {
    router.replace(`/pro-tools?ws=${key}`, { scroll: false });
  };
  const allTools = () => {
    router.replace("/pro-tools", { scroll: false });
  };

  // ── Workspace view ─────────────────────────────────────────────────────────
  if (ws) {
    const copy = WORKSPACE_COPY[ws];
    const spec = WORKSPACES.find((w) => w.key === ws)!;
    return (
      <div className="reveal" style={{ paddingTop: 0 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
          <WorkspaceHeader
            name={copy.name}
            count={spec.count}
            title={copy.title}
            lede={copy.lede}
            onAllTools={allTools}
          />

          {ws === "forensics" && (
            <>
              <MissedRewardsTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <WelcomeBonusMissionTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <CreditsTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <RenewalTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <CardValueTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <IssuerChangesTile />
            </>
          )}

          {ws === "status" && (
            <>
              <SQCTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <LoyaltyAccountsTile sessionId={sessionId} isReady={isReady} ensureSession={ensureSession} />
              <LeafDivider />
              <TransferSweetSpotsTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <ExpiryGuardianTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <AwardWatchTile sessionId={sessionId} ensureSession={ensureSession} />
            </>
          )}

          {ws === "stacking" && (
            <>
              <ChurnPlannerTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <SimulatorTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <HouseholdTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <StackTemplates sessionId={sessionId} />
              <LeafDivider />
              <StackTile sessionId={sessionId} ensureSession={ensureSession} />
              <LeafDivider />
              <BuyPointsTile />
              <LeafDivider />
              <CardOffersTile sessionId={sessionId} isReady={isReady} ensureSession={ensureSession} />
            </>
          )}

          {ws === "knowledge" && (
            <>
              <DevaluationTrackerTile sessionId={sessionId} isReady={isReady} />
              <LeafDivider />
              <PCOptimumModule />
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Directory (landing) view ────────────────────────────────────────────────
  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 12 }}>
          <span className="mono" style={{ color: "var(--ink-3)", letterSpacing: "0.06em" }}>Workspace</span>
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span className="mono" style={{ color: "var(--ink)", letterSpacing: "0.06em" }}>Pro Tools</span>
          <span style={{ flex: 1, height: 1, background: "var(--rule)", margin: "0 4px" }} />
          <span className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            20 tools · Canada-first · CAD
          </span>
        </nav>

        <PageMasthead
          eyebrow="Pro tools"
          title={
            <>
              The <span style={{ fontStyle: "italic", color: "var(--accent)" }}>Pro</span> toolkit.
            </>
          }
          lede="20 Canadian-rewards tools, grouped by what they do. Forensics shows what you missed. Status tracks what you've earned. Stacking shapes next month's spend. Knowledge keeps you ahead."
          maxWidth={640}
        />

        <ProToolsPersonalStrip sessionId={sessionId} isReady={isReady} />
        <WalletStatsStrip wallet={wallet} />

        <WorkspaceDirectory sessionId={sessionId} isReady={isReady} onOpen={openWorkspace} />
      </div>
    </div>
  );
}
