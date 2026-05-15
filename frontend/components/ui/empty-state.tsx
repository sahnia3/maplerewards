"use client";

import { CreditCard, BarChart3, Search, Newspaper, type LucideIcon } from "lucide-react";
import {
  EmptyState as EditorialEmptyState,
  type EmptyStateProps as EditorialEmptyStateProps,
} from "@/components/editorial/EmptyState";

/* Legacy adapter — preserves the original `EmptyState` signature so existing
 * call sites compile. New code should import from
 * `@/components/editorial/EmptyState` directly.
 *
 * The old API took `icon: string` (an emoji) and `description: string`. We map
 * those onto the editorial primitive's Lucide-icon + body props. Emoji icons
 * are ignored — the editorial system uses line icons only.
 */

interface LegacyEmptyStateProps {
  icon?: string | LucideIcon;
  title: string;
  description?: string;
  body?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  body,
  action,
  className,
}: LegacyEmptyStateProps) {
  // If icon is a string (emoji), drop it. If it's a Lucide component, pass through.
  const lucideIcon: LucideIcon | undefined =
    typeof icon === "function" ? (icon as LucideIcon) : undefined;

  const props: EditorialEmptyStateProps = {
    title,
    body: body ?? description,
    action,
    className,
    ...(lucideIcon ? { icon: lucideIcon } : {}),
  };

  return <EditorialEmptyState {...props} />;
}

/* ── Preset empty states ───────────────────────────────────────────────── */

export function EmptyWallet() {
  return (
    <EditorialEmptyState
      icon={CreditCard}
      title="No cards yet"
      body="Add the cards you carry to start ranking them by what they actually earn."
      action={{ label: "Browse cards", href: "/cards" }}
    />
  );
}

export function EmptySpendHistory() {
  return (
    <EditorialEmptyState
      icon={BarChart3}
      title="No spend history"
      body="Log a transaction in the optimizer. We'll track what you earned and what you missed."
      action={{ label: "Start optimizing", href: "/optimizer" }}
    />
  );
}

export function EmptyResults() {
  return (
    <EditorialEmptyState
      icon={Search}
      title="No results found"
      body="Try a different category, fee tolerance, or search term."
    />
  );
}

export function EmptyFeed() {
  return (
    <EditorialEmptyState
      icon={Newspaper}
      title="No articles yet"
      body="Card reviews and rewards strategies will land here soon."
    />
  );
}
