import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

import { resolveMetadataBase } from "@/lib/metadata-base";

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(process.env),
  title: {
    default: "txBet — Event-triggered prediction-market arbitrage",
    template: "%s · txBet",
  },
  description: "TxLINE match actions wake a cross-venue exact-complement arbitrage agent. No edge, no trade.",
  applicationName: "txBet",
  keywords: ["TxLINE", "TxODDS", "prediction markets", "arbitrage", "sports data", "trading agent"],
  openGraph: {
    title: "txBet — The match event wakes the agent",
    description: "Exact settlement matching, executable depth, fees, slippage, and explicit leg risk.",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "txBet event-triggered arbitrage console" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "txBet — Event-triggered arbitrage",
    description: "The match event wakes the agent. Settlement math decides.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
