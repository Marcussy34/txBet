import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { resolveMetadataBase } from "@/lib/metadata-base";

const displayFont = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const dataFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-data",
});

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(process.env),
  title: {
    default: "txBet — Event-triggered arbitrage strategy prototype",
    template: "%s · txBet",
  },
  description: "World Cup hackathon prototype: TxLINE-format match events trigger exact-complement scans over synthetic venue books. Current fills and P&L are simulated.",
  applicationName: "txBet",
  keywords: ["TxLINE", "TxODDS", "prediction markets", "arbitrage", "sports data", "trading agent"],
  openGraph: {
    title: "txBet — See the gap before the market catches up",
    description: "Exact-complement strategy demo with a TxLINE smoke boundary, synthetic venue books, and simulated fills.",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "txBet hackathon prototype and synthetic replay" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "txBet — Event-triggered strategy prototype",
    description: "TxLINE smoke boundary. Synthetic venue books. Simulated fills. No edge. No trade.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${displayFont.variable} ${bodyFont.variable} ${dataFont.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>{children}</body>
    </html>
  );
}
