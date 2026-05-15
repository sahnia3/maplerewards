"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useMotionValueEvent } from "framer-motion";

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

/* `-scrub.mp4` is the ffmpeg-rebuilt version with every-frame keyframes
 * (-g 1 -keyint_min 1 -sc_threshold 0). Stock MP4 from Kling had
 * keyframes ~every 30 frames → backward seeks were expensive and made
 * the scrub feel like ping-ponging. With per-frame keyframes the
 * browser can seek to any time instantly. */
const VIDEO_SRC = "/landing/toronto-dolly-scrub.mp4";
const VIDEO_DURATION_SEC = 8;

export function LandingKineticProof() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  /* Forward-only watermark: tracks the furthest currentTime the user has
   * reached. Once the video has advanced to a frame, it never rewinds —
   * scroll-up keeps the video where it is. Per user request: "once you
   * scroll down, you see the video and then after that you can't go back." */
  const watermarkRef = useRef(0);

  /* Track scroll through the 220vh container. */
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  /* No spring — was adding 200-300ms of lag making the scrub feel
   * disconnected from the wheel. Raw scrollYProgress is the source of
   * truth; we only smooth the video binding via the watermark below. */
  const playhead = useTransform(scrollYProgress, [0.15, 0.85], [0, VIDEO_DURATION_SEC], { clamp: true });

  /* Forward-only binding: the video's currentTime is monotonically
   * non-decreasing. If the user scrolls back, the video stays at the
   * watermark frame; if they scroll forward past the watermark, the
   * video catches up. */
  useMotionValueEvent(playhead, "change", (t) => {
    const v = videoRef.current;
    if (!v || !videoReady) return;
    /* Only advance — never rewind. */
    if (t <= watermarkRef.current) return;
    watermarkRef.current = t;
    /* Threshold avoids redundant seeks on micro-deltas. */
    if (Math.abs(v.currentTime - t) > 0.02) {
      v.currentTime = t;
    }
  });

  /* Eyebrow + caption fade tied to RAW progress (these can fade in/out
   * with scroll; only the video is locked forward-only). */
  const eyebrowOpacity = useTransform(scrollYProgress, [0.05, 0.18], [0, 1]);
  const eyebrowY = useTransform(scrollYProgress, [0.05, 0.18], [12, 0]);
  const captionOpacity = useTransform(scrollYProgress, [0.75, 0.9], [0, 1]);
  const captionY = useTransform(scrollYProgress, [0.75, 0.9], [16, 0]);

  /* Mark the video ready once metadata is available. ONLY seeks to 0
   * on the very first ready event — the canplay event re-fires every
   * time the browser buffers a new chunk (e.g. after every scroll-seek),
   * and re-seeking to 0 each time was producing the "flickering between
   * first and last keyframe" symptom: the scrub set a frame, the seek
   * completed, canplay re-fired, currentTime reset to 0, next scroll
   * tick set a new frame, etc. The didSeekInitial flag fixes it. */
  useEffect(() => {
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
