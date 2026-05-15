"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useMotionValueEvent, useSpring } from "framer-motion";

/* Scroll-scrubbed Toronto dolly-in video.
 *
 * Previous iterations of this section used a static count-up number,
 * then a scroll-bound dollar figure with receipt ledger; the user
 * called those visually weak. This version replaces them with a
 * Kling-3.0-rendered 8-second cinematic dolly: three Toronto towers
 * at twilight that the camera pushes into, eventually crossing the
 * glass into a lit office where a silhouetted figure walks past.
 *
 * The video does NOT autoplay. Its `currentTime` is bound to the
 * user's scroll position through the 220vh container — scroll down,
 * dolly pushes in; scroll back, it rewinds. This is the iPhone-launch-
 * page scrubbing technique.
 *
 * For smooth scrubbing on long scroll jumps the video would benefit
 * from re-encoding with every-frame keyframes (ffmpeg -g 1), but the
 * stock MP4 from Kling scrubs acceptably for hero use. */

const VIDEO_SRC = "/landing/toronto-dolly.mp4";
const VIDEO_DURATION_SEC = 8;

export function LandingKineticProof() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  /* Track scroll through the 220vh container. start/end offsets:
   * - "start end" → section top hits viewport bottom → progress = 0
   * - "end start" → section bottom hits viewport top → progress = 1 */
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  /* Smooth the scroll value so trackpad/wheel jitter doesn't translate
   * directly into video frame jumps. Springs lerp toward target over
   * a few hundred ms. */
  const smoothed = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.5,
  });

  /* Push the active scrubbing window into 0.15 → 0.85 of the scroll
   * range so the video isn't pegged at frame 0 / final frame too long
   * at the section edges. */
  const playhead = useTransform(smoothed, [0.15, 0.85], [0, VIDEO_DURATION_SEC], { clamp: true });

  /* Bind video.currentTime to the playhead motion value. The video is
   * paused; we only mutate currentTime. The browser renders whichever
   * frame the playhead lands on. */
  useMotionValueEvent(playhead, "change", (t) => {
    const v = videoRef.current;
    if (!v || !videoReady) return;
    /* Avoid micro-jitter resets — only seek if the delta is meaningful. */
    if (Math.abs(v.currentTime - t) > 0.03) {
      v.currentTime = t;
    }
  });

  /* Eyebrow + descriptor fade timing tied to scroll. */
  const eyebrowOpacity = useTransform(smoothed, [0.05, 0.18], [0, 1]);
  const eyebrowY = useTransform(smoothed, [0.05, 0.18], [12, 0]);
  const captionOpacity = useTransform(smoothed, [0.75, 0.9], [0, 1]);
  const captionY = useTransform(smoothed, [0.75, 0.9], [16, 0]);

  /* Force the video to load + seek to frame 0 once it's loadable, so
   * the first frame is on-screen even before any scroll. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onCanPlay = () => {
      setVideoReady(true);
      try { v.currentTime = 0; } catch {}
    };
    v.addEventListener("loadedmetadata", onCanPlay);
    v.addEventListener("canplay", onCanPlay);
    return () => {
      v.removeEventListener("loadedmetadata", onCanPlay);
      v.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  return (
    <section ref={containerRef} style={{ position: "relative", height: "220vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          background: "#0a0606",
        }}
      >
        {/* The video itself — cover-fits the viewport, no controls */}
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          muted
          playsInline
          preload="auto"
          /* Don't autoplay — currentTime is driven by scroll. */
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

        {/* Vignette to ground the video in the brand atmosphere — fades
            cool edges into the burgundy-grain canvas. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 50%, rgba(10, 6, 6, 0.45) 100%), linear-gradient(180deg, rgba(10,6,6,0.30) 0%, transparent 22%, transparent 78%, rgba(10,6,6,0.55) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Eyebrow at top — fades in as the section enters */}
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

        {/* Caption that lands at the end of the scrub — "what was the point" */}
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
          <span
            className="display"
            style={{
              fontSize: "clamp(28px, 3.5vw, 42px)",
              fontStyle: "italic",
              letterSpacing: "-0.015em",
              color: "#F2EDE3",
              textShadow: "0 2px 24px rgba(0,0,0,0.6)",
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            Every Bay Street wallet, optimized.
          </span>
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
