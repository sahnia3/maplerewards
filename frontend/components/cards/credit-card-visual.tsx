"use client";

import { getCardTheme, getNetworkLabel } from "@/lib/card-themes";
import type { Card } from "@/lib/types";

interface CreditCardVisualProps {
  card?: Card;
  balance?: number;
  size?: "sm" | "md" | "lg";
}

const SIZE_CONFIG = {
  sm: { width: 160, fontSize: { name: "8px", issuer: "6px", network: "8px", dots: "8px", chip: { w: 18, h: 14 } } },
  md: { width: 280, fontSize: { name: "13px", issuer: "10px", network: "13px", dots: "11px", chip: { w: 32, h: 24 } } },
  lg: { width: 380, fontSize: { name: "16px", issuer: "12px", network: "16px", dots: "14px", chip: { w: 44, h: 34 } } },
};

export function CreditCardVisual({ card, balance, size = "md" }: CreditCardVisualProps) {
  const theme = getCardTheme(card?.issuer);
  const network = getNetworkLabel(card?.network);
  const cfg = SIZE_CONFIG[size];
  const height = Math.round(cfg.width / 1.586);

  return (
    <div
      style={{
        width: cfg.width,
        height,
        borderRadius: size === "sm" ? 8 : size === "md" ? 14 : 18,
        background: theme.gradient,
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
        userSelect: "none",
      }}
    >
      {/* Gleam overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)",
        borderRadius: "inherit",
        pointerEvents: "none",
      }} />

      {/* Subtle noise grain */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
        opacity: 0.6,
        pointerEvents: "none",
      }} />

      {/* Radial glow */}
      <div style={{
        position: "absolute",
        top: "-30%",
        right: "-10%",
        width: "60%",
        height: "60%",
        borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Chip */}
      <div style={{
        position: "absolute",
        top: size === "sm" ? 20 : size === "md" ? 38 : 52,
        left: size === "sm" ? 14 : size === "md" ? 22 : 30,
        width: cfg.fontSize.chip.w,
        height: cfg.fontSize.chip.h,
        borderRadius: size === "sm" ? 3 : 5,
        background: `linear-gradient(135deg, ${theme.chipColor === "rgba(255,218,100,0.4)" ? "#FFD864" : "#D4AF7A"} 0%, ${theme.chipColor === "rgba(255,218,100,0.4)" ? "#C8A840" : "#B8943A"} 100%)`,
        boxShadow: "inset 0 1px 2px rgba(255,255,255,0.4), inset -1px -1px 2px rgba(0,0,0,0.3)",
        overflow: "hidden",
      }}>
        {/* Chip lines */}
        <div style={{
          position: "absolute",
          top: "30%",
          left: 0,
          right: 0,
          height: "1px",
          background: "rgba(0,0,0,0.2)",
        }} />
        <div style={{
          position: "absolute",
          top: "60%",
          left: 0,
          right: 0,
          height: "1px",
          background: "rgba(0,0,0,0.2)",
        }} />
        <div style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "40%",
          width: "1px",
          background: "rgba(0,0,0,0.2)",
        }} />
      </div>

      {/* Network logo — top right */}
      {network && (
        <div style={{
          position: "absolute",
          top: size === "sm" ? 10 : size === "md" ? 18 : 24,
          right: size === "sm" ? 10 : size === "md" ? 18 : 24,
          fontSize: cfg.fontSize.network,
          fontWeight: 700,
          color: theme.accentColor,
          letterSpacing: "0.05em",
          fontStyle: "italic",
          opacity: 0.9,
        }}>
          {network}
        </div>
      )}

      {/* Card number dots */}
      <div style={{
        position: "absolute",
        bottom: size === "sm" ? 28 : size === "md" ? 46 : 64,
        left: size === "sm" ? 14 : size === "md" ? 22 : 30,
        fontSize: cfg.fontSize.dots,
        color: theme.accentColor,
        letterSpacing: "0.25em",
        opacity: 0.6,
        fontFamily: "monospace",
      }}>
        •••• •••• •••• ••••
      </div>

      {/* Bottom row: card name + balance */}
      <div style={{
        position: "absolute",
        bottom: size === "sm" ? 10 : size === "md" ? 18 : 24,
        left: size === "sm" ? 14 : size === "md" ? 22 : 30,
        right: size === "sm" ? 14 : size === "md" ? 22 : 30,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: size === "sm" ? "5px" : size === "md" ? "8px" : "10px",
            color: theme.accentColor,
            opacity: 0.6,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 2,
          }}>
            {card?.issuer ?? "Issuer"}
          </div>
          <div style={{
            fontSize: cfg.fontSize.name,
            color: theme.textColor,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {card?.name ?? "Credit Card"}
          </div>
        </div>

        {balance !== undefined && balance > 0 && size !== "sm" && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{
              fontSize: size === "md" ? "7px" : "9px",
              color: theme.accentColor,
              opacity: 0.6,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 1,
            }}>
              Points
            </div>
            <div style={{
              fontSize: size === "md" ? "12px" : "15px",
              color: theme.textColor,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}>
              {balance.toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
