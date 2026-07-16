import { Pause, Play } from "lucide-react";

import { QuoteWindowGraphic } from "@/components/brand/txbet-brand";
import { MicroLabel, Reveal } from "@/components/landing/shared";

const rulerTicks = Array.from({ length: 13 }, (_, index) => index * 250);

const venues = [
  { id: "v01", label: "V01", snapMs: 620, outcome: "IN WINDOW", tone: "success", end: "right-[79.3333%]" },
  { id: "v02", label: "V02", snapMs: 940, outcome: "IN WINDOW", tone: "success", end: "right-[68.6667%]" },
  { id: "v03", label: "V03", snapMs: 1780, outcome: "LATE", tone: "warning", end: "right-[40.6667%]" },
  { id: "v04", label: "V04", snapMs: 2600, outcome: "LATE", tone: "warning", end: "right-[13.3333%]" },
] as const;

const chipClassName = "border border-border bg-background/80 px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em]";

export function TensionSection() {
  return (
    <section
      id="market-window"
      data-section-language="timing-corridor"
      className="scroll-mt-[4.5rem] overflow-hidden border-b border-border bg-card/20 lg:flex lg:min-h-[calc(100svh-4.5rem)] lg:items-center"
    >
      <div className="mx-auto w-full max-w-[1500px] px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-6">
        <Reveal className="mx-auto max-w-[1280px] text-center">
          <MicroLabel className="text-primary">01 / the market tension</MicroLabel>
          <h2 className="mt-5 font-serif text-[clamp(3.8rem,6.4vw,6.8rem)] font-normal leading-[0.86] tracking-[-0.045em]">
            One event. <span className="text-muted-foreground">Many clocks.</span> One payout.
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Sports truth updates once. Market prices update venue by venue. txBet is designed for the interval between those two moments.
          </p>
        </Reveal>

        <Reveal className="mt-10 min-w-0 lg:mt-5">
          <div data-gsap-loop="quote-window" className="relative">
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[22rem] -translate-x-1/2 bg-success/[0.025] blur-3xl" />
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-border py-3">
              <div className="flex shrink-0 items-center gap-2">
                <span className="size-2 bg-primary" />
                <MicroLabel className="text-foreground">Venue repricing window</MicroLabel>
              </div>
              <div className="flex w-full items-center gap-2 border-t border-border/60 pt-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground sm:w-auto sm:border-0 sm:pt-0">
                <button
                  type="button"
                  data-gsap-live-toggle
                  aria-label="Pause quote loop"
                  className="grid size-11 shrink-0 place-items-center rounded-sm border border-border/80 text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hidden sm:size-7"
                >
                  <Pause data-gsap-live-pause aria-hidden="true" className="size-4 sm:size-3" />
                  <Play data-gsap-live-play aria-hidden="true" className="hidden size-4 sm:size-3" />
                </button>
                <span data-gsap-live-dot aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
                <span data-gsap-live-status="true" className="whitespace-nowrap">loop ready</span>
                <span className="shrink-0 sm:hidden">/ sim</span>
                <span className="hidden shrink-0 sm:inline">/ synthetic</span>
              </div>
            </div>

            <div className="relative isolate border-b border-border">
              {/* One time field keeps the ruler, quotes, and venue clocks aligned. */}
              <div data-gsap-capture-band className="pointer-events-none absolute inset-y-0 left-[20%] z-20 w-[16.6667%] bg-foreground/[0.04]">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-[repeating-linear-gradient(to_bottom,currentColor_0_3px,transparent_3px_6px)] text-foreground/45" />
                <span aria-hidden="true" className="absolute inset-y-0 right-0 w-px bg-[repeating-linear-gradient(to_bottom,currentColor_0_3px,transparent_3px_6px)] text-foreground/45" />
                <span className={`${chipClassName} absolute left-1/2 top-1 z-30 -translate-x-1/2 whitespace-nowrap text-foreground`}>
                  CAPTURE / 800MS
                </span>
              </div>

              <div className="relative h-14 border-b border-border bg-background/35 font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
                {rulerTicks.map((tick) => (
                  <span
                    key={tick}
                    aria-hidden="true"
                    className={`absolute bottom-0 w-px bg-border ${tick === 3000 ? "right-0" : ""} ${tick % 1000 === 0 || tick === 1500 ? "h-4" : "h-2.5"}`}
                    style={tick === 3000 ? undefined : { left: `${(tick / 3000) * 100}%` }}
                  />
                ))}
                <span className={`${chipClassName} absolute bottom-4 left-0`}>0</span>
                <span className={`${chipClassName} absolute bottom-4 left-1/2 hidden -translate-x-1/2 sm:inline-block`}>1,500</span>
                <span className={`${chipClassName} absolute bottom-4 right-0`}>3,000MS</span>
              </div>

              <div className="relative h-36 border-b border-border bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground),transparent_96%)_1px,transparent_1px)] bg-[size:8.3333%_100%]">
                <QuoteWindowGraphic className="h-full" />
              </div>

              <div className="relative divide-y divide-border bg-background/25">
                {venues.map((venue) => (
                  <div
                    key={venue.id}
                    data-gsap-venue-row={venue.id}
                    data-venue-ms={venue.snapMs}
                    data-venue-outcome={venue.outcome}
                    className={`relative min-h-14 grid-cols-[4.7rem_minmax(1.5rem,1fr)_3.7rem_5.9rem] items-center gap-2 px-2 sm:min-h-16 sm:grid-cols-[8rem_minmax(4rem,1fr)_5rem_7rem] sm:gap-4 sm:px-4 ${venue.id === "v04" ? "hidden sm:grid" : "grid"}`}
                  >
                    <div data-gsap-venue-track className="absolute inset-x-0 top-1/2 z-10 h-1.5 -translate-y-1/2 bg-foreground/10">
                      <span
                        data-gsap-venue-fill
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 ${venue.end} origin-left bg-foreground`}
                      />
                    </div>

                    <div className={`${chipClassName} relative z-30 min-w-0 justify-self-start px-1.5 sm:px-2`}>
                      <span className="block text-foreground">{venue.label}</span>
                      <span className="block truncate text-[0.6875rem] tracking-[0.08em] text-muted-foreground">synthetic</span>
                    </div>

                    <span aria-hidden="true" />

                    <span data-gsap-venue-readout className="relative z-30 whitespace-nowrap bg-background/90 px-1 text-right font-mono text-[0.6875rem] tabular-nums text-foreground">
                      {venue.snapMs.toLocaleString("en-US")}ms
                    </span>

                    <span
                      data-gsap-venue-chip
                      className={`${chipClassName} relative z-30 justify-self-end whitespace-nowrap px-1.5 text-center sm:px-2 ${venue.tone === "success" ? "border-success/35 text-success" : "border-warning/35 text-warning"}`}
                    >
                      {venue.outcome}
                    </span>

                    <span
                      data-gsap-venue-flash
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 z-20 opacity-0 ${venue.tone === "success" ? "bg-success/[0.08]" : "bg-warning/[0.08]"}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 border-b border-border">
              <div data-gsap-live-metric="event" className="relative overflow-hidden border-r border-border py-4 pr-3 sm:py-5 sm:pr-5 lg:py-3">
                <span data-gsap-live-metric-flash aria-hidden="true" className="pointer-events-none absolute inset-0 bg-foreground/[0.08] opacity-0" />
                <div className="relative">
                  <MicroLabel>
                    <span className="sm:hidden">event</span>
                    <span className="hidden sm:inline">T+0 / event received</span>
                  </MicroLabel>
                  <div data-gsap-live-metric-value className="mt-2 whitespace-nowrap font-mono text-base font-semibold tabular-nums sm:text-3xl">0 ms</div>
                </div>
              </div>
              <div data-gsap-live-metric="capture" className="relative overflow-hidden border-r border-border px-3 py-4 text-center sm:px-5 sm:py-5 lg:py-3">
                <span data-gsap-live-metric-flash aria-hidden="true" className="pointer-events-none absolute inset-0 bg-success/[0.08] opacity-0" />
                <div className="relative">
                  <MicroLabel>
                    <span className="sm:hidden">capture</span>
                    <span className="hidden sm:inline">capture window</span>
                  </MicroLabel>
                  <div data-gsap-live-metric-value className="mt-2 whitespace-nowrap font-mono text-base font-semibold tabular-nums text-success sm:text-3xl">800 ms</div>
                </div>
              </div>
              <div data-gsap-live-metric="normalized" className="relative overflow-hidden py-4 pl-3 text-right sm:py-5 sm:pl-5 lg:py-3">
                <span data-gsap-live-metric-flash aria-hidden="true" className="pointer-events-none absolute inset-0 bg-warning/[0.08] opacity-0" />
                <div className="relative">
                  <MicroLabel>
                    <span className="sm:hidden">settled</span>
                    <span className="hidden sm:inline">pair normalized</span>
                  </MicroLabel>
                  <div data-gsap-live-metric-value className="mt-2 whitespace-nowrap font-mono text-base font-semibold tabular-nums text-warning sm:text-3xl">3,000 ms</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">
              <span>demonstration timing only</span>
              <span className="text-right"><span data-gsap-live-clock>synthetic</span> / not measured venue latency</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
