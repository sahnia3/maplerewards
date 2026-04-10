"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { useSidebar } from "@/contexts/sidebar-context";

const pageVariants = {
  initial: {
    opacity: 0,
    y: 6,
  },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.15,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    y: -3,
    transition: {
      duration: 0.1,
      ease: [0.4, 0, 1, 1] as [number, number, number, number],
    },
  },
};

// Auth pages render without sidebar/nav
const AUTH_PATHS = ["/login", "/signup"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();

  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isAuthPage) {
    return (
      <main className="min-h-screen relative z-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    );
  }

  return (
    <>
      <Sidebar />

      <main
        className="min-h-screen relative z-10"
        style={{
          marginLeft: `var(--sidebar-width, 0px)`,
          paddingBottom: "var(--bottom-nav-height, 0px)",
          transition: "margin-left 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* CSS variables for responsive layout */}
        <style>{`
          @media (min-width: 1024px) {
            :root {
              --sidebar-width: ${isCollapsed ? 56 : 240}px;
              --bottom-nav-height: 0px;
            }
          }
          @media (max-width: 1023px) {
            :root {
              --sidebar-width: 0px;
              --bottom-nav-height: 64px;
            }
          }
        `}</style>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom tab bar */}
      <BottomNav />
    </>
  );
}
