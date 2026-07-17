import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

import { TxBetPrivyProvider } from "@/components/auth/privy-auth";
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
    default: "txBet — Odds, dominance, and momentum trading agent",
    template: "%s · txBet",
  },
  description: "txBet's agent reads odds, dominance, and momentum — positioning before kickoff and trading every outcome live through the match.",
  applicationName: "txBet",
  keywords: ["TxLINE", "TxODDS", "prediction markets", "match dominance", "in-play trading", "sports data", "trading agent"],
  openGraph: {
    title: "txBet — It reads the match before the market does",
    description: "Odds, dominance, and momentum drive pre-match positions and rule-gated in-play trading across every outcome.",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "txBet odds, dominance, and momentum trading agent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "txBet — Position before kickoff. Trade every swing.",
    description: "Pre-match positions. In-play buying and selling. Every outcome stays rule-gated.",
    images: ["/opengraph-image"],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`dark ${displayFont.variable} ${bodyFont.variable} ${dataFont.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <TxBetPrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""}
          nonce={nonce}
        >
          {children}
        </TxBetPrivyProvider>
      </body>
    </html>
  );
}
