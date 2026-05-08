"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Editorial Button — the canonical interactive surface.
 *
 * Variants mirror the inline-styled buttons that the editorial pages were
 * already using (mono · uppercase · 0.10em letter-spacing · maple-red CTA).
 * Hover / focus-visible / disabled / loading are properly handled — fixing
 * the keyboard-nav and accessibility gaps flagged in the May 8 audit.
 *
 * Usage:
 *   <Button>Evaluate</Button>                // primary, md
 *   <Button variant="secondary" size="sm">…</Button>
 *   <Button variant="ghost">Skip</Button>
 *   <Button variant="danger">Delete watch</Button>
 *   <Button asChild><Link href="/wallet">Open wallet</Link></Button>
 *   <Button loading>Saving…</Button>
 */

const buttonVariants = cva(
  // Common: mono uppercase letter-spaced; flex-center; outline-none; transitions; disabled state.
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-mono font-semibold tracking-[0.10em] uppercase",
    "transition-[background-color,color,border-color,transform,opacity] duration-150",
    "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
    "disabled:cursor-not-allowed disabled:opacity-60",
    "active:translate-y-px",
    "[&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Maple-red CTA — the primary action across the app.
        primary: [
          "bg-[var(--accent)] text-white border border-[var(--accent)]",
          "hover:bg-[var(--accent-2)] hover:border-[var(--accent-2)]",
          "disabled:hover:bg-[var(--accent)] disabled:hover:border-[var(--accent)]",
        ].join(" "),
        // Outlined ink-on-paper — for secondary CTAs.
        secondary: [
          "bg-[var(--surface)] text-[var(--ink)] border border-[var(--rule-strong)]",
          "hover:bg-[var(--surface-2)] hover:border-[var(--ink)]",
          "disabled:hover:bg-[var(--surface)] disabled:hover:border-[var(--rule-strong)]",
        ].join(" "),
        // Text-only — for tertiary actions in dense rows.
        ghost: [
          "bg-transparent text-[var(--ink-2)] border border-transparent",
          "hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
          "disabled:hover:bg-transparent",
        ].join(" "),
        // Destructive confirm — used sparingly.
        danger: [
          "bg-[var(--loss)] text-white border border-[var(--loss)]",
          "hover:opacity-90",
        ].join(" "),
        // Inline link-style — sentence-flow actions.
        link: [
          "bg-transparent border-0 px-0 py-0 h-auto",
          "text-[var(--accent)] underline underline-offset-2 decoration-1",
          "hover:text-[var(--accent-2)] hover:decoration-2",
          "uppercase-none tracking-normal normal-case font-sans",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-3 text-[10px] rounded-md [&_svg]:size-3",
        md: "h-[42px] px-[22px] text-[12px] rounded-lg [&_svg]:size-4",
        lg: "h-[52px] px-8 text-[13px] rounded-lg [&_svg]:size-5",
        icon: "h-[42px] w-[42px] rounded-lg [&_svg]:size-4",
      },
    },
    compoundVariants: [
      // Link variant ignores size padding/height.
      { variant: "link", className: "h-auto px-0" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden
      className={cn("animate-spin", className)}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
  ref
) {
  const Comp = asChild ? Slot.Root : "button";
  const isDisabled = disabled || loading;

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant ?? "primary"}
      data-size={size ?? "md"}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? (
        <>
          <Spinner className="size-4" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export { Button, buttonVariants };
export type { ButtonProps };
