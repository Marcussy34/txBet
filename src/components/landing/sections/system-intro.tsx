import { Pause, Play } from "lucide-react";

import {
  EventEdgeRoute,
  StatusGlyph,
} from "@/components/brand/txbet-brand";
import { MicroLabel, Reveal } from "@/components/landing/shared";
import { cn } from "@/lib/utils";

const eventRows = [
  ["49:20", "throw-in", "next"],
  ["52:47", "yellow", "cards"],
  ["55:03", "goal check", "totals"],
  ["58:40", "sub", "H2"],
  ["61:12", "corner", "next"],
  ["63:00", "red card", "H2"],
] as const;

function EventLedgerRow({
  row,
  qualifying = false,
}: {
  row: (typeof eventRows)[number];
  qualifying?: boolean;
}) {
  return (
    <div
      data-gsap-ledger-row={qualifying ? "qualifying" : "true"}
      className={cn(
        "grid min-w-0 grid-cols-[3rem_auto_minmax(0,1fr)_auto_auto] items-center gap-1 border border-border bg-background/80 px-2 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em]",
        qualifying
          ? "border-success/40 bg-success/[0.045] text-foreground"
          : "opacity-40",
      )}
    >
      <span className="tabular-nums">{row[0]}</span>
      <span aria-hidden="true" className="text-muted-foreground">/</span>
      <span className="truncate">{row[1]}</span>
      <span aria-hidden="true" className="text-muted-foreground">/</span>
      <span className="text-right text-muted-foreground">{row[2]}</span>
    </div>
  );
}

const metrics = [
  { label: "trigger", value: "63:00", key: "trigger", target: "63" },
  { label: "paired cost", value: "$0.940", key: "pair", target: "0.94" },
  { label: "after costs", value: "+$0.048", key: "edge", target: "0.048" },
] as const;

export function MarketSignalPreview() {
  return (
    <div data-gsap-loop="event-edge" className="relative w-full">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-border py-3">
        <div className="flex shrink-0 items-center gap-3">
          <span className="size-2 bg-primary" />
          <MicroLabel className="text-foreground">Live reaction tape</MicroLabel>
          <span className="hidden h-px w-10 bg-border sm:block" />
          <MicroLabel className="hidden sm:block">Event → edge</MicroLabel>
        </div>
        <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground sm:text-[0.6875rem]">
          <button
            type="button"
            data-gsap-live-toggle
            aria-label="Pause event loop"
            className="grid size-11 shrink-0 place-items-center rounded-sm border border-border/80 text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hidden sm:size-7"
          >
            <Pause data-gsap-live-pause aria-hidden="true" className="size-4 sm:size-3" />
            <Play data-gsap-live-play aria-hidden="true" className="hidden size-4 sm:size-3" />
          </button>
          <span data-gsap-live-dot aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
          <span data-gsap-live-status="true" className="whitespace-nowrap">loop ready</span>
          <span>/ synthetic</span>
        </div>
      </div>

      <div className="border-b border-border">
        <div data-gsap-ledger="mobile" className="border-b border-border p-2 lg:hidden">
          <EventLedgerRow row={eventRows[5]} qualifying />
        </div>

        <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)_17rem]">
          <div data-gsap-ledger="desktop" className="hidden border-r border-border bg-card/20 p-3 lg:block">
            <div className="mb-3 flex items-center justify-between gap-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
              <span>TxLINE ledger</span>
              <span className="tabular-nums">06 events</span>
            </div>
            <div className="space-y-2">
              {eventRows.map((row) => (
                <EventLedgerRow key={row[0]} row={row} qualifying={row[1] === "red card"} />
              ))}
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground),transparent_97%)_1px,transparent_1px)] bg-[size:64px_100%] px-2 py-5 sm:px-5 sm:py-7 lg:border-r lg:border-border lg:px-6">
            <div aria-hidden="true" className="absolute inset-y-0 left-[22%] w-px bg-border/70" />
            <EventEdgeRoute className="relative h-auto max-h-[18rem]" />
          </div>

          <div className="grid grid-cols-3 divide-x divide-border bg-card/30 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                data-gsap-live-metric={metric.key}
                className="flex min-h-24 flex-col justify-between px-3 py-4 sm:px-5 lg:min-h-0 lg:flex-row lg:items-end lg:gap-4"
              >
                <div className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground sm:text-[0.6875rem]">
                  {metric.label}
                </div>
                <div className="mt-2 flex flex-col items-start lg:mt-0 lg:items-end">
                  <div
                    data-gsap-metric-value={metric.key}
                    data-gsap-metric-target={metric.target}
                    className="font-mono text-sm font-semibold uppercase tabular-nums text-foreground sm:text-lg"
                  >
                    {metric.value}
                  </div>
                  {metric.key === "edge" && (
                    <svg
                      viewBox="0 0 60 16"
                      aria-label="After-cost edge trend"
                      className="mt-1 h-4 w-[3.75rem] text-success"
                      fill="none"
                    >
                      <polyline
                        data-gsap-edge-sparkline
                        points="1,14 10,12 18,13 27,8 36,10 45,4 59,2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                      />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-success/30 bg-success/[0.045] py-3 text-success">
        <div className="flex items-center gap-2">
          <span data-gsap-status-glyph className="inline-flex">
            <StatusGlyph state="locked" />
          </span>
          <span className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.13em] sm:text-[0.6875rem]">exact pair matched</span>
        </div>
        <span className="text-right font-mono text-[0.625rem] uppercase tracking-wider sm:text-[0.6875rem]">
          <span data-gsap-live-clock>synthetic</span>
          <span className="hidden sm:inline"> / simulated fills</span>
        </span>
      </div>
    </div>
  );
}

export function SystemIntro() {
  return (
    <section
      id="system"
      data-section-language="reaction-tape"
      className="relative isolate overflow-hidden border-b border-border"
    >
      <div className="mx-auto max-w-[1500px] px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-12">
        <Reveal className="relative z-10">
          <MicroLabel className="text-primary">How txBet reacts</MicroLabel>
          <h2 className="mt-5 font-serif text-[clamp(4rem,7.5vw,7.5rem)] font-normal leading-[0.84] tracking-[-0.05em]">
            Event in.
            <span className="text-muted-foreground"> Edge checked.</span>
          </h2>
        </Reveal>

        <Reveal className="relative z-10 mt-12 sm:mt-14 lg:mt-8">
          <MarketSignalPreview />
        </Reveal>
      </div>
    </section>
  );
}
