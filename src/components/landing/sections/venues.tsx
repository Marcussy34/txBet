import Image from "next/image";

import { MicroLabel, Reveal } from "@/components/landing/shared";
import { cn } from "@/lib/utils";

/* VENUE COVERAGE
 * The txBet target roster is shown whether or not an adapter exists yet. Fee
 * figures are published venue schedules, not measurements; the replay's books
 * stay synthetic regardless of venue.
 */

type VenueStatus = "adapter" | "roadmap";

type Venue = {
  id: string;
  name: string;
  /** Wordmark under /public/venues; venues without a clean mark render as mono text. */
  icon?: string;
  /** Flatten to white only when the official mark is too dark for the carbon field. */
  flatten?: boolean;
  kind: string;
  rail: string;
  taker: string;
  status: VenueStatus;
};

// Taker figures are published venue schedules (Jul 2026), peak-of-curve where fees
// follow the symmetric p(1−p) shape: cost is highest at $0.50 and falls toward 0/1.
const venues: readonly Venue[] = [
  { id: "polymarket", name: "Polymarket", icon: "/venues/polymarket-blue.svg", kind: "CLOB", rail: "Polygon", taker: "0.04–0.07×p(1−p)", status: "adapter" },
  { id: "kalshi", name: "Kalshi", icon: "/venues/kalshi.svg", kind: "CFTC DCM", rail: "US regulated / DFlow", taker: "0.07×p(1−p)", status: "adapter" },
  { id: "opinion", name: "Opinion", icon: "/venues/opinion.webp", kind: "CLOB", rail: "BNB Chain", taker: "≤1% curve", status: "roadmap" },
  { id: "predictfun", name: "Predict.fun", icon: "/venues/predictfun.svg", kind: "CLOB", rail: "BNB Chain", taker: "≤2% curve", status: "roadmap" },
  { id: "probable", name: "Probable", kind: "CLOB", rail: "BNB Chain", taker: "0% (launch)", status: "roadmap" },
  { id: "limitless", name: "Limitless", icon: "/venues/limitless.svg", kind: "CLOB + AMM", rail: "Base", taker: "0.4% amm / ≤3% clob", status: "roadmap" },
  { id: "sxbet", name: "SX Bet", icon: "/venues/sxbet.png", flatten: true, kind: "Sports exchange", rail: "SX Network", taker: "0% singles", status: "roadmap" },
  { id: "gemini", name: "Gemini", kind: "Event contracts", rail: "US regulated", taker: "0.07×p(1−p)", status: "roadmap" },
  { id: "alphaarcade", name: "Alpha Arcade", kind: "CLOB", rail: "Algorand", taker: "0.07×p(1−p)", status: "roadmap" },
  { id: "myriad", name: "Myriad", icon: "/venues/myriad.svg", kind: "AMM", rail: "BNB Chain / USD1", taker: "0–2% buy", status: "roadmap" },
  // Hydromancer is the internal adapter ID; the product-facing venue name is Hyperliquid.
  { id: "hydromancer", name: "Hyperliquid", icon: "/venues/hyperliquid.svg", kind: "CLOB", rail: "Hyperliquid", taker: "0% open / 7bp close", status: "roadmap" },
] as const;

const captureModes = [
  ["paired", "two legs / bundle below payout"],
  ["directional", "one leg / quote vs event-adjusted fair"],
] as const;

function VenueWordmark({ venue, size }: { venue: Venue; size: "row" | "tile" }) {
  if (!venue.icon) {
    return (
      <span className={cn("truncate font-mono uppercase tracking-[0.14em] text-foreground", size === "row" ? "text-xs" : "text-[0.6875rem]")}>
        {venue.name}
      </span>
    );
  }

  return (
    /* The roster is the one surface where third-party marks keep their own brand colors. */
    <Image
      src={venue.icon}
      alt={venue.name}
      width={140}
      height={24}
      className={cn("w-auto max-w-full object-contain object-left", size === "row" ? "h-5" : "h-4", venue.flatten && "brightness-0 invert")}
    />
  );
}

function StatusChip({ status }: { status: VenueStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em]",
        status === "adapter" ? "border-success/35 bg-success/[0.045] text-success" : "border-border bg-background/80 text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

export function VenueSection() {
  return (
    <section
      id="venues"
      data-section-language="venue-coverage"
      className="border-b border-border py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <MicroLabel className="text-primary">02 / venue coverage</MicroLabel>
          <h2 className="mt-5 font-serif text-[clamp(3.8rem,6.8vw,7rem)] font-normal leading-[0.86] tracking-[-0.045em]">
            Every venue.
            <span className="text-muted-foreground"> Every mispricing.</span>
          </h2>
          <p className="mt-6 max-w-lg text-sm leading-7 text-muted-foreground">
            Live mispricing capture across every prediction market — arbitrage included, never required.
          </p>
        </Reveal>

        {/* Two capture modes: the gate is shared, arbitrage is only one of them. */}
        <Reveal className="mt-8 flex flex-wrap items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.11em] sm:text-[0.6875rem]">
          {captureModes.map(([mode, rule]) => (
            <span key={mode} className="flex items-center gap-2 border border-border bg-card/60 px-3 py-2">
              <span className="text-foreground">{mode}</span>
              <span aria-hidden="true" className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{rule}</span>
            </span>
          ))}
          <span className="border border-border bg-background/80 px-3 py-2 text-muted-foreground">one shared cost gate</span>
        </Reveal>

        <Reveal className="mt-10">
          {/* Desktop: one terminal table. */}
          <div className="hidden border border-border bg-card/30 md:block">
            <div className="grid grid-cols-[minmax(9rem,12rem)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(10rem,1fr)_5.5rem] items-center gap-4 border-b border-border px-4 py-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
              <span>venue</span>
              <span>type</span>
              <span>rail</span>
              <span className="text-right">taker fee</span>
              <span className="text-right">status</span>
            </div>
            {venues.map((venue) => (
              <div
                key={venue.id}
                className="grid min-h-14 grid-cols-[minmax(9rem,12rem)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(10rem,1fr)_5.5rem] items-center gap-4 border-b border-border/70 px-4 py-2.5 last:border-0"
              >
                <VenueWordmark venue={venue} size="row" />
                <span className="truncate font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted-foreground">{venue.kind}</span>
                <span className="truncate font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted-foreground">{venue.rail}</span>
                <span className="text-right font-mono text-[0.6875rem] tabular-nums text-foreground">{venue.taker}</span>
                <span className="justify-self-end"><StatusChip status={venue.status} /></span>
              </div>
            ))}
          </div>

          {/* Mobile: compact tiles, same data. */}
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:hidden">
            {venues.map((venue) => (
              <div key={venue.id} className="flex min-w-0 flex-col gap-2.5 border border-border bg-card/30 p-3">
                <VenueWordmark venue={venue} size="tile" />
                <div className="truncate font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">
                  {venue.kind} / {venue.rail}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-[0.625rem] tabular-nums text-foreground">{venue.taker}</span>
                  <StatusChip status={venue.status} />
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground sm:text-[0.6875rem]">
          <span>published venue fee schedules / jul 2026</span>
          <span>taker peaks at mid-price on p(1−p) venues / makers free on most books</span>
          <span>replay books stay synthetic</span>
        </div>
      </div>
    </section>
  );
}
