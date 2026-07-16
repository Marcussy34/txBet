"use client";

import Link from "next/link";
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
  LatencyCorridor,
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
    copy: "A qualifying TxLINE-format match action activates one selected agent.",
    tone: "text-primary",
  },
  {
    index: "02",
    title: "Verify",
    copy: "Fixture, market family, settlement, void rules, payout, and close time must align.",
    tone: "text-signal",
  },
  {
    index: "03",
    title: "Pair",
    copy: "Equal executable YES and NO depth is priced across different approved venues.",
    tone: "text-success",
  },
  {
    index: "04",
    title: "Guard",
    copy: "Fees, buffer, capital, exposure, freshness, and minimum return decide the action.",
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
      <div data-gsap-beam="true" aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
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
        <div className="flex items-center justify-between border-b border-border/70 py-4">
          <MicroLabel className="text-foreground">TxLINE smoke boundary / 001</MicroLabel>
          <MicroLabel className="hidden sm:block">World Cup hackathon</MicroLabel>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-16">
          <div data-gsap-lockup="true" className="grid w-full max-w-5xl grid-cols-2 items-center">
            <motion.div
              initial={false}
              animate={{ x: identityReady ? 0 : 14 }}
              transition={splashTransition}
              className="flex justify-end pr-[clamp(1rem,2vw,2rem)]"
            >
              <TxBetMark className="size-[clamp(4.5rem,8vw,7rem)]" />
            </motion.div>
            <motion.div
              initial={false}
              animate={{ x: identityReady ? 0 : -14 }}
              transition={splashTransition}
              className="flex justify-start pl-[clamp(1rem,2vw,2rem)]"
            >
              <span className="font-sans text-[clamp(3.4rem,8vw,7.4rem)] font-semibold leading-none tracking-[-0.065em]">txBet</span>
            </motion.div>
          </div>

          <motion.div
            initial={false}
            animate={{ y: detailsReady ? 0 : 10 }}
            transition={splashTransition}
            className="mt-10 flex max-w-4xl flex-col items-center sm:mt-14"
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
    <div className="relative mx-auto w-full max-w-[620px] lg:mr-0">
      <div className="absolute -inset-6 rounded-xl border border-border/50 bg-card/30" />
      <div className="relative overflow-hidden rounded-xl border border-border bg-card/94 shadow-[0_28px_90px_color-mix(in_oklch,var(--background),black_35%)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 bg-primary" />
            <MicroLabel className="text-foreground">Action tape / 001</MicroLabel>
          </div>
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">synthetic replay</span>
        </div>

        <div className="border-b border-border bg-background/75 px-4 py-3">
          <LatencyCorridor className="h-auto max-h-40" />
          <p className="mt-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
            Illustrative timing · not measured venue latency
          </p>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-[0.88fr_1.12fr]">
          <div className="bg-background/95 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <MicroLabel>TxLINE-format event</MicroLabel>
              <span className="font-mono text-[0.6875rem] text-foreground">63:00</span>
            </div>
            <div className="mt-8 flex items-start justify-between gap-4">
              <div>
                <div className="font-sans text-3xl font-semibold tracking-[-0.035em]">Red card</div>
                <div className="mt-2 text-sm text-muted-foreground">Spain · defender dismissed</div>
              </div>
              <div className="h-14 w-10 rotate-[-6deg] rounded-sm border border-foreground/35 bg-foreground" />
            </div>
            <div className="mt-8 flex items-center gap-2 border-t border-border pt-3">
              <StatusGlyph state="scan" className="text-signal" />
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-signal">scan awakened</span>
            </div>
          </div>

          <div className="bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <MicroLabel>Cross-venue pair</MicroLabel>
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-success">exact complements</span>
            </div>
            <p className="mt-4 border-l border-success/50 pl-3 text-xs text-foreground">
              Shared proposition · Will Argentina qualify?
            </p>
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-[1fr_auto] rounded-md border border-border bg-background/55 p-3">
                <div>
                  <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-foreground">Northstar · YES</div>
                  <div className="mt-1 text-xs text-muted-foreground">repriced</div>
                </div>
                <div className="font-mono text-2xl font-semibold tabular-nums">$0.54</div>
              </div>
              <div className="grid grid-cols-[1fr_auto] rounded-md border border-border bg-background/55 p-3">
                <div>
                  <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-foreground">Coast · NO</div>
                  <div className="mt-1 text-xs text-warning">older quote</div>
                </div>
                <div className="font-mono text-2xl font-semibold tabular-nums">$0.40</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          {[
            ["raw pair", "$0.940"],
            ["modeled cost", "$0.952"],
            ["payout", "$1.000"],
            ["modeled edge", "+$0.048"],
          ].map(([label, value], index) => (
            <div key={label} className="bg-background/95 px-3 py-3">
              <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", index === 3 && "text-success")}>{value}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-success/30 bg-success/[0.045] px-4 py-3 text-success">
          <div className="flex items-center gap-2">
            <StatusGlyph state="locked" />
            <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.13em]">matched in replay</span>
          </div>
          <span className="font-mono text-[0.6875rem] uppercase tracking-wider">equal simulated fills</span>
        </div>
      </div>
    </div>
  );
}

function SystemIntro() {
  return (
    <section id="system" className="relative isolate overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 top-8 -z-10 font-serif text-[32vw] leading-none tracking-[-0.08em] text-foreground/[0.025] sm:text-[23vw]"
      >
        63:00
      </div>
      <div className="mx-auto grid min-h-[calc(100svh-4.5rem)] max-w-[1500px] items-center gap-16 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)] lg:px-8 lg:py-20">
        <div className="relative z-10 max-w-[790px]">
          <div className="mb-7 flex flex-wrap items-center gap-3">
            <span className="rounded-sm border border-primary/40 bg-primary/[0.06] px-2.5 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-primary">
              Event-driven trading infrastructure
            </span>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">World Cup hackathon · built for TxLINE input</span>
          </div>
          <h2 className="font-serif text-[clamp(4.25rem,8.5vw,8.7rem)] font-normal leading-[0.82] tracking-[-0.05em]">
            See the gap
            <span className="block text-muted-foreground">before the market</span>
            <span className="block">catches up.</span>
          </h2>
          <p className="mt-9 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            A TxLINE-format match event wakes a cross-venue scan. Exact settlement matching and after-cost execution math decide whether complementary outcomes form a modeled pair.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/console"
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-12 rounded-md px-6 font-mono text-xs font-semibold uppercase tracking-[0.14em]",
              )}
            >
              Enter replay console <span aria-hidden="true">↗</span>
            </Link>
            <a
              href="#protocol"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-12 rounded-md px-6 font-mono text-xs uppercase tracking-[0.14em]",
              )}
            >
              Read the protocol <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-4 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="text-signal">TxLINE smoke boundary</span>
            <span>synthetic venue books</span>
            <span>simulated fills</span>
            <span>no live money</span>
          </div>
        </div>

        <div className="relative z-10 lg:pt-8">
          <MarketSignalPreview />
        </div>
      </div>

      <div className="border-t border-border bg-background/88">
        <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-px bg-border sm:grid-cols-5">
          {["match action", "scope", "settlement", "cost", "execution state"].map((item, index) => (
            <div key={item} className="flex items-center gap-3 bg-background px-4 py-3 sm:px-6">
              <span className="font-mono text-[0.6875rem] text-primary">0{index + 1}</span>
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TensionSection() {
  return (
    <section className="border-b border-border py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1500px] gap-14 px-4 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
        <Reveal>
          <MicroLabel className="text-primary">01 / the market tension</MicroLabel>
          <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">
            Sports truth updates once. Market prices update venue by venue. txBet is designed for the interval between those two moments.
          </p>
        </Reveal>
        <Reveal>
          <h2 className="font-serif text-[clamp(3.8rem,7.5vw,8rem)] font-normal leading-[0.86] tracking-[-0.045em]">
            One event.
            <span className="block text-muted-foreground">Many clocks.</span>
            <span className="block">One payout.</span>
          </h2>
          <div className="mt-12 overflow-hidden border border-border bg-card/45">
            <div className="border-b border-border bg-background/65 px-3 py-5 sm:px-6 sm:py-7">
              <QuoteWindowGraphic className="h-auto max-h-72" />
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-3">
              <div className="bg-card p-5">
                <MicroLabel>event received</MicroLabel>
                <div className="mt-3 font-mono text-3xl font-semibold tabular-nums">0 ms</div>
              </div>
              <div className="bg-card p-5">
                <MicroLabel>synthetic capture</MicroLabel>
                <div className="mt-3 font-mono text-3xl font-semibold tabular-nums text-success">800 ms</div>
              </div>
              <div className="bg-card p-5">
                <MicroLabel>synthetic gap gone</MicroLabel>
                <div className="mt-3 font-mono text-3xl font-semibold tabular-nums text-warning">3,000 ms</div>
              </div>
            </div>
          </div>
          <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
            Demonstration timing only · not measured venue latency
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function ProtocolSection() {
  return (
    <section id="protocol" className="border-b border-border bg-card/25 py-24 sm:py-32">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div>
            <MicroLabel className="text-signal">02 / execution protocol</MicroLabel>
            <h2 className="mt-5 max-w-5xl font-serif text-[clamp(3.8rem,7.2vw,7.4rem)] font-normal leading-[0.86] tracking-[-0.04em]">
              Speed finds it.
              <span className="block text-muted-foreground">Rules decide it.</span>
            </h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-muted-foreground">
            The event is only a trigger. A candidate must survive contract equivalence, executable depth, cost, and risk checks before the replay can mark it matched.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
          {protocol.map((step) => (
            <Reveal key={step.index} className="h-full bg-background">
              <article className="group flex h-full min-h-64 flex-col p-5 transition-colors hover:bg-card sm:p-6">
                <div className="flex items-center justify-between">
                  <span className={cn("font-mono text-xs", step.tone)}>{step.index}</span>
                  <span className="h-px w-16 bg-border transition-[width,background-color] group-hover:w-24 group-hover:bg-primary" />
                </div>
                <h3 className="mt-12 font-serif text-5xl font-normal tracking-[-0.035em]">{step.title}</h3>
                <p className="mt-auto pt-8 text-sm leading-6 text-muted-foreground">{step.copy}</p>
              </article>
            </Reveal>
          ))}
        </div>
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
