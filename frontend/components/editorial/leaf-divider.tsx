/* LeafDivider — 1px rule with a tiny lime maple-leaf glyph in the centre.
 * Used between sections in editorial layouts.
 */
export function LeafDivider({ width = "100%" }: { width?: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        margin: "32px auto",
        width,
      }}
      aria-hidden
    >
      <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
      <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--lime)">
        <path d="M12 2 L13.2 6.2 L17 4.5 L15.5 8.5 L20 8 L17.5 11 L22 12.5 L18.5 14 L20.5 17.5 L16.5 16 L17 20.5 L13.5 18 L12 22 L10.5 18 L7 20.5 L7.5 16 L3.5 17.5 L5.5 14 L2 12.5 L6.5 11 L4 8 L8.5 8.5 L7 4.5 L10.8 6.2 Z" />
      </svg>
      <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
    </div>
  );
}

/* Reusable maple-leaf glyph (lime fill, single-path silhouette). */
export function MapleLeaf({
  size = 14,
  fill = "var(--lime)",
}: {
  size?: number;
  fill?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="none"
      aria-hidden
    >
      <path d="M12 2 L13.2 6.2 L17 4.5 L15.5 8.5 L20 8 L17.5 11 L22 12.5 L18.5 14 L20.5 17.5 L16.5 16 L17 20.5 L13.5 18 L12 22 L10.5 18 L7 20.5 L7.5 16 L3.5 17.5 L5.5 14 L2 12.5 L6.5 11 L4 8 L8.5 8.5 L7 4.5 L10.8 6.2 Z" />
    </svg>
  );
}
