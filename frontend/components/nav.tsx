"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 glass">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg maple-gradient flex items-center justify-center maple-glow-sm group-hover:maple-glow transition-all">
            <span className="text-white text-base">🍁</span>
          </div>
          <span className="font-semibold text-white text-lg tracking-tight">
            Maple<span className="text-[#C8102E]">Rewards</span>
          </span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1">
          <Link
            href="/"
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              pathname === "/"
                ? "bg-white/10 text-white"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            }`}
          >
            Optimizer
          </Link>
          <Link
            href="/wallet"
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              pathname === "/wallet"
                ? "bg-white/10 text-white"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            }`}
          >
            My Wallet
          </Link>
        </div>
      </div>
    </nav>
  );
}
