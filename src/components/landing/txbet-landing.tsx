"use client";

import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";

import { AGENTS } from "@/agents/definitions";
import {
  AgentTelemetry,
  EventEdgeRoute,
  ExecutionProtocolGraphic,
  ExecutionProtocolMobileGraphic,
  QuoteWindowGraphic,
  StatusGlyph,
  TxBetLockup,
  TxBetMark,
} from "@/components/brand/txbet-brand";
import { buttonVariants } from "@/components/ui/button";
import { useLandingMotion } from "@/components/landing/use-landing-motion";
import { cn } from "@/lib/utils";

/* BRAND SPLASH STORYBOARD
 *    0ms shell, identity, and actions are visible in server HTML
 *  120ms the silver beam resolves to its full height
 *  260ms the split-gate mark settles against the center rail
 *  440ms the promise and actions settle into place
 */
const BRAND_SPLASH_TIMING = {
  beam: 120,
  identity: 260,
  details: 440,
} as const;

const BRAND_SPLASH_SPRING = {
  type: "spring" as const,
  stiffness: 280,
  damping: 28,
  mass: 0.8,
};

const protocol = [
  {
    index: "01",
    title: "Wake",
    signal: "TxLINE event",
    tone: "text-primary",
  },
  {
    index: "02",
    title: "Verify",
    signal: "exact terms",
    tone: "text-signal",
  },
  {
    index: "03",
    title: "Pair",
    signal: "equal depth",
    tone: "text-success",
  },
  {
    index: "04",
    title: "Guard",
    signal: "net edge",
    tone: "text-foreground",
  },
] as const;

const decisionGates = [
  "Qualifying match action",
  "Same fixture and market family",
  "Exact settlement fingerprint",
  "Equal executable depth",
  "After-cost bundle below payout",
  "Minimum modeled return cleared",
] as const;

const deliveryStatus = [
  ["Strategy core", "implemented", "good"],
  ["Browser + terminal replay", "implemented", "good"],
  ["TxLINE auth / snapshot / SSE", "smoke boundary", "feed"],
  ["Live stream → strategy loop", "not wired", "open"],
  ["Venue books + fills", "synthetic", "open"],
  ["Live-money execution", "not included", "open"],
] as const;

function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  // Core content stays visible in server HTML; motion is progressive enhancement only.
  return <div data-gsap-reveal="true" className={className}>{children}</div>;
}

function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function BrandSplash() {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      // Settle after hydration so the first client render still matches the server.
      const timer = window.setTimeout(() => setStage(3), 0);
      return () => window.clearTimeout(timer);
    }

    const timers = [
      window.setTimeout(() => setStage(1), BRAND_SPLASH_TIMING.beam),
      window.setTimeout(() => setStage(2), BRAND_SPLASH_TIMING.identity),
      window.setTimeout(() => setStage(3), BRAND_SPLASH_TIMING.details),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduceMotion]);

  const beamReady = stage >= 1;
  const identityReady = stage >= 2;
  const detailsReady = stage >= 3;
  const splashTransition = reduceMotion ? { duration: 0 } : BRAND_SPLASH_SPRING;

  return (
    <section data-brand-splash="true" aria-labelledby="brand-splash-title" className="relative isolate overflow-hidden border-b border-border">
      <div
        data-gsap-beam="true"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_0%,#000_8%,transparent_20%,transparent_80%,#000_94%,#000_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_8%,transparent_20%,transparent_80%,#000_94%,#000_100%)]"
      >
        <motion.div
          initial={false}
          animate={{ scaleY: beamReady ? 1 : 0.58, scaleX: beamReady ? 1 : 0.72 }}
          transition={splashTransition}
          className="absolute inset-y-0 left-1/2 w-[clamp(6rem,10vw,10rem)] -translate-x-1/2 bg-foreground/[0.035] shadow-[0_0_80px_32px_color-mix(in_oklch,var(--foreground),transparent_94%)]"
        />
        <motion.div
          initial={false}
          animate={{ scaleY: beamReady ? 1 : 0.3 }}
          transition={splashTransition}
          className="absolute inset-y-0 left-1/2 w-[clamp(1rem,2vw,2rem)] -translate-x-1/2 bg-foreground/[0.16] shadow-[0_0_32px_10px_color-mix(in_oklch,var(--foreground),transparent_82%)]"
        />
        <motion.div
          initial={false}
          animate={{ scaleY: beamReady ? 1 : 0.12 }}
          transition={splashTransition}
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/75 shadow-[0_0_18px_4px_color-mix(in_oklch,var(--foreground),transparent_55%)]"
        />
      </div>

      <div className="mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-[1500px] flex-col px-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-20">
          <div className="relative z-0 flex w-full max-w-5xl flex-col items-center">
            <div data-gsap-lockup="true" className="inline-flex items-center justify-center gap-[clamp(0.85rem,2vw,1.4rem)]">
              <motion.div
                initial={false}
                animate={{ x: identityReady ? 0 : 14 }}
                transition={splashTransition}
                className="flex shrink-0 items-center justify-center"
              >
                <TxBetMark className="size-[clamp(4.75rem,7.6vw,7.25rem)]" />
              </motion.div>
              <motion.div
                initial={false}
                animate={{ x: identityReady ? 0 : -14 }}
                transition={splashTransition}
                className="flex items-center justify-center"
              >
                <span className="font-sans text-[clamp(3.7rem,7.2vw,7rem)] font-semibold leading-none tracking-[-0.065em]">txBet</span>
              </motion.div>
            </div>

            <motion.div
              initial={false}
              animate={{ y: detailsReady ? 0 : 10 }}
              transition={splashTransition}
              className="mt-10 flex max-w-4xl flex-col items-center sm:mt-12"
            >
              <h1 id="brand-splash-title" className="font-serif text-[clamp(3rem,5vw,5.2rem)] font-normal leading-[0.92] tracking-[-0.04em]">
                The match moves.
                <span className="block text-muted-foreground">Markets follow.</span>
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                txBet models the brief gap between a TxLINE-format match event and venue repricing.
              </p>
              <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
                <Link
                  href="/console"
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "h-12 rounded-md px-6 font-mono text-xs font-semibold uppercase tracking-[0.14em]",
                  )}
                >
                  Launch replay <span aria-hidden="true">↗</span>
                </Link>
                <a
                  href="#system"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-12 rounded-md px-6 font-mono text-xs uppercase tracking-[0.14em]",
                  )}
                >
                  Explore the system <span aria-hidden="true">↓</span>
                </a>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-border/70 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground sm:grid-cols-4 sm:text-[0.6875rem]">
          {["TxLINE-format replay", "Synthetic venue books", "Simulated fills", "No live money"].map((item) => (
            <div key={item} className="border-border/70 px-2 py-3 text-center odd:border-r sm:border-r sm:last:border-r-0">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/82 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="txBet home" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <TxBetLockup compact />
        </Link>
        <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-5">
          <a href="#protocol" className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground md:block">
            Protocol
          </a>
          <a href="#agents" className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground md:block">
            Agents
          </a>
          <a href="#proof" className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground md:block">
            Proof
          </a>
          <Link
            href="/console"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-9 rounded-md px-4 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em]",
            )}
          >
            Launch console
            <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function MarketSignalPreview() {
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

      <div className="grid border-b border-border lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="relative min-w-0 overflow-hidden bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground),transparent_97%)_1px,transparent_1px)] bg-[size:64px_100%] px-2 py-5 sm:px-5 sm:py-7 lg:border-r lg:border-border lg:px-8">
          <div aria-hidden="true" className="absolute inset-y-0 left-[22%] w-px bg-border/70" />
          <EventEdgeRoute className="relative h-auto max-h-[18rem]" />
        </div>

        <div className="grid grid-cols-3 divide-x divide-border bg-card/30 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
          {[
            ["trigger", "red card", "text-foreground"],
            ["paired cost", "$0.940", "text-foreground"],
            ["after costs", "+$0.048", "text-success"],
          ].map(([label, value, tone], index) => (
            <div
              key={label}
              data-gsap-live-metric={index === 0 ? "trigger" : index === 1 ? "pair" : "edge"}
              className="flex min-h-24 flex-col justify-between px-3 py-4 sm:px-5 lg:min-h-0 lg:flex-row lg:items-end lg:gap-4"
            >
              <div className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground sm:text-[0.6875rem]">{label}</div>
              <div className={cn("mt-2 font-mono text-sm font-semibold uppercase tabular-nums sm:text-lg lg:mt-0", tone)}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-success/30 bg-success/[0.045] py-3 text-success">
        <div className="flex items-center gap-2">
          <StatusGlyph state="locked" />
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

function SystemIntro() {
  return (
    <section
      id="system"
      data-section-language="reaction-tape"
      className="relative isolate overflow-hidden border-b border-border"
    >
      <div className="mx-auto max-w-[1500px] px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-12">
        <Reveal className="relative z-10 grid items-end gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.58fr)] lg:gap-16">
          <div>
            <MicroLabel className="text-primary">How txBet reacts</MicroLabel>
            <h2 className="mt-5 font-serif text-[clamp(4rem,7.5vw,7.5rem)] font-normal leading-[0.84] tracking-[-0.05em]">
              Event in.
              <span className="text-muted-foreground"> Edge checked.</span>
            </h2>
          </div>
          <div className="border-l border-border pl-5 sm:pl-7">
            <p className="max-w-lg text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
              A TxLINE-format action starts the scan. txBet pairs exact opposites and proceeds only when the modeled edge survives costs.
            </p>
            <Link
              href="/console"
              className={cn(
                buttonVariants({ variant: "default" }),
                "mt-6 h-12 rounded-md px-6 font-mono text-xs font-semibold uppercase tracking-[0.14em]",
              )}
            >
              Run the replay <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </Reveal>

        <Reveal className="relative z-10 mt-12 sm:mt-14 lg:mt-8">
          <MarketSignalPreview />
        </Reveal>
      </div>
    </section>
  );
}

function TensionSection() {
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
              <div className="flex w-full items-center gap-2 border-t border-border/60 pt-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground sm:w-auto sm:border-0 sm:pt-0 sm:text-[0.6875rem]">
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

            <div className="relative border-b border-border px-1 py-4 sm:px-5 sm:py-5 lg:py-3">
              <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground),transparent_96%)_1px,transparent_1px)] bg-[size:12.5%_100%]" />
              <QuoteWindowGraphic className="relative h-auto max-h-[13rem] lg:max-h-[11rem]" />
            </div>

            <div className="grid grid-cols-3 border-b border-border">
              <div data-gsap-live-metric="event" className="border-r border-border py-4 pr-3 sm:py-5 sm:pr-5 lg:py-3">
                <MicroLabel>
                  <span className="sm:hidden">event</span>
                  <span className="hidden sm:inline">T+0 / event received</span>
                </MicroLabel>
                <div className="mt-2 whitespace-nowrap font-mono text-base font-semibold tabular-nums sm:text-3xl">0 ms</div>
              </div>
              <div data-gsap-live-metric="capture" className="border-r border-border px-3 py-4 text-center sm:px-5 sm:py-5 lg:py-3">
                <MicroLabel>
                  <span className="sm:hidden">capture</span>
                  <span className="hidden sm:inline">capture window</span>
                </MicroLabel>
                <div className="mt-2 whitespace-nowrap font-mono text-base font-semibold tabular-nums text-success sm:text-3xl">800 ms</div>
              </div>
              <div data-gsap-live-metric="normalized" className="py-4 pl-3 text-right sm:py-5 sm:pl-5 lg:py-3">
                <MicroLabel>
                  <span className="sm:hidden">settled</span>
                  <span className="hidden sm:inline">pair normalized</span>
                </MicroLabel>
                <div className="mt-2 whitespace-nowrap font-mono text-base font-semibold tabular-nums text-warning sm:text-3xl">3,000 ms</div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-3 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground sm:text-[0.6875rem]">
              <span>demonstration timing only</span>
              <span className="text-right"><span data-gsap-live-clock>synthetic</span> / not measured venue latency</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ProtocolSection() {
  return (
    <section
      id="protocol"
      data-section-language="execution-interlock"
      className="scroll-mt-[4.5rem] border-b border-border bg-card/25 lg:flex lg:min-h-[calc(100svh-4.5rem)] lg:items-center"
    >
      <div className="mx-auto grid w-full max-w-[1500px] items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,0.72fr)_minmax(580px,1.28fr)] lg:gap-16 lg:px-8 lg:py-12 xl:gap-20">
        <Reveal className="max-w-[600px]">
          <MicroLabel className="text-signal">02 / execution protocol</MicroLabel>
          <h2 className="mt-6 font-serif text-[clamp(4.2rem,6.5vw,7rem)] font-normal leading-[0.84] tracking-[-0.045em]">
            Speed finds it.
            <span className="block text-muted-foreground">Rules decide it.</span>
          </h2>
          <p className="mt-7 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
            Equivalent pairs pass only after cost and risk checks.
          </p>
        </Reveal>

        <Reveal className="min-w-0">
          <div
            data-gsap-loop="execution-protocol"
            className="overflow-hidden rounded-xl border border-border bg-background/82"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
              <div className="flex shrink-0 items-center gap-2">
                <span className="size-2 bg-primary" />
                <MicroLabel className="text-foreground">Execution interlock</MicroLabel>
              </div>
              <div className="flex w-full items-center gap-2 border-t border-border/60 pt-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground sm:w-auto sm:border-0 sm:pt-0 sm:text-[0.6875rem]">
                <button
                  type="button"
                  data-gsap-live-toggle
                  aria-label="Pause protocol loop"
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

            <div className="border-b border-border bg-card/45 px-3 py-5 sm:px-5 sm:py-6">
              <ExecutionProtocolGraphic className="hidden h-auto max-h-60 sm:block" />
              <ExecutionProtocolMobileGraphic className="mx-auto h-auto max-h-[25rem] sm:hidden" />
            </div>

            <ol className="hidden grid-cols-4 gap-px bg-border sm:grid">
              {protocol.map((step) => (
                <li
                  key={step.index}
                  data-gsap-live-metric={step.title.toLowerCase()}
                  className="bg-background px-3 py-4 sm:px-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("font-mono text-[0.6875rem]", step.tone)}>{step.index}</span>
                    <span className="h-px w-8 bg-border" />
                  </div>
                  <div className="mt-3 font-serif text-2xl leading-none sm:text-3xl">{step.title}</div>
                  <MicroLabel className="mt-2 text-[0.625rem] tracking-[0.12em]">{step.signal}</MicroLabel>
                </li>
              ))}
            </ol>

            <div className="flex items-center justify-between gap-4 border-t border-border bg-background/80 px-4 py-3 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground sm:text-[0.6875rem]">
              <span>synthetic sequence</span>
              <span className="text-right"><span data-gsap-live-clock>sequence idle</span> / simulated</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AgentSection() {
  return (
    <section id="agents" className="border-b border-border py-24 sm:py-32">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <Reveal className="grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <MicroLabel className="text-primary">03 / selectable operators</MicroLabel>
            <h2 className="mt-5 font-serif text-[clamp(4rem,7.5vw,7.6rem)] font-normal leading-[0.84] tracking-[-0.045em]">
              Pick the match
              <span className="block text-muted-foreground">signal.</span>
            </h2>
          </div>
          <p className="max-w-lg text-sm leading-7 text-muted-foreground lg:justify-self-end">
            Six trigger configurations. One shared settlement matcher, optimizer, and execution-state engine. No agent bypasses the same risk gate.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {AGENTS.map((agent, index) => (
            <div key={agent.id}>
              <article className="group overflow-hidden rounded-lg border border-border bg-card/65 transition-colors duration-300 hover:border-foreground/35">
                <AgentTelemetry agent={agent.id} className="aspect-[4/5] border-0 border-b border-border" />
                <div className="min-h-36 p-3">
                  <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">Agent 0{index + 1}</div>
                  <h3 className="mt-2 text-xs font-semibold leading-4 text-foreground">{agent.shortName}</h3>
                  <p className="mt-2 line-clamp-3 text-[0.7rem] leading-5 text-muted-foreground">{agent.description}</p>
                </div>
              </article>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-3xl font-mono text-[0.6875rem] uppercase leading-5 tracking-[0.1em] text-muted-foreground">
          Live player-importance and pressure-window enrichment is not yet wired; those inputs are deterministic in the current replay.
        </p>
      </div>
    </section>
  );
}

function ProofSection() {
  return (
    <section id="proof" className="border-b border-border bg-card/25 py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1500px] gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <Reveal>
          <MicroLabel className="text-success">04 / decision evidence</MicroLabel>
          <h2 className="mt-5 font-serif text-[clamp(4.5rem,8.5vw,8.7rem)] font-normal leading-[0.82] tracking-[-0.05em]">
            No edge.
            <span className="block text-muted-foreground">No trade.</span>
          </h2>
          <p className="mt-8 max-w-lg text-sm leading-7 text-muted-foreground">
            txBet is valuable when it refuses. Every blocked state is visible, attributable, and replayable.
          </p>
          <div className="mt-10 border border-border bg-background/80">
            {decisionGates.map((gate, index) => (
              <div key={gate} className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[0.6875rem] text-muted-foreground">0{index + 1}</span>
                  <span className="text-xs text-muted-foreground">{gate}</span>
                </div>
                <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-success">pass</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="lg:pt-12">
          <div className="border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <MicroLabel>Synthetic replay report</MicroLabel>
                <div className="mt-2 text-sm font-semibold">Four deterministic windows</div>
              </div>
              <span className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">demo evidence</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              {[
                ["modeled matched P&L", "$4.80", "text-success"],
                ["matched", "1", "text-foreground"],
                ["no trade", "2", "text-foreground"],
                ["unhedged", "1", "text-danger"],
              ].map(([label, value, tone]) => (
                <div key={label} className="bg-card p-4">
                  <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className={cn("mt-3 font-mono text-3xl font-semibold tabular-nums", tone)}>{value}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
              <div className="bg-card p-5">
                <div className="flex items-center justify-between">
                  <MicroLabel>800 ms route</MicroLabel>
                  <span className="font-mono text-[0.6875rem] uppercase text-success">captured</span>
                </div>
                <div className="mt-10 font-mono text-5xl font-semibold tabular-nums text-success">5.03%</div>
                <p className="mt-2 text-xs text-muted-foreground">Modeled net return in the synthetic matched window.</p>
              </div>
              <div className="bg-primary/[0.045] p-5">
                <div className="flex items-center justify-between">
                  <MicroLabel className="text-primary">3,000 ms route</MicroLabel>
                  <span className="font-mono text-[0.6875rem] uppercase text-warning">missed</span>
                </div>
                <div className="mt-10 font-sans text-5xl font-semibold tracking-[-0.04em]">No trade</div>
                <p className="mt-2 text-xs text-muted-foreground">The after-cost pair is no longer below payout.</p>
              </div>
            </div>
            <p className="border-t border-border px-5 py-4 text-xs leading-5 text-muted-foreground">
              Synthetic replay only. This demonstrates accounting and safety behavior—not historical performance or future returns.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function DeliverySection() {
  return (
    <section className="border-b border-border py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1500px] gap-14 px-4 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
        <Reveal>
          <MicroLabel className="text-signal">05 / honest boundary</MicroLabel>
          <h2 className="mt-5 font-serif text-[clamp(3.8rem,6.8vw,6.8rem)] font-normal leading-[0.86] tracking-[-0.04em]">
            Built now.
            <span className="block text-muted-foreground">Wired next.</span>
          </h2>
          <p className="mt-7 max-w-md text-sm leading-7 text-muted-foreground">
            The strategy core is real code. The current product boundary is explicit so judges and builders can tell implemented behavior from the target system.
          </p>
        </Reveal>
        <Reveal>
          <div className="border border-border bg-card/55">
            {deliveryStatus.map(([label, status, tone]) => (
              <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-4 last:border-0 sm:px-5">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={cn(
                  "font-mono text-[0.6875rem] uppercase tracking-[0.1em]",
                  tone === "good" && "text-success",
                  tone === "feed" && "text-signal",
                  tone === "open" && "text-warning",
                )}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden py-28 sm:py-40">
      <Reveal className="mx-auto max-w-[1500px] px-4 text-center sm:px-6 lg:px-8">
        <div className="mx-auto grid size-20 place-items-center rounded-lg border border-border bg-card"><TxBetMark className="size-12" /></div>
        <MicroLabel className="mt-8 text-primary">Replay the whole decision</MicroLabel>
        <h2 className="mx-auto mt-5 max-w-6xl font-serif text-[clamp(4.5rem,9vw,9rem)] font-normal leading-[0.82] tracking-[-0.05em]">
          The tape is ready.
        </h2>
        <p className="mx-auto mt-8 max-w-xl text-sm leading-7 text-muted-foreground">
          Step through a matched pair, a rejected edge, and an intentionally unhedged fill. Same core. Three outcomes. Full disclosure.
        </p>
        <Link
          href="/console"
          className={cn(
            buttonVariants({ variant: "default" }),
            "mt-9 h-12 rounded-md px-7 font-mono text-xs font-semibold uppercase tracking-[0.14em]",
          )}
        >
          Launch txBet console <span aria-hidden="true">↗</span>
        </Link>
      </Reveal>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-7 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <TxBetLockup compact />
        <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[0.6875rem] uppercase tracking-[0.11em] text-muted-foreground">
          <span>TxLINE smoke boundary</span>
          <span>Synthetic venue books</span>
          <span>Simulated execution</span>
          <span>MIT licensed</span>
        </div>
      </div>
    </footer>
  );
}

export function TxBetLanding() {
  const landingRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 180, damping: 28, mass: 0.35 });
  useLandingMotion({ scope: landingRef });

  return (
    <div ref={landingRef} className="min-h-screen overflow-x-clip text-foreground">
      <motion.div
        aria-hidden="true"
        style={{ scaleX: progress, originX: 0 }}
        className="fixed inset-x-0 top-0 z-[60] h-0.5 bg-primary"
      />
      <LandingHeader />
      <main>
        <BrandSplash />
        <SystemIntro />
        <TensionSection />
        <ProtocolSection />
        <AgentSection />
        <ProofSection />
        <DeliverySection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
