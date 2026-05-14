"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Inbox, type LucideIcon } from "lucide-react";

/* Editorial empty state — paper substrate, Lucide line icon, italic Instrument
 * Serif title, body in --ink-2. One emotional accent: optional maple-red CTA.
 *
 * Keep this file the single source of truth for empty surfaces. Anything that
 * needs a placeholder block should route through here, not invent its own.
 *
 * `illustration` overrides `icon` when provided. String → rendered as <img>
 * src (use for Higgsfield-generated rasters under /public/illustrations/).
 * ReactNode → rendered directly (inline SVG, custom component, etc.).
 */

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  illustration?: ReactNode | string;
  title: string;
  body?: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  illustration,
  title,
  body,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`reveal ${className}`}
      style={{
        background: "var(--card-fill)",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        padding: "44px 28px",
        textAlign: "center",
        boxShadow: "var(--shadow-1)",
      }}
    >
      {illustration ? (
        <div
          style={{
            width: "100%",
            maxWidth: 220,
            margin: "0 auto 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {typeof illustration === "string" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={illustration}
              alt=""
              role="presentation"
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          ) : (
            illustration
          )}
        </div>
      ) : (
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            margin: "0 auto 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-2)",
            border: "1px solid var(--rule)",
            color: "var(--ink-3)",
          }}
        >
          <Icon size={22} strokeWidth={1.5} />
        </div>
      )}

      <h3
        className="display"
        style={{
          fontSize: 22,
          fontStyle: "italic",
          color: "var(--ink)",
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h3>

      {body && (
        <p
          className="serif"
          style={{
            marginTop: 8,
            fontSize: 14,
            color: "var(--ink-2)",
            lineHeight: 1.55,
            maxWidth: 380,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {body}
        </p>
      )}

      {action && (
        <div style={{ marginTop: 20 }}>
          {action.href ? (
            <Link
              href={action.href}
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 10,
                background: "var(--accent)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {action.label} →
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 10,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {action.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
