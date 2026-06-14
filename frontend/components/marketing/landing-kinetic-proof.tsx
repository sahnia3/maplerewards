"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useMotionValueEvent } from "framer-motion";

/* Toronto dolly-in cinematic.
 *
 * Desktop: scroll-scrubbed. The 200vh container pins a 100vh stage (position:
 * sticky) and binds the video's `currentTime` to scroll progress — scroll down,
 * the dolly pushes in. This is the iPhone-launch-page scrub technique. It needs
 * position:sticky to actually work, which requires NO ancestor to be a scroll
 * container (body uses overflow-x: clip, not hidden, for exactly this reason).
 *
 * Mobile: the currentTime-scrub technique is unreliable on iOS Safari (seeking
 * a video frame-by-frame on touch scroll is janky/blocked, and a heavy file may
 * never preload on cellular), so phones get a normal autoplaying muted loop in
 * a regular-height section instead — guaranteed to actually play.
 *
 * Source: `-scrub.mp4` is the ffmpeg-rebuilt every-frame-keyframe version
 * (-g 1 -keyint_min 1 -sc_threshold 0) — far smaller (6.5MB vs 15MB) AND seeks
 * instantly, so it scrubs smoothly instead of ping-ponging between sparse
 * keyframes. A poster gives an instant first paint and a no-decode fallback. */
const VIDEO_SCRUB_SRC = "/landing/toronto-dolly-scrub.mp4";
// Mobile loop is a phone-sized 960x540 / faststart / no-audio encode (~0.5MB vs
// the 7.6MB 720p master) so it starts instantly and never rebuffers mid-loop on
// cellular. Desktop keeps the full-res scrub above.
const VIDEO_LOOP_SRC = "/landing/toronto-dolly-mobile.mp4";
const VIDEO_POSTER = "/landing/toronto-dolly-poster.jpg";
const VIDEO_DURATION_SEC = 8;

/* Shared framed-window styling for the video in both modes. */
const FRAME_STYLE: React.CSSProperties = {
  position: "relative",
  width: "min(94vw, 1680px)",
  aspectRatio: "16 / 9",
  maxHeight: "88vh",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow:
    "0 40px 80px -20px rgba(0, 0, 0, 0.55), 0 24px 48px -16px rgba(0, 0, 0, 0.35), var(--shadow-accent-glow)",
  border: "1px solid var(--rule-strong)",
  background: "#0a0606",
};

function InnerVignette() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 60%, rgba(10, 6, 6, 0.35) 100%)",
        pointerEvents: "none",
      }}
    />
  );
}

export function LandingKineticProof() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  /* null until measured (avoids a hydration flash); then true on touch/narrow. */
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  /* Forward-only watermark for the desktop scrub: tracks the furthest
   * currentTime reached so scroll-up never rewinds the dolly. */
  const watermarkRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /* Scroll through the container (desktop only — harmless on mobile). */
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  /* Map scroll to playhead. The video spans almost the whole pinned range so
   * there is no long "dead scroll" tail where the dolly has finished but the
   * stage is still pinned — that tail read as an awkward empty gap. */
  const playhead = useTransform(scrollYProgress, [0.12, 0.82], [0, VIDEO_DURATION_SEC], { clamp: true });

  useMotionValueEvent(playhead, "change", (t) => {
    const v = videoRef.current;
    if (!v || !videoReady || isMobile) return;
    if (t <= watermarkRef.current) return; // forward-only
    watermarkRef.current = t;
    if (Math.abs(v.currentTime - t) > 0.02) {
      v.currentTime = t;
    }
  });

  /* Eyebrow + caption fades, tied to raw scroll progress (desktop). */
  const eyebrowOpacity = useTransform(scrollYProgress, [0.05, 0.18], [0, 1]);
  const eyebrowY = useTransform(scrollYProgress, [0.05, 0.18], [12, 0]);
  const captionOpacity = useTransform(scrollYProgress, [0.7, 0.88], [0, 1]);
  const captionY = useTransform(scrollYProgress, [0.7, 0.88], [16, 0]);

  /* Mobile scroll animation: a reliable transform-based dolly-in reveal driven
   * by the section's scroll progress (NOT video currentTime — that's the janky
   * path iOS blocks). The framed loop lifts, fades and scales up as it enters,
   * then eases to a gentle over-scale, so the section feels alive on scroll.
   * Hooks are declared unconditionally here; only applied in the mobile branch. */
  const mFrameOpacity = useTransform(scrollYProgress, [0.02, 0.22], [0, 1], { clamp: true });
  const mFrameY = useTransform(scrollYProgress, [0.02, 0.3], [56, 0], { clamp: true });
  const mFrameScale = useTransform(scrollYProgress, [0.02, 0.5, 1], [0.9, 1, 1.05], { clamp: true });

  /* Desktop scrub: seek to frame 0 once when metadata is ready (re-firing
   * canplay must not reset currentTime — that caused first/last-frame flicker). */
  useEffect(() => {
    if (isMobile !== false) return; // only wire the scrub on desktop
    const v = videoRef.current;
    if (!v) return;
    let didSeekInitial = false;
    const onReady = () => {
      setVideoReady(true);
      if (!didSeekInitial) {
        didSeekInitial = true;
        try { v.currentTime = 0; } catch {}
      }
    };
    v.addEventListener("loadedmetadata", onReady);
    v.addEventListener("canplay", onReady);
    return () => {
      v.removeEventListener("loadedmetadata", onReady);
      v.removeEventListener("canplay", onReady);
    };
  }, [isMobile]);

  /* Mobile autoplay: iOS Safari defers loading/playing an offscreen muted
   * video and ignores a mount-time play() before the body is buffered — that
   * left the section frozen on its poster (readyState stuck at metadata,
   * currentTime pinned at 0) for several seconds on cellular, which reads as
   * "broken". The reliable iOS pattern is: preload the body eagerly (preload
   * "auto" on the element) AND fire play() when the section scrolls into view,
   * which is when iOS actually permits inline muted autoplay. Muted +
   * playsInline keeps it within the allowed-autoplay rules; if a browser still
   * blocks it the poster stays visible so the section is never an empty box. */
  useEffect(() => {
    if (isMobile !== true) return;
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      v.muted = true;
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) tryPlay();
      },
      { threshold: 0.15 },
    );
    io.observe(v);
    v.addEventListener("canplay", tryPlay);
    return () => {
      io.disconnect();
      v.removeEventListener("canplay", tryPlay);
    };
  }, [isMobile]);

  // ── Mobile: autoplaying muted loop with a scroll-linked dolly-in reveal ─────
  if (isMobile) {
    return (
      <section
        ref={containerRef}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          padding: "clamp(40px, 10vh, 80px) clamp(8px, 2.5vw, 16px)",
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(242, 237, 227, 0.78)",
            fontWeight: 600,
            padding: "8px 16px",
            background: "rgba(10, 6, 6, 0.35)",
            borderRadius: 999,
            border: "1px solid rgba(242, 237, 227, 0.08)",
          }}
        >
          Built into every Canadian wallet
        </span>

        <motion.div style={{ ...FRAME_STYLE, width: "100%", maxHeight: "none", opacity: mFrameOpacity, y: mFrameY, scale: mFrameScale }}>
          <video
            ref={videoRef}
            src={VIDEO_LOOP_SRC}
            poster={VIDEO_POSTER}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
            }}
          />
          <InnerVignette />
        </motion.div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center", padding: "0 8px" }}>
          <h2
            className="display"
            style={{
              fontSize: "clamp(24px, 7vw, 34px)",
              fontStyle: "italic",
              letterSpacing: "-0.015em",
              color: "#F2EDE3",
              textShadow: "0 2px 24px rgba(0,0,0,0.6)",
              lineHeight: 1.05,
              margin: 0,
              fontWeight: 400,
            }}
          >
            Every Bay Street wallet, optimized.
          </h2>
          <span
            className="serif"
            style={{
              marginTop: 4,
              fontSize: "clamp(13px, 3.6vw, 15px)",
              fontStyle: "italic",
              color: "rgba(242, 237, 227, 0.72)",
              lineHeight: 1.45,
              maxWidth: 460,
            }}
          >
            Maple knows which card to swipe before you walk through the door.
          </span>
        </div>
      </section>
    );
  }

  // ── Desktop (and pre-measure default): pinned scroll-scrub ──────────────────
  return (
    <section ref={containerRef} style={{ position: "relative", height: "200vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div style={FRAME_STYLE}>
          <video
            ref={videoRef}
            src={VIDEO_SCRUB_SRC}
            poster={VIDEO_POSTER}
            muted
            playsInline
            preload="auto"
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
            }}
          />
          <InnerVignette />
        </div>

        {/* Eyebrow — fades in as the section enters */}
        <motion.div
          style={{
            position: "absolute",
            top: "clamp(40px, 8vh, 80px)",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: eyebrowOpacity,
            y: eyebrowY,
            pointerEvents: "none",
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(242, 237, 227, 0.78)",
              fontWeight: 600,
              padding: "8px 16px",
              background: "rgba(10, 6, 6, 0.35)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              borderRadius: 999,
              border: "1px solid rgba(242, 237, 227, 0.08)",
            }}
          >
            Built into every Canadian wallet · scroll
          </span>
        </motion.div>

        {/* Caption that lands at the end of the scrub */}
        <motion.div
          style={{
            position: "absolute",
            bottom: "clamp(40px, 8vh, 80px)",
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: captionOpacity,
            y: captionY,
            pointerEvents: "none",
            padding: "0 clamp(20px, 4vw, 60px)",
            textAlign: "center",
          }}
        >
          <h2
            className="display"
            style={{
              fontSize: "clamp(28px, 3.5vw, 42px)",
              fontStyle: "italic",
              letterSpacing: "-0.015em",
              color: "#F2EDE3",
              textShadow: "0 2px 24px rgba(0,0,0,0.6)",
              lineHeight: 1.05,
              margin: 0,
              fontWeight: 400,
            }}
          >
            Every Bay Street wallet, optimized.
          </h2>
          <span
            className="serif"
            style={{
              marginTop: 4,
              fontSize: "clamp(13px, 1.1vw, 15px)",
              fontStyle: "italic",
              color: "rgba(242, 237, 227, 0.72)",
              textShadow: "0 1px 12px rgba(0,0,0,0.6)",
              lineHeight: 1.45,
              maxWidth: 520,
            }}
          >
            One window at a time — Maple knows which card to swipe before you walk through it.
          </span>
        </motion.div>
      </div>
    </section>
  );
}
