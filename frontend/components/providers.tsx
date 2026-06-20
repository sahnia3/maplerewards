"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/auth-context";
import { SessionProvider } from "@/contexts/session-context";
import { WalletProvider } from "@/contexts/wallet-context";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { TourProvider } from "@/contexts/tour-context";
import { TourOverlay } from "@/components/tour/tour-overlay";
import { TourInvite } from "@/components/tour/tour-invite";
import { pageview } from "@/lib/analytics";

/**
 * Fires an analytics pageview on every route change. No-op unless analytics is
 * configured and the user has consented (gating lives in lib/analytics). Pure
 * side-effect component — renders nothing.
 */
function AnalyticsPageviews() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) pageview(pathname);
  }, [pathname]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <AuthProvider>
        <SessionProvider>
          <WalletProvider>
            <SidebarProvider>
              <TourProvider>
                <AnalyticsPageviews />
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
