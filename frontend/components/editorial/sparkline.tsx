"use client";

/* Sparkline — minimal SVG sparkline with optional fill underneath. */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "var(--accent)",
  filled = false,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  filled?: boolean;
}) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(" ");
  const pathD = `M${points.split(" ").join(" L")}`;
  const fillD = `${pathD} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {filled && <path d={fillD} fill={color} fillOpacity={0.12} />}
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
