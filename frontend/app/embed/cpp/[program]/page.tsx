"use client";

import { use, useEffect, useState } from "react";
import { BASE_URL } from "@/lib/api";

/**
 * /embed/cpp/[program] — iframe-friendly CPP badge.
 *
 * Designed to be dropped onto any rewards-blog or community site:
 *   <iframe src="https://maplerewards.app/embed/cpp/aeroplan"
 *           width="220" height="92" style="border:0" loading="lazy"></iframe>
 *
 * AppShell skips chrome for /embed/* paths, so the entire viewport is the
 * badge surface. Minimal styling, no nav, no fonts beyond what's already
 * loaded by the parent root layout.
 */
interface Program {
  slug: string;
  name: string;
  base_cpp: number;
  currency_name?: string;
}

export default function CPPBadge({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program } = use(params);
  const [data, setData] = useState<Program | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE_URL}/programs/${encodeURIComponent(program)}/detail`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((d: { program?: Program } | Program) => {
        // Some endpoints wrap, some don't — accept either shape.
        const p = (d as { program?: Program }).program ?? (d as Program);
        setData(p);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load"));
  }, [program]);

  if (err) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>Program not found</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={containerStyle}>
        <div style={{ ...labelStyle, opacity: 0.6 }}>Loading…</div>
      </div>
    );
  }

  return (
    <a
      href="https://maplerewards.app"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        ...containerStyle,
        textDecoration: "none",
      }}
      title={`Live ${data.name} CPP from Maple Rewards`}
    >
      <div style={labelStyle}>{data.name.toUpperCase()} · CPP</div>
      <div style={valueStyle}>
        {data.base_cpp.toFixed(2)}
        <span style={centsStyle}>¢</span>
      </div>
      <div style={brandStyle}>
        <span style={leafStyle}>●</span> maple
      </div>
    </a>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "12px 16px",
  width: "100%",
  height: "100%",
  minHeight: 92,
  fontFamily:
    "var(--font-inter-tight), -apple-system, Helvetica, Arial, sans-serif",
  background: "#FBF7EE",
  color: "#1A1410",
  border: "1px solid #EAE2D2",
  borderRadius: 8,
  boxSizing: "border-box",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: 10,
  letterSpacing: "0.14em",
  color: "#5A5347",
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontFamily: "var(--font-instrument-serif), Georgia, serif",
  fontSize: 32,
  lineHeight: 1,
  color: "#A51F2D",
  fontWeight: 400,
};

const centsStyle: React.CSSProperties = {
  fontSize: 18,
  marginLeft: 2,
  color: "#A51F2D",
};

const brandStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#5A5347",
  fontWeight: 600,
  letterSpacing: "0.02em",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const leafStyle: React.CSSProperties = {
  color: "#A51F2D",
  fontSize: 8,
};

const errorStyle: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: 11,
  color: "#5A5347",
};
