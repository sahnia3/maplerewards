import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";
import { ChatFab } from "@/components/chat/chat-fab";

export const metadata: Metadata = {
  title: "MapleRewards — Maximize Your Points",
  description: "AI-powered credit card point optimizer for Canada. Find the best card for every purchase.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MapleRewards",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D9488",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased min-h-screen`}>
        <div className="gradient-mesh" />
        <Providers>
          <AppShell>{children}</AppShell>
          <ChatFab />
        </Providers>
      </body>
    </html>
  );
}
