"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import Link from "next/link";
import { PageMasthead } from "@/components/editorial/page-masthead";

/* Editorial settings page — only what actually works.
 *
 * Theme       — wired to next-themes, persists.
 * Reduce-motion — sets a data attribute on <html>, persists in localStorage.
 *
 * Removed: density, notifications, locale, data-export — these were filler with
 * no working backend. They will be added back when their backends ship.
 */

function loadBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}
function saveBool(key: string, value: boolean) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, String(value));
}

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const currentTheme = (resolvedTheme as "light" | "dark") ?? "light";

  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(loadBool("mr.motion.reduce", false));
  }, []);

  function applyMotion(reduce: boolean) {
    setReduceMotion(reduce);
    saveBool("mr.motion.reduce", reduce);
    document.documentElement.setAttribute("data-reduce-motion", reduce ? "true" : "false");
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px clamp(20px, 3vw, 40px) 80px" }}>
        <PageMasthead
          eyebrow="Settings"
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>workspace</span> you keep.
            </>
          }
          lede="Account preferences live on the profile page. This is for things that change how the app looks and feels."
        />

        <Section eyebrow="Appearance" title="Set the substrate.">
          <Row label="Theme" hint="Editorial paper or maple-stained dark.">
            <ToggleGroup>
              <ToggleButton active={currentTheme === "light" && theme !== "system"} onClick={() => setTheme("light")}>
                <Sun size={13} /> Light
              </ToggleButton>
              <ToggleButton active={currentTheme === "dark" && theme !== "system"} onClick={() => setTheme("dark")}>
                <Moon size={13} /> Dark
              </ToggleButton>
              <ToggleButton active={theme === "system"} onClick={() => setTheme("system")}>
                System
              </ToggleButton>
            </ToggleGroup>
          </Row>
          <Row label="Reduce motion" hint="Disable hover lifts, transitions, and reveal animations.">
            <Switch on={reduceMotion} onChange={applyMotion} />
          </Row>
        </Section>

        <p
          className="serif"
          style={{
            marginTop: 28,
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          Looking for account info, sign-out, or delete-account? Those live on the{" "}
          <Link href="/profile" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            profile page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/* ── Subcomponents ─────────────────────────────────────────────── */

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <header style={{ marginBottom: 14 }}>
        <span className="eyebrow" style={{ color: "var(--accent)" }}>{eyebrow}</span>
        <h2 className="display" style={{ fontSize: 26, margin: "6px 0 0", lineHeight: 1.1, fontStyle: "italic" }}>
          {title}
        </h2>
      </header>
      <div style={{ borderTop: "1px solid var(--ink)" }}>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 16,
        alignItems: "center",
        padding: "16px 4px",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div>
        <div className="display" style={{ fontSize: 16, lineHeight: 1.2, color: "var(--ink)" }}>{label}</div>
        {hint && (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)", fontSize: 13, marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function ToggleGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono"
      style={{
        padding: "8px 14px",
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink-2)",
        border: "none",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "background 160ms",
      }}
    >
      {children}
    </button>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        position: "relative",
        width: 42,
        height: 24,
        borderRadius: 999,
        border: "none",
        background: on ? "var(--accent)" : "var(--rule-strong)",
        cursor: "pointer",
        transition: "background 160ms",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 160ms",
        }}
      />
    </button>
  );
}
