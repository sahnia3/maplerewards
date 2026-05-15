import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";
import { ChatFab } from "@/components/chat/chat-fab";
import { SWRegister } from "@/components/sw-register";
import { InstallPWAPrompt } from "@/components/install-pwa-prompt";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter-tight",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
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
    instrumentSerif.variable,
    interTight.variable,
    jetbrainsMono.variable,
    GeistSans.variable,
    GeistMono.variable,
  ].join(" ");

  return (
    <html lang="en" suppressHydrationWarning className={fontVars}>
      <body className="antialiased min-h-screen grain">
        <Providers>
          <AppShell>{children}</AppShell>
          <ChatFab />
          <SWRegister />
          <InstallPWAPrompt />
        </Providers>
      </body>
    </html>
  );
}
