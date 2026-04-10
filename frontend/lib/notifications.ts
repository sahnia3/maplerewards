import type { UserCard, WelcomeBonus, SpendStats } from "./types";

export interface Notification {
  id: string;
  type: "bonus_deadline" | "spend_tip" | "monthly_summary" | "card_suggestion";
  title: string;
  body: string;
  icon: string;
  color: string;
  actionLabel?: string;
  actionHref?: string;
  createdAt: string;
}

const STORAGE_KEY = "maple_dismissed_notifications";

function getDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function dismissNotification(id: string): void {
  if (typeof window === "undefined") return;
  const dismissed = getDismissedIds();
  dismissed.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
}

export function generateNotifications(
  wallet: UserCard[],
  bonuses: WelcomeBonus[],
  stats: SpendStats | null
): Notification[] {
  const notifications: Notification[] = [];
  const dismissed = getDismissedIds();
  const now = new Date();

  // ── Welcome bonus deadlines ────────────────────────────────────────────
  for (const bonus of bonuses) {
    if (bonus.is_completed) continue;

    if (bonus.days_left <= 7 && bonus.days_left > 0) {
      const id = `bonus-urgent-${bonus.card_id}`;
      if (!dismissed.has(id)) {
        notifications.push({
          id,
          type: "bonus_deadline",
          title: `${bonus.days_left} days left!`,
          body: `Your ${bonus.card_name ?? "card"} welcome bonus deadline is approaching. Spend $${Math.max(bonus.min_spend - bonus.current_spend, 0).toFixed(0)} more to unlock ${bonus.bonus_points.toLocaleString()} pts.`,
          icon: "🔥",
          color: "#EF4444",
          actionLabel: "View milestones",
          actionHref: "/milestones",
          createdAt: now.toISOString(),
        });
      }
    } else if (bonus.days_left <= 30 && bonus.days_left > 7) {
      const id = `bonus-warning-${bonus.card_id}`;
      if (!dismissed.has(id)) {
        notifications.push({
          id,
          type: "bonus_deadline",
          title: "Bonus deadline approaching",
          body: `${bonus.days_left} days to hit the ${bonus.card_name ?? "card"} welcome bonus. ${Math.round(bonus.progress * 100)}% complete.`,
          icon: "⏰",
          color: "#FBBF24",
          actionLabel: "Track progress",
          actionHref: "/milestones",
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // ── Spending tips ─────────────────────────────────────────────────────
  if (wallet.length > 0 && wallet.length < 3) {
    const id = "tip-add-more-cards";
    if (!dismissed.has(id)) {
      notifications.push({
        id,
        type: "card_suggestion",
        title: "Maximize your coverage",
        body: `You have ${wallet.length} card${wallet.length !== 1 ? "s" : ""}. Adding 1-2 more could boost your rewards across more categories.`,
        icon: "💡",
        color: "#60A5FA",
        actionLabel: "Explore cards",
        actionHref: "/cards",
        createdAt: now.toISOString(),
      });
    }
  }

  // ── Monthly summary ────────────────────────────────────────────────────
  if (stats && stats.total_value > 0) {
    const id = `summary-${now.getFullYear()}-${now.getMonth()}`;
    if (!dismissed.has(id)) {
      notifications.push({
        id,
        type: "monthly_summary",
        title: "Your rewards snapshot",
        body: `You've earned $${stats.total_value.toFixed(2)} in rewards across ${stats.entry_count} transactions. Average return: ${stats.avg_return.toFixed(1)}%.`,
        icon: "📊",
        color: "#34D399",
        actionLabel: "View insights",
        actionHref: "/insights",
        createdAt: now.toISOString(),
      });
    }
  }

  // ── Log spend reminder ─────────────────────────────────────────────────
  if (wallet.length > 0 && (!stats || stats.entry_count === 0)) {
    const id = "tip-log-spend";
    if (!dismissed.has(id)) {
      notifications.push({
        id,
        type: "spend_tip",
        title: "Start tracking spend",
        body: "Use the optimizer to find your best card, then log the spend to track your rewards earnings.",
        icon: "✨",
        color: "#0D9488",
        actionLabel: "Open optimizer",
        actionHref: "/optimizer",
        createdAt: now.toISOString(),
      });
    }
  }

  return notifications;
}
