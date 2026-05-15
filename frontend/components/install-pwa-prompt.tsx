"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

const DISMISS_KEY = "maple_install_prompt_dismissed_v1";
const SHOW_AFTER_MS = 30_000; // 30 seconds — only after the user has seen the dashboard

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * InstallPWAPrompt — surfaces a small bottom-right card the first time
 * Chrome/Edge/Brave fires `beforeinstallprompt`. Suppressed for users who
 * already installed (display-mode: standalone) or previously dismissed it.
 *
 * On iOS Safari the event never fires, so we also render a generic "add to
 * home screen" hint after a delay if the user is on iOS Safari and hasn't
 * dismissed before. Apple's Add-to-Home-Screen flow is manual; the hint
 * just nudges them.
 */
export function InstallPWAPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosNudge, setIOSNudge] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "true") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    };
    window.addEventListener("beforeinstallprompt", onBefore as EventListener);

    // iOS Safari path
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);
    if (isIOS && isSafari) {
      const t = setTimeout(() => {
        setIOSNudge(true);
        setOpen(true);
      }, SHOW_AFTER_MS);
      return () => {
        window.removeEventListener("beforeinstallprompt", onBefore as EventListener);
        clearTimeout(t);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore as EventListener);
    };
  }, []);

  function dismiss() {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "true");
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!open || (!deferred && !iosNudge)) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-pwa-title"
      style={{
        position: "fixed",
        bottom: 18,
        right: 18,
        zIndex: 70,
        maxWidth: 320,
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        boxShadow: "0 16px 36px -10px rgba(0,0,0,0.3)",
        padding: "16px 18px",
        animation: "mr-install-fade 220ms ease",
      }}
      className="install-pwa-prompt"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "transparent",
          border: "none",
          color: "var(--ink-3)",
          cursor: "pointer",
          padding: 4,
          borderRadius: 6,
        }}
      >
        <X size={14} />
      </button>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Smartphone size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            id="install-pwa-title"
            className="display"
            style={{ fontSize: 16, lineHeight: 1.25, color: "var(--ink)" }}
          >
            Install MapleRewards
          </div>
          <p
            className="serif"
            style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-2)", marginTop: 4, marginBottom: 0, lineHeight: 1.45 }}
          >
            {iosNudge
              ? "Tap the share icon in Safari and choose 'Add to Home Screen' to install MapleRewards as an app."
              : "Add Maple to your phone or laptop home screen — same wallet, same Pro tools, no browser tab."}
          </p>
        </div>
      </div>
      {!iosNudge && (
        <button
          onClick={install}
          className="mono"
          style={{
            marginTop: 12,
            width: "100%",
            padding: "10px 14px",
            border: "none",
            borderRadius: 8,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Install →
        </button>
      )}
      <style>{`
        @keyframes mr-install-fade {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
