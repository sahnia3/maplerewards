/* Editorial typography primitives.
 * Mirror prototype class names so JSX reads identically.
 */
import type { CSSProperties, ReactNode } from "react";

export function Eyebrow({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span className={`eyebrow ${className ?? ""}`} style={style}>
      {children}
    </span>
  );
}

export function Display({
  children,
  as: Tag = "h1",
  style,
  className,
}: {
  children: ReactNode;
  as?: "h1" | "h2" | "h3" | "div" | "span";
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <Tag className={`display ${className ?? ""}`} style={style}>
      {children}
    </Tag>
  );
}

export function Serif({
  children,
  italic = false,
  style,
  className,
}: {
  children: ReactNode;
  italic?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={`serif ${className ?? ""}`}
      style={{ fontStyle: italic ? "italic" : "normal", ...style }}
    >
      {children}
    </span>
  );
}

export function Mono({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span className={`mono ${className ?? ""}`} style={style}>
      {children}
    </span>
  );
}

/* Tiny line ornament between kicker segments — used in mr-hero-kicker. */
export function KickerRule() {
  return <span className="mr-kicker-line" aria-hidden />;
}
