"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/auth-context";
import { SessionProvider } from "@/contexts/session-context";
import { WalletProvider } from "@/contexts/wallet-context";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { TourProvider } from "@/contexts/tour-context";
import { TourOverlay } from "@/components/tour/tour-overlay";
import { TourInvite } from "@/components/tour/tour-invite";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <AuthProvider>
        <SessionProvider>
          <WalletProvider>
            <SidebarProvider>
              <TourProvider>
                {children}
                <TourOverlay />
                <TourInvite />
              </TourProvider>
            </SidebarProvider>
          </WalletProvider>
        </SessionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
