"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User, Crown, Gem, ChevronUp } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

// Per-tier badge. Three visibly distinct treatments so Pro / Pro Plus /
// Lifetime read at a glance instead of one generic gold "PRO" pill.
// Palette tracks the app: brand teal, gold, and the editorial maple/crimson
// for the standout Lifetime tier.
const TIER_BADGE: Record<
  string,
  { label: string; bg: string; fg: string; border?: string; icon: "crown" | "gem" }
> = {
  pro: {
    label: "PRO",
    bg: "linear-gradient(135deg,#2DD4BF,#0D9488)",
    fg: "#fff",
    icon: "crown",
  },
  pro_plus: {
    label: "PLUS",
    bg: "linear-gradient(135deg,#FFD700,#FFA500)",
    fg: "#000",
    icon: "crown",
  },
  lifetime: {
    label: "LIFETIME",
    bg: "linear-gradient(135deg,#7A1F2B,#C0394B)",
    fg: "#FFE9C7",
    border: "1px solid rgba(255,215,0,0.55)",
    icon: "gem",
  },
};

interface UserMenuProps {
  collapsed?: boolean;
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const { user, isPro, plan, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!user) return null;

  const initials = (user.display_name || user.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative px-3 pb-4 shrink-0">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center rounded-xl transition-all"
        style={{
          padding: collapsed ? "8px 0" : "10px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: collapsed ? 0 : "12px",
          background: open ? "rgba(255,255,255,0.06)" : "transparent",
          border: collapsed ? "none" : "1px solid var(--border-dim)",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
        title={collapsed ? (user.display_name || user.email || "User") : undefined}
      >
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #0D9488, #0F766E)" }}
        >
          {initials}
        </div>

        {/* Name & badge — hidden when collapsed */}
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[13px] font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {user.display_name || user.email || "User"}
                </span>
                {(() => {
                  // Fall back to the PRO badge if the token still carries
                  // is_pro but no plan yet (pre-/auth/me-refresh window).
                  const b = TIER_BADGE[plan] ?? (isPro ? TIER_BADGE.pro : null);
                  if (!b) return null;
                  return (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap shrink-0"
                      style={{ background: b.bg, color: b.fg, border: b.border }}
                    >
                      {b.icon === "gem" ? <Gem size={8} /> : <Crown size={8} />} {b.label}
                    </span>
                  );
                })()}
              </div>
              <span
                className="text-[11px] truncate block"
                style={{ color: "var(--text-tertiary)" }}
              >
                {user.email || user.auth_provider}
              </span>
            </div>

            <ChevronUp
              size={14}
              className="transition-transform shrink-0"
              style={{
                color: "var(--text-tertiary)",
                transform: open ? "rotate(0deg)" : "rotate(180deg)",
              }}
            />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute bottom-full mb-2 rounded-xl overflow-hidden"
          style={{
            left: collapsed ? "50%" : "12px",
            right: collapsed ? "auto" : "12px",
            transform: collapsed ? "translateX(-50%)" : "none",
            minWidth: collapsed ? 180 : "auto",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-dim)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <User size={15} />
            Profile
          </Link>
          <button
            onClick={async () => {
              setOpen(false);
              await logout();
              router.push("/login");
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] transition-colors"
            style={{
              color: "#f87171",
              borderTop: "1px solid var(--border-dim)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
