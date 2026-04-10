"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CreditCard,
  Zap,
  Plane,
  MoreHorizontal,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  BarChart2,
  PieChart,
  Rss,
  MessageCircle,
  User,
  Settings,
  X,
} from "lucide-react";

/* ── Tab definitions ──────────────────────────────────────────────── */

const TABS = [
  { href: "/",              label: "Home",     icon: LayoutDashboard },
  { href: "/cards",         label: "Cards",    icon: CreditCard      },
  { href: "/optimizer",     label: "Optimize", icon: Zap             },
  { href: "/trip-planner",  label: "Travel",   icon: Plane           },
] as const;

const MORE_ITEMS = [
  { href: "/insights",      label: "Insights",     icon: BarChart2       },
  { href: "/portfolio",     label: "Portfolio",    icon: PieChart        },
  { href: "/feed",          label: "Feed",         icon: Rss             },
  { href: "/chat",          label: "AI Assistant", icon: MessageCircle   },
  { href: "/profile",       label: "Profile",      icon: User            },
  { href: "/settings",      label: "Settings",     icon: Settings        },
];

/* ── Component ─────────────────────────────────────────────────────── */

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  // Is any "More" item active?
  const moreActive = MORE_ITEMS.some((item) => isActive(item.href));

  // Close sheet on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Close on escape
  useEffect(() => {
    if (!moreOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [moreOpen]);

  return (
    <>
      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch lg:hidden"
        style={{
          height: 64,
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border-dim)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{
                color: active ? "var(--teal-light)" : "var(--text-tertiary)",
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.6} />
              <span
                className="text-[10px]"
                style={{ fontWeight: active ? 600 : 400 }}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* More tab */}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
          style={{
            color: moreActive ? "var(--teal-light)" : "var(--text-tertiary)",
          }}
        >
          <MoreHorizontal size={20} strokeWidth={moreActive ? 2.2 : 1.6} />
          <span
            className="text-[10px]"
            style={{ fontWeight: moreActive ? 600 : 400 }}
          >
            More
          </span>
        </button>
      </nav>

      {/* "More" bottom sheet overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* "More" bottom sheet */}
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 bottom-0 z-50 lg:hidden"
        style={{
          background: "var(--bg-elevated)",
          borderTop: "1px solid var(--border-subtle)",
          borderRadius: "16px 16px 0 0",
          transform: moreOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          maxHeight: "70vh",
        }}
      >
        {/* Sheet handle + close */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <div
            className="w-8 h-1 rounded-full mx-auto"
            style={{ background: "var(--border-subtle)" }}
          />
          <button
            onClick={() => setMoreOpen(false)}
            className="absolute right-4 top-3 p-1 rounded-md"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Sheet nav items */}
        <div className="px-4 pb-6 space-y-0.5">
          {MORE_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all"
                style={{
                  color: active ? "var(--teal-light)" : "var(--text-secondary)",
                  background: active ? "rgba(13,148,136,0.08)" : "transparent",
                }}
              >
                <Icon size={18} strokeWidth={active ? 2.1 : 1.7} />
                <span
                  className="text-[14px]"
                  style={{ fontWeight: active ? 600 : 450 }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
