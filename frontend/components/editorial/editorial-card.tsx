/* EditorialCardVisual — stylised credit-card sprite used in card grids.
 *
 * Modes:
 *  • imageUrl provided → render the real issuer-marketing photo at correct ratio
 *    with a subtle specular highlight + 1px ink border. Issuer/network text suppressed
 *    because the photo already shows them.
 *  • no imageUrl       → fall back to the editorial gradient stack with chip,
 *    network text, and foil number row.
 *
 * The img tag uses `onError` to fall back to the gradient if the URL 404s, so a
 * stale RewardsCanada link can never produce a broken image icon in the UI.
 */

"use client";
import { useState } from "react";

type CardData = {
  name: string;
  issuer?: string;
  network?: string;     // 'amex'|'visa'|'mastercard'|'visa infinite'|'amex platinum'
  accentHex?: string;   // base color, falls back per network
  imageUrl?: string | null; // optional real card photo — overrides the gradient sprite
};

const NETWORK_ACCENTS: Record<string, string> = {
  amex: "linear-gradient(155deg, #C8A653 0%, #876C2C 60%, #2E2410 100%)",
  visa: "linear-gradient(155deg, #2B3036 0%, #171B20 58%, #07090C 100%)",
  "visa infinite": "linear-gradient(155deg, #1F654D 0%, #123A2E 62%, #071A14 100%)",
  mastercard: "linear-gradient(150deg, #A51F2D 0%, #74131D 58%, #35080E 100%)",
};

function pickAccent(network?: string, override?: string) {
  if (override) return override;
  const k = (network ?? "").toLowerCase();
  return NETWORK_ACCENTS[k] ?? NETWORK_ACCENTS.visa;
}

export function EditorialCardVisual({
  card,
  size = "md",
}: {
  card: CardData;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? { w: 220, h: 140, name: 16, num: 8, chip: { w: 28, h: 20 } }
    : size === "lg" ? { w: 380, h: 240, name: 28, num: 11, chip: { w: 44, h: 32 } }
    : { w: 300, h: 188, name: 22, num: 10, chip: { w: 38, h: 28 } };

  const accent = pickAccent(card.network, card.accentHex);
  const isAmex = (card.network ?? "").toLowerCase().includes("amex");
  const foreground = isAmex ? "#F3E7C3" : "#EAF2F7";
  const chipColor = isAmex ? "#C8A653" : "#B8C7D3";

  /* Photo branch — render the real card image, fall back to gradient on error. */
  const [imgFailed, setImgFailed] = useState(false);
  if (card.imageUrl && !imgFailed) {
    return (
      <div
        style={{
          position: "relative",
          width: dim.w,
          height: dim.h,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow:
            "0 22px 48px -22px rgba(0,0,0,0.45), 0 8px 18px -10px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.10)",
          border: "1px solid rgba(0,0,0,0.06)",
          background: "var(--card-fill)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl}
          alt={card.name}
          loading="lazy"
          onError={() => setImgFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
        {/* Specular sweep — gives the photo a credit-card-like sheen */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0) 62%)",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: dim.w,
        height: dim.h,
        borderRadius: 14,
        background: accent,
        color: foreground,
        boxShadow:
          "0 22px 48px -22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.18)",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Specular sweep */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.10) 48%, rgba(255,255,255,0) 60%)",
          pointerEvents: "none",
        }}
      />
      {/* Chip */}
      <div
        style={{
          position: "absolute",
          top: dim.h * 0.18,
          left: dim.w * 0.07,
          width: dim.chip.w,
          height: dim.chip.h,
          borderRadius: 5,
          background: `linear-gradient(135deg, ${chipColor}, color-mix(in srgb, ${chipColor} 60%, #000))`,
          boxShadow:
            "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      />
      {/* Network text top-right */}
      {card.network && (
        <div
          style={{
            position: "absolute",
            top: dim.h * 0.18 + 4,
            right: dim.w * 0.07,
            fontFamily: "var(--font-mono)",
            fontSize: dim.num,
            letterSpacing: "0.18em",
            color: foreground,
            opacity: 0.78,
            textTransform: "uppercase",
          }}
        >
          {card.network}
        </div>
      )}
      {/* Card name */}
      <div
        style={{
          position: "absolute",
          bottom: dim.h * 0.30,
          left: dim.w * 0.07,
          right: dim.w * 0.07,
          fontFamily: "var(--font-display)",
          fontSize: dim.name,
          letterSpacing: "-0.01em",
          color: foreground,
          lineHeight: 1.05,
        }}
      >
        {card.name}
      </div>
      {/* Number row + issuer */}
      <div
        style={{
          position: "absolute",
          bottom: dim.h * 0.10,
          left: dim.w * 0.07,
          right: dim.w * 0.07,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: dim.num,
          letterSpacing: "0.20em",
          color: foreground,
          opacity: 0.65,
        }}
      >
        <span>•••• •••• •••• {(card.name.replace(/\s+/g, "").toUpperCase()).slice(-4)}</span>
        {card.issuer && <span style={{ fontSize: dim.num - 1 }}>{card.issuer.toUpperCase()}</span>}
      </div>
    </div>
  );
}
