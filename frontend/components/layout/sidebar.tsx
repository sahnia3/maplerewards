"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Zap,
  CreditCard,
  BarChart2,
  Rss,
  PieChart,
  LogIn,
  Plane,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  User,
  X,
  Settings,
} from "lucide-react";
import { useWallet } from "@/contexts/wallet-context";
import { useAuth } from "@/contexts/auth-context";
import { useSidebar } from "@/contexts/sidebar-context";
import { UserMenu } from "@/components/auth/user-menu";
import { NotificationCenter } from "@/components/notifications/notification-center";

/* ── Section-grouped navigation ────────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Main",
    items: [
      { href: "/",              label: "Home",         icon: LayoutDashboard },
      { href: "/cards",         label: "Cards",        icon: CreditCard      },
      { href: "/optimizer",     label: "Optimizer",    icon: Zap             },
      { href: "/trip-planner",  label: "Trip Planner", icon: Plane           },
    ],
  },
  {
    label: "Your Data",
    items: [
      { href: "/insights",      label: "Insights",     icon: BarChart2       },
      { href: "/portfolio",     label: "Portfolio",    icon: PieChart        },
      { href: "/feed",          label: "Feed",         icon: Rss             },
      { href: "/chat",          label: "AI Assistant", icon: MessageCircle   },
    ],
  },
];

const BOTTOM_NAV: NavItem[] = [
  { href: "/profile",  label: "Profile",  icon: User     },
  { href: "/settings", label: "Settings", icon: Settings  },
];

/* ── Component ─────────────────────────────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const { totalPoints, wallet, summary } = useWallet();
  const { isAuthenticated, isPro, isLoading: authLoading } = useAuth();
  const { isCollapsed, toggleSidebar, isMobileOpen, setMobileOpen } = useSidebar();

  const sidebarWidth = isCollapsed ? 56 : 240;

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  /* ── Render a single nav item ───────────────────────────────────── */
  const renderNavItem = (item: NavItem, isMobile = false) => {
    const { href, label, icon: Icon } = item;
    const active = isActive(href);
    const collapsed = isCollapsed && !isMobile;

    return (
      <Link
        key={href}
        href={href}
        onClick={() => isMobile && setMobileOpen(false)}
        className="flex items-center gap-3 rounded-lg transition-all duration-150 group relative"
        style={{
          padding: collapsed ? "8px 0" : "8px 10px",
          justifyContent: collapsed ? "center" : "flex-start",
          color: active ? "var(--teal-light)" : "var(--text-secondary)",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.color = "var(--text-primary)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }
        }}
        title={collapsed ? label : undefined}
      >
        {/* Active indicator — Linear-style left border */}
        {active && (
          <div
            className="absolute left-0 top-[20%] bottom-[20%] w-[2.5px] rounded-full"
            style={{
              background: "var(--teal)",
              boxShadow: "0 0 6px rgba(13,148,136,0.35)",
            }}
          />
        )}
        <Icon
          size={17}
          strokeWidth={active ? 2.2 : 1.7}
          className="shrink-0"
          style={{
            marginLeft: collapsed ? 0 : 2,
            transition: "transform 0.15s ease",
          }}
        />
        {!collapsed && (
          <span
            className="text-[13px] whitespace-nowrap"
            style={{ fontWeight: active ? 600 : 450 }}
          >
            {label}
          </span>
        )}
      </Link>
    );
  };

  /* ── Sidebar inner content ──────────────────────────────────────── */
  const sidebarContent = (isMobile = false) => {
    const collapsed = isCollapsed && !isMobile;

    return (
      <>
        {/* Logo + Header */}
        <div
          className="flex items-center shrink-0"
          style={{
            height: 56,
            padding: collapsed ? "0 10px" : "0 16px",
            justifyContent: collapsed ? "center" : "space-between",
            borderBottom: "1px solid var(--border-dim)",
          }}
        >
          <Link
            href="/"
            className="flex items-center gap-2.5"
            onClick={() => isMobile && setMobileOpen(false)}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 maple-bg"
              style={{ boxShadow: "0 2px 8px rgba(13,148,136,0.2)" }}
            >
              <span className="text-[13px] leading-none">🍁</span>
            </div>
            {!collapsed && (
              <span className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                maple<span style={{ color: "var(--teal)" }}>rewards</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <div className="flex items-center gap-0.5">
              <NotificationCenter />
              {isMobile && (
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sectioned nav items */}
        <nav className="flex-1 overflow-y-auto px-2.5 pt-3 pb-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-3">
              {!collapsed && (
                <div
                  className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => renderNavItem(item, isMobile))}
              </div>
            </div>
          ))}
        </nav>

        {/* Upgrade CTA — shown when not Pro */}
        {!authLoading && !isPro && !collapsed && (
          <div className="px-2.5 pb-2 shrink-0">
            <Link
              href="/pricing"
              onClick={() => isMobile && setMobileOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150"
              style={{
                background:
                  isActive("/pricing")
                    ? "rgba(245,158,11,0.12)"
                    : "rgba(245,158,11,0.05)",
                border: "1px solid rgba(245,158,11,0.12)",
                color: "#F59E0B",
                fontSize: 12,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(245,158,11,0.12)";
              }}
              onMouseLeave={(e) => {
                if (!isActive("/pricing")) {
                  e.currentTarget.style.background = "rgba(245,158,11,0.05)";
                }
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>Upgrade to Pro</span>
            </Link>
          </div>
        )}

        {/* My Rewards mini-card */}
        {!collapsed && (
          <div className="px-2.5 pb-2.5 shrink-0">
            <div
              className="rounded-lg p-3"
              style={{
                background: "rgba(13,148,136,0.05)",
                border: "1px solid rgba(13,148,136,0.1)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  My Rewards
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {wallet.length} card{wallet.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="text-[20px] font-bold tracking-tight tabular-nums" style={{ color: "var(--text-primary)" }}>
                {totalPoints.toLocaleString()}
              </div>
              <div
                className="text-[10.5px] mt-0.5"
                style={{ color: "var(--text-secondary)" }}
              >
                total points
              </div>
              {summary &&
                (summary.value_range_low > 0 ||
                  summary.value_range_high > 0) && (
                  <p
                    className="text-[11px] mt-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    ≈ ${summary.value_range_low.toFixed(0)}–$
                    {summary.value_range_high.toFixed(0)} CAD
                  </p>
                )}
              <Link
                href="/cards"
                onClick={() => isMobile && setMobileOpen(false)}
                className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium transition-opacity"
                style={{ color: "var(--teal-light)" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                View wallet →
              </Link>
            </div>
          </div>
        )}

        {/* Bottom section: Profile/Settings + Auth */}
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid var(--border-dim)" }}
        >
          <div className="px-2.5 pt-2 pb-1 space-y-0.5">
            {BOTTOM_NAV.map((item) => renderNavItem(item, isMobile))}
          </div>

          {/* Auth: User menu or Sign In */}
          {!authLoading &&
            (isAuthenticated ? (
              <UserMenu collapsed={collapsed} />
            ) : (
              <div className="px-2.5 pb-3 shrink-0">
                <Link
                  href="/login"
                  onClick={() => isMobile && setMobileOpen(false)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12.5px] font-medium transition-all"
                  style={{
                    background: "rgba(13,148,136,0.1)",
                    color: "var(--teal-light)",
                    border: "1px solid rgba(13,148,136,0.15)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(13,148,136,0.18)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(13,148,136,0.1)";
                  }}
                >
                  <LogIn size={14} />
                  {!collapsed ? "Sign In" : null}
                </Link>
              </div>
            ))}
        </div>

        {/* Collapse toggle — desktop only */}
        {!isMobile && (
          <div className="px-2.5 pb-2.5 shrink-0">
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all"
              style={{
                color: "var(--text-tertiary)",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-dim)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                e.currentTarget.style.color = "var(--text-tertiary)";
              }}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight size={13} />
              ) : (
                <ChevronLeft size={13} />
              )}
              {!isCollapsed && <span>Collapse</span>}
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40"
        style={{
          width: sidebarWidth,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border-dim)",
          transition: "width 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile overlay backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col lg:hidden"
        style={{
          width: 272,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border-dim)",
          transform: isMobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {sidebarContent(true)}
      </aside>
    </>
  );
}
