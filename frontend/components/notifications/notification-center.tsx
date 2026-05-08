"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { getUserBonuses, getSpendStats } from "@/lib/api";
import { generateNotifications, dismissNotification } from "@/lib/notifications";
import type { Notification } from "@/lib/notifications";
import type { WelcomeBonus, SpendStats } from "@/lib/types";

export function NotificationCenter() {
  const { sessionId, isReady } = useSession();
  const { wallet } = useWallet();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    if (!sessionId) return;

    let bonuses: WelcomeBonus[] = [];
    let stats: SpendStats | null = null;

    try {
      [bonuses, stats] = await Promise.all([
        getUserBonuses(sessionId).catch(() => [] as WelcomeBonus[]),
        getSpendStats(sessionId).catch(() => null),
      ]);
    } catch {
      // silent
    }

    const notifs = generateNotifications(wallet, bonuses, stats);
    setNotifications(notifs);
  }, [sessionId, wallet]);

  useEffect(() => {
    if (isReady && sessionId) {
      loadNotifications();
    }
  }, [isReady, sessionId, loadNotifications]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [isOpen]);

  function handleDismiss(id: string) {
    dismissNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all"
        style={{
          background: isOpen ? "var(--info-soft)" : "rgba(255,255,255,0.04)",
          border: isOpen ? "1px solid var(--info-border)" : "1px solid rgba(255,255,255,0.08)",
          color: isOpen ? "var(--info-text)" : "var(--text-secondary)",
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: "#0D9488" }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-[340px] rounded-2xl overflow-hidden z-50"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-mid)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border-dim)" }}
          >
            <span className="text-[13px] font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <span
                className="text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--info-soft)",
                  color: "var(--info-text)",
                }}
              >
                {unreadCount} new
              </span>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[360px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-3xl mb-2">🎉</div>
                <p className="text-[13px] font-medium text-white mb-1">All caught up!</p>
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  No new notifications right now
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="px-4 py-3 transition-colors hover:bg-white/[0.03]"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] shrink-0"
                      style={{
                        background: `${notif.color}15`,
                        border: `1px solid ${notif.color}30`,
                      }}
                    >
                      {notif.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-white leading-snug">
                          {notif.title}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss(notif.id);
                          }}
                          className="shrink-0 mt-0.5 transition-opacity hover:opacity-70"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {notif.body}
                      </p>
                      {notif.actionHref && notif.actionLabel && (
                        <Link
                          href={notif.actionHref}
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium transition-opacity hover:opacity-80"
                          style={{ color: notif.color }}
                        >
                          {notif.actionLabel} →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
