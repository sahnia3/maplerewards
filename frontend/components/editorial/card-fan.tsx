"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * CardFan — 3D credit-card stack with hover-lift + click-to-navigate.
 *
 * No auto-bobbing. Cards stay still at rest. Only the user's mouse triggers motion.
 * Hover any card → it lifts, scales, glows; others recede. Click → /cards/[id].
 * ───────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cardImageUrl } from "@/lib/card-images";

type CardData = {
  id: string;
  name: string;
  fullName: string;        // exact backend card name for image lookup
  issuer: string;
  network: string;
  accent: string;
  foreground: string;
  chip: string;
  motif: "aero" | "wave" | "leaf" | "topo" | "compass";
};

const CARDS: CardData[] = [
  { id: "aeroplan",        name: "Aeroplan Reserve",        fullName: "American Express Aeroplan Reserve", issuer: "Amex",   network: "AMERICAN EXPRESS",  accent: "linear-gradient(135deg, #17283D 0%, #0C1624 62%, #050911 100%)", foreground: "#F3E7C3", chip: "#C8A653", motif: "aero"    },
  { id: "amex-cobalt",     name: "Cobalt",                  fullName: "Amex Cobalt",                       issuer: "Amex",   network: "AMERICAN EXPRESS",  accent: "linear-gradient(160deg, #204E7A 0%, #102D4B 62%, #061423 100%)", foreground: "#EAF2F7", chip: "#B8C7D3", motif: "wave"    },
  { id: "cibc-aventura",   name: "Aventura Visa Infinite",  fullName: "CIBC Aventura Visa Infinite",       issuer: "CIBC",   network: "VISA INFINITE",     accent: "linear-gradient(150deg, #A51F2D 0%, #74131D 58%, #35080E 100%)", foreground: "#F6E8DF", chip: "#DDB27E", motif: "leaf"    },
  { id: "scotia-passport", name: "Passport Visa Infinite",  fullName: "Scotiabank Passport Visa Infinite", issuer: "Scotia", network: "VISA INFINITE",     accent: "linear-gradient(150deg, #2B3036 0%, #171B20 58%, #07090C 100%)", foreground: "#F1ECE2", chip: "#B99A4F", motif: "topo"    },
  { id: "rbc-avion",       name: "Avion Infinite Privilege",fullName: "RBC Avion Visa Infinite Privilege", issuer: "RBC",    network: "VISA INFINITE",     accent: "linear-gradient(155deg, #1F654D 0%, #123A2E 62%, #071A14 100%)", foreground: "#EAE2C9", chip: "#C8A862", motif: "compass" },
];

/* ── Editorial card-face motifs (single-stroke line art) ─────────────────── */
function CardMotif({ motif, color }: { motif: CardData["motif"]; color: string }) {
  if (motif === "aero") {
    return (
      <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18, pointerEvents: "none" }}>
        <defs>
          <linearGradient id="g-aero" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.9" />
            <stop offset="1" stopColor={color} stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {[...Array(7)].map((_, i) => (
          <circle key={i} cx="180" cy="40" r={20 + i * 22} fill="none" stroke="url(#g-aero)" strokeWidth="0.6" />
        ))}
      </svg>
    );
  }
  if (motif === "wave") {
    return (
      <svg viewBox="0 0 320 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.22, pointerEvents: "none" }}>
        {[...Array(12)].map((_, i) => (
          <path
            key={i}
            d={`M-20 ${60 + i * 12} Q 80 ${40 + i * 12} 160 ${60 + i * 12} T 340 ${60 + i * 12}`}
            fill="none"
            stroke={color}
            strokeWidth="0.5"
            strokeOpacity={0.5 - i * 0.03}
          />
        ))}
      </svg>
    );
  }
  if (motif === "leaf") {
    return (
      <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.22, pointerEvents: "none" }}>
        <g stroke={color} strokeWidth="0.6" fill="none">
          <path d="M150 30 L140 60 L160 55 L150 80 L170 75 L155 100 L175 95 L150 130 L130 110 L135 130 L120 110 L110 130 L100 105 L90 130 L80 110 L85 130 L70 110 L50 130 L60 100 L40 105 L55 80 L35 75 L50 60 L40 55 L60 60 L55 30 L70 50 L80 35 L90 50 L100 30 L110 50 L120 35 L130 50 Z" />
        </g>
      </svg>
    );
  }
  if (motif === "topo") {
    return (
      <svg viewBox="0 0 320 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18, pointerEvents: "none" }}>
        {[...Array(9)].map((_, i) => (
          <path
            key={i}
            d={`M-20 ${30 + i * 20} C 60 ${10 + i * 20} 140 ${50 + i * 20} 200 ${30 + i * 20} S 320 ${50 + i * 20} 360 ${30 + i * 20}`}
            fill="none"
            stroke={color}
            strokeWidth="0.4"
          />
        ))}
      </svg>
    );
  }
  if (motif === "compass") {
    return (
      <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.20, pointerEvents: "none" }}>
        <g stroke={color} strokeWidth="0.5" fill="none">
          <circle cx="160" cy="100" r="60" />
          <circle cx="160" cy="100" r="44" />
          <circle cx="160" cy="100" r="28" />
          {[...Array(36)].map((_, i) => {
            const a = (i * 10 * Math.PI) / 180;
            const r1 = 60;
            const r2 = i % 3 === 0 ? 68 : 64;
            return (
              <line
                key={i}
                x1={160 + Math.cos(a) * r1}
                y1={100 + Math.sin(a) * r1}
                x2={160 + Math.cos(a) * r2}
                y2={100 + Math.sin(a) * r2}
              />
            );
          })}
        </g>
      </svg>
    );
  }
  return null;
}

/* ── Single 3D card face ──────────────────────────────────────────────── */
function Card3D({ card, scale = 1, label }: { card: CardData; scale?: number; label?: string | null }) {
  const photo = cardImageUrl(card.fullName);
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!photo && !photoFailed;
  return (
    <div
      style={{
        position: "absolute",
        width: 320 * scale,
        height: 200 * scale,
        borderRadius: 16,
        background: card.accent,
        color: card.foreground,
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow:
          "0 34px 70px -22px rgba(0,0,0,0.58), 0 18px 38px -20px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.20)",
        overflow: "hidden",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Real card photo when available — covers the gradient + chip + motif */}
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo!}
          alt={card.name}
          loading="eager"
          onError={() => setPhotoFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 0,
          }}
        />
      )}

      {/* Specular sweep — slow drift on hover */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.10) 48%, rgba(255,255,255,0) 60%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Motif art — only on the gradient fallback */}
      {!showPhoto && <CardMotif motif={card.motif} color={card.foreground} />}

      {/* Gradient-only overlay: chip + network + name + number row.
       * When a real photo renders we suppress these so the issuer's marketing
       * art reads cleanly without competing typography. */}
      {!showPhoto && (
        <>
          <div
            style={{
              position: "absolute",
              top: 26,
              left: 22,
              width: 38,
              height: 28,
              borderRadius: 5,
              background: `linear-gradient(135deg, ${card.chip}, color-mix(in srgb, ${card.chip} 60%, #000))`,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.3)",
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 30,
              right: 22,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              color: card.foreground,
              opacity: 0.78,
              zIndex: 2,
            }}
          >
            {card.network}
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 64,
              left: 22,
              right: 22,
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontStyle: "italic",
              letterSpacing: "-0.01em",
              color: card.foreground,
              lineHeight: 1.05,
              zIndex: 2,
            }}
          >
            {card.name}
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 22,
              left: 22,
              right: 22,
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.20em",
              color: card.foreground,
              opacity: 0.62,
              zIndex: 2,
            }}
          >
            <span>•••• •••• •••• {card.id.slice(-4).toUpperCase()}</span>
            <span style={{ fontSize: 10 }}>{card.issuer.toUpperCase()}</span>
          </div>
        </>
      )}

      {/* Best label — sits above whichever face we rendered */}
      {label && (
        <span
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.20em",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            padding: "4px 9px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.22)",
            zIndex: 3,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/* ── CardFan — animated 3D fan with hover-lift + parallax ─────────────── */
export function CardFan({
  height = "100%",
  intensity = 0.65,
  focusIndex = 2,
}: {
  height?: string;
  intensity?: number;
  focusIndex?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  /* null at rest = no card elevated. Only changes when the user actually hovers a card.
   * focusIndex is cosmetic — the BEST badge — but no longer drives elevation. */
  const [hover, setHover] = useState<number | null>(null);
  const [tilt, setTilt] = useState({ x: -8, y: 0 });

  /* mouse-driven parallax (ambient bob is per-card CSS keyframes — see globals) */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      setTilt({ x: -8 - y * 10, y: x * 14 });
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, []);

  const N = CARDS.length;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        height,
        perspective: 1800,
        perspectiveOrigin: "50% 50%",
      }}
      onMouseLeave={() => setHover(null)}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1)",
          /* The 3D-rotated stack swallows hit-tests under preserve-3d in WebKit/
           * Chromium — elementFromPoint returns this div instead of the cards
           * that visually occupy the same pixels. Disable hit-testing here and
           * re-enable on each card wrapper so events reach the right element. */
          pointerEvents: "none",
        }}
      >
        {CARDS.map((card, i) => {
          const center = (N - 1) / 2;
          const offset = i - center;
          const atRest = hover === null;
          const isHover = i === hover;
          /* When the user is hovering some other card, this card sinks + dims. */
          const otherHovered = !atRest && !isHover;
          /* Wide horizontal spread so every card has a visible, clickable edge.
           * Previous value (40 px) had cards overlapping by 200+ px, so the leftmost
           * three were entirely covered by the center card and unhittable. */
          const x = offset * 78;
          /* Lift the outer cards slightly so they feel like a fan, not a flat row. */
          const restY = Math.abs(offset) * 6;
          /* Z separation:
           *  - rest: outer cards sit further back, but not so far that they're 3D-clipped.
           *  - user hovers a card: that card flies forward; others sink back further. */
          const z = isHover ? 180 : -Math.abs(offset) * 14 - (otherHovered ? 12 : 0);
          /* Rotation: a stronger fan twist now that cards aren't all stacked dead-center. */
          const rotZ = offset * 9 + (isHover ? -offset * 7 : 0);
          /* Lift only on actual user hover, plus the tiny rest-arc lift. */
          const liftY = isHover ? -52 : restY;
          /* Scale: at rest all cards equal; user hover lifts the focused card and slightly recedes others. */
          const scaleFactor = isHover ? 1.1 : otherHovered ? 0.96 : 1;
          /* Stack: hovered always wins; otherwise the BEST card (focusIndex) sits highest,
           * with neighbours layered around it so each card has a visible side edge.
           * This is what makes every card hittable. */
          const distFromFocus = Math.abs(i - focusIndex);
          const zIndex = isHover ? 999 : 200 - distFromFocus * 10;
          /* Wrapper takes the exact rendered card size so elementFromPoint
           * correctly associates the visible pixels with the click handler.
           * Earlier the wrapper was 0×0 (no width/height) and Card3D inside
           * painted out of bounds — Aeroplan and Cobalt's hit-area was nowhere
           * even though their pixels were visible. */
          const cardScale = 0.86;
          const cardW = 320 * cardScale;
          const cardH = 200 * cardScale;
          return (
            <div
              key={card.id}
              onMouseEnter={() => setHover(i)}
              onClick={() => router.push("/cards")}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: cardW,
                height: cardH,
                marginLeft: -cardW / 2,
                marginTop: -cardH / 2,
                transformStyle: "preserve-3d",
                transformOrigin: "center",
                transform: `translate3d(${x}px, ${liftY}px, ${z}px) rotateZ(${rotZ}deg) rotateY(${offset * -4}deg) scale(${scaleFactor})`,
                transition: "transform 420ms cubic-bezier(0.2, 0.7, 0.2, 1), filter 320ms ease",
                zIndex,
                cursor: "pointer",
                pointerEvents: "auto",
                filter: isHover
                  ? "drop-shadow(0 40px 60px rgba(0,0,0,0.40)) drop-shadow(0 8px 18px rgba(165,31,45,0.25))"
                  : otherHovered
                    ? "brightness(0.86) saturate(0.82)"
                    : "none",
              }}
            >
              <Card3D card={card} scale={cardScale} label={i === focusIndex ? "BEST" : null} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
