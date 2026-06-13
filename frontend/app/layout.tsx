import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";
import { ChatFab } from "@/components/chat/chat-fab";
import { SWRegister } from "@/components/sw-register";
import { InstallPWAPrompt } from "@/components/install-pwa-prompt";
import { CookieConsent } from "@/components/cookie-consent";
import { ErrorReporterInit } from "@/components/error-reporter-init";

// Display / headings / italic lede — variable optical-size serif. The opsz
// axis lets one family serve 72px heroes AND the 17px lede legibly; the old
// single-weight Instrument Serif could do neither well over the page grain.
const fraunces = Fraunces({
  subsets: ["latin"],
  // Variable font: omit `weight` so the full wght axis loads alongside opsz
  // (next/font rejects `axes` when a static `weight` is pinned). CSS drives
  // the weights — 300–600 plus the 450 used in the dark-mode body.
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-display-src",
  display: "swap",
});

// Body + UI labels + numerics — variable. Tabular figures requested in .mono.
const inter = Inter({
  subsets: ["latin"],
  // Fully variable (no pinned weight) so arbitrary weights resolve exactly —
  // including the dark-mode body weight 450 and the 600/700 label weights.
  variable: "--font-sans-src",
  display: "swap",
});

// Scoped to code blocks only (.chat-message pre/code) — not used for labels.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-code-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MapleRewards — Maximize Your Points",
  description: "Canadian credit-card rewards optimizer. Live CPP, transfer-partner intelligence, award alerts.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MapleRewards",
  },
};

export const viewport: Viewport = {
  themeColor: "#A51F2D",  /* maple red */
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = [
    fraunces.variable,
    inter.variable,
    jetbrainsMono.variable,
  ].join(" ");

  return (
    <html lang="en" suppressHydrationWarning className={fontVars}>
      <body className="antialiased min-h-screen grain">
        {/* Reapply the persisted reduce-motion preference before first paint —
            same bootstrap pattern next-themes uses for data-theme. Settings
            only sets the attribute in its onChange handler, so without this
            the preference silently dies on every full page load. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("mr.motion.reduce")==="true"){document.documentElement.setAttribute("data-reduce-motion","true")}}catch(e){}',
          }}
        />
        <Providers>
          <ErrorReporterInit />
          <AppShell>{children}</AppShell>
          <ChatFab />
          <SWRegister />
          <InstallPWAPrompt />
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
