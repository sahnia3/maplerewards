"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Zap,
  CreditCard,
  Wallet,
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
  Sparkles,
  Sun,
  Moon,
  Wrench,
  Flame,
  Trophy,
  Shield,
  ClipboardList,
} from "lucide-react";
import { useWallet } from "@/contexts/wallet-context";
import { useAuth } from "@/contexts/auth-context";
import { useSidebar } from "@/contexts/sidebar-context";
import { UserMenu } from "@/components/auth/user-menu";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { MapleWordmark } from "@/components/brand/maple-mark";

/* ── Maple-leaf brand glyph — folded-origami, raster asset ─────────────
 * Uses the round-2 origami mockup directly (cream background already
 * stripped, cropped to bounds). PNG at 395×411 source resolution so
 * it scales crisply down to favicon size. Path-based SVG was too
 * noisy at small sizes — this is the user's selected design verbatim. */
function MapleLeaf({ size = 30 }: { size?: number }) {
  return (
    <Image
      src="/brand/maple-leaf-origami.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}

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
    label: "Workspace",
    items: [
      { href: "/",              label: "Home",         icon: LayoutDashboard },
      { href: "/optimizer",     label: "Optimizer",    icon: Zap             },
      { href: "/pro-tools",     label: "Pro Tools",    icon: Sparkles        },
      { href: "/wallet",        label: "Wallet",       icon: Wallet          },
      { href: "/cards",         label: "Cards",        icon: CreditCard      },
      { href: "/loyalty",       label: "Loyalty",      icon: Trophy          },
      { href: "/trip-planner",  label: "Trip Planner", icon: Plane           },
      { href: "/chat",          label: "Maple",        icon: MessageCircle   },
    ],
  },
  {
    label: "Your Data",
    items: [
      { href: "/insights",      label: "Insights",     icon: BarChart2       },
      { href: "/portfolio",     label: "Portfolio",    icon: PieChart        },
      { href: "/applications",  label: "Applications", icon: ClipboardList   },
      { href: "/feed",          label: "Feed",         icon: Rss             },
      { href: "/promos",        label: "Promos",       icon: Flame           },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/tools",         label: "All Tools",    icon: Wrench          },
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
  const { isAuthenticated, isPro, isAdmin, isLoading: authLoading } = useAuth();
  const { isCollapsed, toggleSidebar, isMobileOpen, setMobileOpen } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Drawer focus management: when the mobile drawer opens, move focus to its
  // first focusable control (screen-reader + keyboard users land inside the
  // dialog); restore focus to the previously-focused element on close.
  const drawerRef = useRef<HTMLElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isMobileOpen) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      drawerRef.current
        ?.querySelector<HTMLElement>("a[href], button:not([disabled])")
        ?.focus();
    } else {
      lastFocusedRef.current?.focus?.();
      lastFocusedRef.current = null;
    }
  }, [isMobileOpen]);

  const sidebarWidth = isCollapsed ? 56 : 240;
  const isDark = mounted && theme === "dark";

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
        className="flex items-center gap-3 rounded-[9px] transition-all duration-150 group relative mono"
        style={{
          padding: collapsed ? "9px 0" : "9px 10px",
          justifyContent: collapsed ? "center" : "flex-start",
          fontSize: 12,
          fontWeight: active ? 600 : 500,
          color: active ? "var(--ink)" : "var(--ink-3)",
          background: active ? "var(--card-fill)" : "transparent",
          border: active ? "1px solid var(--rule)" : "1px solid transparent",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = "var(--card-fill)";
            e.currentTarget.style.color = "var(--ink)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--ink-3)";
          }
        }}
        title={collapsed ? label : undefined}
      >
        {/* Active indicator — 3px maple-red bar at -16px */}
        {active && (
          <div
            className="absolute"
            style={{
              left: collapsed ? -8 : -16,
              top: 8,
              bottom: 8,
              width: 3,
              borderRadius: 99,
              background: "var(--accent)",
            }}
          />
        )}
        <Icon
          size={15}
          strokeWidth={active ? 2.0 : 1.6}
          className="shrink-0"
          style={{ marginLeft: collapsed ? 0 : 0 }}
        />
        {!collapsed && (
          <span className="whitespace-nowrap" style={{ letterSpacing: "0.02em" }}>
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
        {/* Logo lockup: folded-origami maple leaf + maple wordmark */}
        <div
          className="flex items-center shrink-0"
          style={{
            height: 56,
            padding: collapsed ? "0 10px" : "0 16px",
            justifyContent: collapsed ? "center" : "space-between",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={() => isMobile && setMobileOpen(false)}
          >
            <MapleLeaf size={28} />
            {!collapsed && <MapleWordmark size="sm" bare />}
          </Link>
          {!collapsed && (
            <div className="flex items-center gap-0.5">
              <NotificationCenter />
              {isMobile && (
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "var(--ink-3)" }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar portfolio summary card (editorial). Logged-out visitors get
         * a preview framing instead of a glitch-looking "LIVE $0". */}
        {!collapsed && (
          <div className="px-3 pt-4 pb-3 shrink-0">
            <div className="sidebar-portfolio">
              <div className="flex items-center justify-between mb-2.5">
                <span className="eyebrow" style={{ letterSpacing: "0.14em" }}>
                  Portfolio
                </span>
                {isAuthenticated ? (
                  <span
                    className="mono inline-flex items-center gap-1"
                    style={{ fontSize: 11, color: "var(--gain)" }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--gain)",
                      }}
                    />
                    LIVE
                  </span>
                ) : (
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    PREVIEW
                  </span>
                )}
              </div>
              {isAuthenticated ? (
                <>
                  <div
                    className="display"
                    style={{ fontSize: 26, lineHeight: 1, color: "var(--ink)" }}
                  >
                    {summary?.value_range_high
                      ? `$${summary.value_range_high.toFixed(0)}`
                      : `$${(totalPoints / 100).toFixed(0)}`}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.08em" }}>
                        POINTS
                      </div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--ink)" }}>
                        {(totalPoints / 1000).toFixed(1)}K
                      </div>
                    </div>
                    <div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.08em" }}>
                        CARDS
                      </div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>
                        {wallet.length}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p
                  className="serif"
                  style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}
                >
                  Your numbers appear here once you sign in and add cards.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Sectioned nav items */}
        <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-4">
              {!collapsed && (
                <div className="eyebrow" style={{ paddingLeft: 10, marginBottom: 8 }}>
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => renderNavItem(item, isMobile))}
              </div>
            </div>
          ))}
          {isAdmin && (
            <div className="mb-4">
              {!collapsed && (
                <div className="eyebrow" style={{ paddingLeft: 10, marginBottom: 8 }}>
                  Admin
                </div>
              )}
              <div className="space-y-0.5">
                {renderNavItem({ href: "/admin", label: "Users", icon: Shield }, isMobile)}
              </div>
            </div>
          )}
        </nav>

        {/* Upgrade CTA — shown when not Pro */}
        {!authLoading && !isPro && !collapsed && (
          <div className="px-3 pb-2 shrink-0">
            <Link
              href="/pricing"
              onClick={() => isMobile && setMobileOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150 mono"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-soft)",
                color: "var(--accent)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <span>★ Upgrade to Pro</span>
            </Link>
          </div>
        )}

        {/* Bottom section: Profile/Settings + Theme + Auth */}
        <div className="sidebar-footer px-3 pt-2 pb-3 shrink-0">
          <div className="space-y-0.5">
            {BOTTOM_NAV.map((item) => renderNavItem(item, isMobile))}
          </div>

          {/* Theme toggle */}
          {!collapsed && mounted && (
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg mono transition-all"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--ink-2)",
                background: "var(--card-fill)",
                border: "1px solid var(--rule)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
              <span>{isDark ? "Light" : "Dark"} mode</span>
            </button>
          )}

          {/* Auth: User menu or Sign In */}
          {!authLoading &&
            (isAuthenticated ? (
              <UserMenu collapsed={collapsed} />
            ) : (
              <Link
                href="/login"
                onClick={() => isMobile && setMobileOpen(false)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg mono transition-all"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <LogIn size={13} />
                {!collapsed ? "Sign In" : null}
              </Link>
            ))}
        </div>

        {/* Collapse toggle — desktop only */}
        {!isMobile && (
          <div className="px-3 pb-3 shrink-0">
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all mono"
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                background: "transparent",
                border: "1px solid var(--rule)",
              }}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
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
          background: "var(--sidebar-fill)",
          borderRight: "1px solid var(--rule)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
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
            background: "rgba(16,24,32,0.6)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!isMobileOpen}
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col lg:hidden"
        style={{
          // Cap to the viewport so it doesn't crowd a 360px phone, but keep it
          // readable. 272px on wider phones, ~85vw on very narrow ones.
          width: "min(272px, 85vw)",
          background: "var(--sidebar-fill)",
          borderRight: "1px solid var(--rule)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          transform: isMobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {sidebarContent(true)}
      </aside>
    </>
  );
}
