"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

/**
 * Floating "Ask Maple" button. Routes to the full /chat page (the Maple AI
 * editor) rather than a cramped in-page panel — one chat implementation,
 * always the complete experience. Hidden on /chat itself (you're already there).
 */
export function ChatFab() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <Link
      href="/chat"
      aria-label="Ask Maple — your rewards advisor"
      className="group fixed z-50 flex items-center gap-2 rounded-full maple-bg accent-glow transition-all duration-200 lg:bottom-6 lg:right-6"
      style={{
        bottom: 80,
        right: 20,
        height: 56,
        paddingLeft: 18,
        paddingRight: 20,
        color: "#fff",
      }}
    >
      <MessageCircle size={22} className="shrink-0 text-white" />
      <span
        className="mono"
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        Ask Maple
      </span>
    </Link>
  );
}
