"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/auth-context";
import { SessionProvider } from "@/contexts/session-context";
import { WalletProvider } from "@/contexts/wallet-context";
import { SidebarProvider } from "@/contexts/sidebar-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <AuthProvider>
        <SessionProvider>
          <WalletProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </WalletProvider>
        </SessionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
