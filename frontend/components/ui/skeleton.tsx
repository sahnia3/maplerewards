"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/** Base skeleton with shimmer animation */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn("shimmer rounded-lg", className)}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Card-shaped skeleton loader */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-2xl p-5",
        className
      )}
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
      aria-hidden="true"
    >
      <div className="flex items-start gap-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
          <div className="flex gap-3 mt-4">
            <Skeleton className="h-12 flex-1 rounded-xl" />
            <Skeleton className="h-12 flex-1 rounded-xl" />
            <Skeleton className="h-12 flex-1 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Row skeleton for list items */
export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div
      className={cn("flex items-center gap-3 py-3", className)}
      aria-hidden="true"
    >
      <Skeleton className="w-8 h-8 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3 rounded" />
        <Skeleton className="h-2.5 w-1/3 rounded" />
      </div>
      <Skeleton className="h-4 w-16 rounded" />
    </div>
  );
}

/** Text line skeleton */
export function SkeletonText({
  lines = 3,
  className,
}: { lines?: number } & SkeletonProps) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3 rounded",
            i === lines - 1 ? "w-3/5" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

/** Chart area skeleton */
export function SkeletonChart({ className }: SkeletonProps) {
  return (
    <div
      className={cn("rounded-2xl p-5", className)}
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
      aria-hidden="true"
    >
      <div className="flex items-end gap-2 h-32">
        {[40, 65, 45, 80, 55, 70, 50, 85, 60, 75, 45, 90].map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-2 w-8 rounded" />
        ))}
      </div>
    </div>
  );
}

/** Stat value skeleton */
export function SkeletonStat({ className }: SkeletonProps) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      <Skeleton className="h-7 w-20 rounded" />
      <Skeleton className="h-2.5 w-14 rounded" />
    </div>
  );
}
