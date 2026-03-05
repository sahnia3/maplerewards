"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Blurred backdrop strip */}
      <div className="absolute inset-0 border-b border-white/[0.05]"
        style={{ background: "rgba(8,9,14,0.75)", backdropFilter: "blur(20px) saturate(1.5)", WebkitBackdropFilter: "blur(20px) saturate(1.5)" }}
      />

      <div className="relative max-w-5xl mx-auto px-6 h-[60px] flex items-center justify-between">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-3 group select-none">
          <div className="relative w-7 h-7 flex items-center justify-center">
            <div className="absolute inset-0 rounded-lg maple-bg opacity-90 group-hover:opacity-100 transition-opacity" style={{ boxShadow: "0 2px 12px rgba(200,16,46,0.4)" }} />
            <span className="relative text-white text-[13px] leading-none">🍁</span>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white/90 group-hover:text-white transition-colors">
            maple<span className="text-[#C8102E]">rewards</span>
          </span>
        </Link>

        {/* Nav pills */}
        <nav className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            { href: "/",       label: "Optimizer" },
            { href: "/wallet", label: "Wallet"    },
          ].map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? "text-white"
                    : "text-white/40 hover:text-white/75"
                }`}
              >
                {active && (
                  <span className="absolute inset-0 rounded-lg" style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.10)" }} />
                )}
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
