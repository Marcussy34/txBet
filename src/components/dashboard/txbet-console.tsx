"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";

import { AGENTS, getAgent } from "@/agents/definitions";
import { runBacktest } from "@/core/backtest";
import { simulateBundleExecution, settlementBranches } from "@/core/executor";
import { dollarsToMicros, formatBps, formatPrice, formatUsd } from "@/core/money";
import { runPipeline } from "@/core/pipeline";
import type { AgentId, BundleExecution, ScanReason } from "@/core/types";
import {
  DEMO_SCENARIOS,
  SYNTHETIC_BACKTEST_WINDOWS,
  getDemoScenario,
  type DemoFrame,
  type DemoScenarioId,
} from "@/fixtures/demo-tapes";
import { cn } from "@/lib/utils";
import { AgentTelemetry, StatusGlyph, TxBetLockup, TxBetMark } from "@/components/brand/txbet-brand";
import { AuthWalletControl } from "@/components/auth/privy-auth";
import { PolymarketShadowStatus } from "@/components/dashboard/polymarket-shadow-status";
import { WorldCupLiveStatus } from "@/components/dashboard/world-cup-live-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VENUES = [
  { id: "northstar", name: "Northstar" },
  { id: "coast", name: "Coast" },
  { id: "atlas", name: "Atlas" },
] as const;

const reasonCopy: Record<ScanReason, string> = {
  NO_APPROVED_QUOTES: "Two approved, fresh venue quotes are required.",
  SUSPENDED_QUOTE: "A venue quote is suspended.",
  QUOTE_STALE: "A quote exceeded the freshness window.",
  QUOTE_TIMESTAMP_INVALID: "A venue quote has an invalid or future timestamp.",
  MARKET_CLOSED: "The contract is already at or past its close time.",
  SAME_VENUE: "Complementary legs must come from different venues.",
  NOT_COMPLEMENTARY: "The available outcomes do not cover exact YES and NO complements.",
  SETTLEMENT_MISMATCH: "Contract settlement fingerprints do not match exactly.",
  INSUFFICIENT_LIQUIDITY: "Equal executable depth is unavailable on both legs.",
  EXPOSURE_LIMIT: "Maximum exposure is below one paired share.",
  CAPITAL_LIMIT: "Allocated capital is below the all-in bundle cost.",
  COMBINED_COST_GTE_PAYOUT: "After-cost bundle value is not below the $1 payout.",
  MIN_RETURN_NOT_MET: "Net return is below the operator minimum.",
};

function singleSliderValue(value: number | readonly number[], fallback: number): number {
  return typeof value === "number" ? value : value[0] ?? fallback;
}

function PanelHeading({
  index,
  title,
  aside,
}: {
  index: string;
  title: string;
  aside?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[0.6875rem] text-primary">{index}</span>
        <h2 className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-foreground">
          {title}
        </h2>
      </div>
      {aside && <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">{aside}</span>}
    </div>
  );
}

function ControlLabel({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {value && <span className="font-mono text-[0.6875rem] text-foreground">{value}</span>}
    </div>
  );
}

function VenueMatrix({ frame }: { frame: DemoFrame }) {
  if (frame.quotes.length === 0) {
    return (
      <div className="grid min-h-36 place-items-center px-6 text-center text-sm text-muted-foreground">
        Venue books are fetched only after a qualifying action wakes the selected agent.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border/70 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="px-4 py-2 font-normal">Venue</th>
            <th className="px-3 py-2 font-normal">Leg</th>
            <th className="px-3 py-2 font-normal">Ask</th>
            <th className="px-3 py-2 font-normal">Depth</th>
            <th className="px-3 py-2 font-normal">Age</th>
            <th className="px-4 py-2 text-right font-normal">Update</th>
          </tr>
        </thead>
        <tbody>
          {frame.quotes.map((quote) => {
            const depth = quote.asks.reduce((sum, level) => sum + level.quantity, 0);
            const age = Math.max(0, frame.now - quote.updatedAt);
            return (
              <tr key={quote.contract.contractId} className="border-b border-border/45 last:border-0">
                <td className="px-4 py-3 text-sm font-semibold">{quote.contract.venueName}</td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className={cn(
                    "rounded-sm font-mono text-[0.6875rem]",
            "border-border bg-background text-foreground",
                  )}>
                    {quote.contract.outcome}
                  </Badge>
                </td>
                <td className="px-3 py-3 font-mono text-sm font-semibold text-foreground">
                  {formatPrice(quote.asks[0]?.priceMicros ?? 0)}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{depth}</td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{age}ms</td>
                <td className="px-4 py-3 text-right">
                  <span className={cn(
                    "font-mono text-[0.6875rem] uppercase tracking-wider",
                    quote.updateState === "repriced" ? "text-signal" : quote.updateState === "older-quote" ? "text-warning" : "text-muted-foreground",
                  )}>
                    {quote.updateState.replace("-", " ")}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MathRow({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/45 py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono text-xs font-medium",
        tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground",
      )}>
        {value}
      </span>
    </div>
  );
}

function ExecutionPanel({ execution }: { execution: BundleExecution | null }) {
  if (!execution) {
    return <p className="text-sm leading-6 text-muted-foreground">No simulated orders have been submitted at this tape position.</p>;
  }
  return (
    <div className="space-y-3">
      <div className={cn(
        "flex items-center gap-2 border px-3 py-2.5",
        execution.state === "MATCHED" ? "border-success/35 bg-success/8 text-success" : "border-danger/40 bg-danger/8 text-danger",
      )}>
        <StatusGlyph state={execution.state === "MATCHED" ? "locked" : "risk"} />
        <span className="font-mono text-xs font-semibold tracking-wider">{execution.state}</span>
      </div>
      {[execution.yes, execution.no].map((leg) => (
        <div key={leg.outcome} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border/45 pb-2 text-xs last:border-0">
          <span className="font-mono text-foreground">{leg.outcome}</span>
          <span className="text-muted-foreground">{leg.venueId}</span>
          <span className="font-mono">{leg.filledQuantity}/{leg.requestedQuantity}</span>
        </div>
      ))}
      <p className="text-xs leading-5 text-muted-foreground">{execution.message}</p>
    </div>
  );
}

export function TxBetConsole() {
  const [scenarioId, setScenarioId] = useState<DemoScenarioId>("red-card-profit");
  const [agentId, setAgentId] = useState<AgentId>("red-card");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [allocatedCapital, setAllocatedCapital] = useState(500);
  const [minimumReturnBps, setMinimumReturnBps] = useState(200);
  const [maxExposure, setMaxExposure] = useState(100);
  const [automatic, setAutomatic] = useState(true);
  const [approvedVenues, setApprovedVenues] = useState<Record<string, boolean>>({
    northstar: true,
    coast: true,
    atlas: true,
  });

  const scenario = getDemoScenario(scenarioId);
  const frame = scenario.frames[step] ?? scenario.frames[0]!;
  const selectedAgent = getAgent(agentId);
  const settings = {
    allocatedCapitalMicros: dollarsToMicros(allocatedCapital),
    maxExposureMicros: dollarsToMicros(maxExposure),
    minNetReturnBps: minimumReturnBps,
    safetyBufferBps: 43,
    maxQuoteAgeMs: 5_000,
    approvedVenues: new Set(
      Object.entries(approvedVenues).flatMap(([venue, approved]) => approved ? [venue] : []),
    ),
  };

  const pipeline = runPipeline({
    agentId,
    event: frame.event,
    quotes: frame.quotes,
    settings,
    now: frame.now,
  });
  const candidate = pipeline.scan.candidate;
  const execution = (() => {
    if (!automatic || !candidate || !frame.execution) return null;
    return simulateBundleExecution(
      candidate,
      frame.execution === "matched" ? {} : frame.execution,
    );
  })();
  const branches = candidate && execution?.state === "MATCHED"
      ? settlementBranches(candidate, execution.matchedQuantity)
      : [];
  const backtest = runBacktest(SYNTHETIC_BACKTEST_WINDOWS, settings);
  const fastTrace = backtest.traces.find((trace) => trace.id === "red-card-fast");
  const delayedTrace = backtest.traces.find((trace) => trace.id === "red-card-delayed");

  useEffect(() => {
    if (!playing || step >= scenario.frames.length - 1) return;
    const timer = window.setTimeout(
      () => {
        const nextStep = Math.min(step + 1, scenario.frames.length - 1);
        setStep(nextStep);
        if (nextStep >= scenario.frames.length - 1) setPlaying(false);
      },
      1_250 / speed,
    );
    return () => window.clearTimeout(timer);
  }, [playing, scenario.frames.length, speed, step]);

  const changeScenario = (value: unknown) => {
    if (typeof value !== "string") return;
    const next = getDemoScenario(value as DemoScenarioId);
    setScenarioId(next.id);
    setAgentId(next.defaultAgent);
    setStep(0);
    setPlaying(false);
  };

  const decision = execution?.state ?? (candidate ? "READY" : pipeline.trigger.active ? "NO TRADE" : "ARMED");
  const decisionTone = execution?.state === "UNHEDGED" || execution?.state === "INVALID"
    ? "risk"
    : execution?.state === "MATCHED"
      ? "locked"
      : candidate
        ? "ready"
        : "idle";
  const reasons = !pipeline.trigger.active
    ? [pipeline.trigger.reason]
    : pipeline.scan.reasons.map((reason) => reasonCopy[reason]);
  const gateRows = [
    { label: "Qualifying TxLINE action", pass: pipeline.trigger.active },
    { label: "Exact settlement fingerprint", pass: pipeline.scan.evaluatedPairs > 0 || Boolean(candidate) },
    { label: "Equal executable depth", pass: Boolean(candidate) },
    { label: "After-cost bundle below $1", pass: Boolean(candidate) },
    { label: `Net return ≥ ${formatBps(minimumReturnBps)}`, pass: Boolean(candidate) },
  ];

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Back to txBet landing page" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="sm:hidden"><TxBetLockup compact /></span>
            <span className="hidden sm:block"><TxBetLockup /></span>
          </Link>
          <Badge variant="outline" className="border-border bg-card font-mono text-[0.6875rem] tracking-wider text-muted-foreground md:hidden">
            SYNTHETIC · SIMULATED
          </Badge>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline" className="border-signal/35 bg-signal/5 font-mono text-[0.6875rem] tracking-wider text-signal">
                READ-ONLY LIVE STATUS
              </Badge>
              <Badge variant="outline" className="border-border bg-card font-mono text-[0.6875rem] tracking-wider text-foreground">
                SYNTHETIC REPLAY
              </Badge>
              <Badge variant="outline" className="border-border bg-card font-mono text-[0.6875rem] tracking-wider text-muted-foreground">
                SIMULATED EXECUTION
              </Badge>
            </div>
            <AuthWalletControl />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
        <section className="relative mb-5 overflow-hidden rounded-xl border border-border bg-card/80 px-5 py-6 sm:px-7">
          <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="mb-2 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-primary">No edge. No trade. / tape 001</p>
              <h1 className="max-w-4xl font-serif text-4xl font-normal leading-[0.96] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
                The match event wakes the agent.
                <span className="block text-muted-foreground">Settlement math decides.</span>
              </h1>
            </div>
            <div className="grid min-w-[270px] grid-cols-3 border border-border bg-background/70">
              <div className="px-4 py-3 text-left">
                <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">home</div>
                <div className="mt-1 font-sans text-lg font-semibold">{scenario.fixture.home}</div>
              </div>
              <div className="grid place-items-center border-x border-border px-4 py-3 text-center">
                <div className="font-mono text-2xl font-semibold tabular-nums">{frame.score}</div>
                <div className="font-mono text-[0.6875rem] text-primary">{frame.clock}</div>
              </div>
              <div className="px-4 py-3 text-right">
                <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">away</div>
                <div className="mt-1 font-sans text-lg font-semibold">{scenario.fixture.away}</div>
              </div>
            </div>
          </div>
        </section>

        <Card className="mb-4 gap-0 bg-card/85 py-0">
          <PanelHeading index="M1" title="MVP live boundaries" aside="read-only" />
          <CardContent className="grid gap-3 px-3 py-3 lg:grid-cols-2">
            <WorldCupLiveStatus />
            <PolymarketShadowStatus />
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
          <aside className="space-y-4">
            <Card className="gap-0 bg-card/85 py-0">
              <PanelHeading index="01" title="Operator controls" aside="simulation" />
              <CardContent className="space-y-5 px-4 py-4">
                <div>
                  <ControlLabel label="Demo tape" />
                  <Select value={scenarioId} onValueChange={changeScenario}>
                    <SelectTrigger aria-label="Demo tape" className="h-10 w-full border-border bg-background/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} className="border border-border">
                      {DEMO_SCENARIOS.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-[0.6875rem] leading-5 text-muted-foreground">{scenario.subtitle}</p>
                </div>

                <Separator />
                <div>
                  <ControlLabel label="Selectable live-action agent" />
                  <div className="grid grid-cols-2 gap-2">
                    {AGENTS.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setAgentId(agent.id)}
                        className={cn(
                          "group overflow-hidden border text-left transition-colors",
                          agentId === agent.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background/40 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                        )}
                        aria-pressed={agentId === agent.id}
                      >
                        <AgentTelemetry agent={agent.id} className="aspect-square w-full border-0 border-b border-border" />
                        <span className="block min-h-10 px-2 py-2 text-[0.6875rem] font-semibold leading-tight">{agent.shortName}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 border border-border bg-background/45 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-primary">Selected agent</span>
                      <span className="font-mono text-[0.6875rem] text-signal">ARMED</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-foreground">{selectedAgent.name}</div>
                    <p className="mt-1.5 text-[0.6875rem] leading-4 text-muted-foreground">{selectedAgent.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedAgent.marketFamilies.map((family) => (
                        <span key={family} className="rounded-sm border border-border px-1.5 py-1 font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                          {family.replaceAll("-", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />
                <div>
                  <ControlLabel label="Allocated capital" value={`$${allocatedCapital}`} />
                  <Slider aria-label="Allocated capital in dollars" value={[allocatedCapital]} min={100} max={1_000} step={50} onValueChange={(value) => setAllocatedCapital(singleSliderValue(value, 500))} />
                </div>
                <div>
                  <ControlLabel label="Minimum net return" value={formatBps(minimumReturnBps)} />
                  <Slider aria-label="Minimum net return in basis points" value={[minimumReturnBps]} min={50} max={1_000} step={25} onValueChange={(value) => setMinimumReturnBps(singleSliderValue(value, 200))} />
                </div>
                <div>
                  <ControlLabel label="Maximum exposure" value={`$${maxExposure}`} />
                  <Slider aria-label="Maximum exposure in dollars" value={[maxExposure]} min={25} max={500} step={25} onValueChange={(value) => setMaxExposure(singleSliderValue(value, 100))} />
                </div>

                <Separator />
                <div>
                  <ControlLabel label="Approved platforms" />
                  <div className="space-y-2.5">
                    {VENUES.map((venue) => (
                      <label key={venue.id} className="flex cursor-pointer items-center justify-between gap-3 text-xs">
                        <span>{venue.name}</span>
                        <Checkbox
                          checked={approvedVenues[venue.id]}
                          onCheckedChange={(checked) => setApprovedVenues((current) => ({ ...current, [venue.id]: checked }))}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border border-border bg-background/40 px-3 py-2.5">
                  <div>
                    <div className="text-xs font-semibold">Automatic simulated execution</div>
                    <div className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">off = scan only</div>
                  </div>
                  <Switch aria-label="Automatic simulated execution" checked={automatic} onCheckedChange={setAutomatic} />
                </div>
              </CardContent>
            </Card>
          </aside>

          <div className="min-w-0 space-y-4">
            <Card className="gap-0 bg-card/85 py-0">
              <PanelHeading index="02" title="TxLINE action tape" aside={`${step + 1} / ${scenario.frames.length}`} />
              <CardContent className="px-0 py-0">
                <ScrollArea className="h-[150px]">
                  <div className="space-y-0 px-4 py-2">
                    {scenario.frames.map((item, index) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => { setStep(index); setPlaying(false); }}
                        className={cn(
                          "grid w-full grid-cols-[52px_12px_1fr] items-start gap-3 border-b border-border/45 py-2.5 text-left last:border-0",
                          index > step && "opacity-35",
                        )}
                      >
                        <span className="font-mono text-[0.6875rem] text-muted-foreground">{item.clock}</span>
                        <span className={cn(
                          "mt-1 block size-2 border",
                          index === step ? "border-primary bg-primary" : index < step ? "border-success bg-success" : "border-border",
                        )} />
                        <span>
                          <span className="block text-xs font-semibold">{item.label}</span>
                          <span className="mt-0.5 block text-[0.6875rem] leading-4 text-muted-foreground">
                            {item.event?.description ?? "Agent remains armed; no venue scan is requested."}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="gap-0 bg-card/85 py-0">
              <PanelHeading index="03" title="Cross-venue matrix" aside={`${frame.quotes.length} books`} />
              <CardContent className="px-0 py-0"><VenueMatrix frame={frame} /></CardContent>
            </Card>

            <Card className="gap-0 bg-card/85 py-0">
              <PanelHeading index="04" title="Matched-position composer" aside="fixed $1 payout" />
              <CardContent className="px-4 py-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${scenarioId}-${step}-${agentId}-${candidate?.id ?? "none"}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.24 }}
                  >
                    {candidate ? (
                      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                        <div className="rounded-md border border-border bg-background/55 p-4">
                          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-foreground">Buy YES</div>
                          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{formatPrice(candidate.yes.averagePriceMicros)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{candidate.yes.venueName} · {candidate.quantity} shares</div>
                        </div>
                        <div className="grid place-items-center">
                          <div className="grid size-14 place-items-center rounded-md border border-border bg-card">
                            <TxBetMark className="size-9" />
                          </div>
                        </div>
                        <div className="rounded-md border border-border bg-background/55 p-4 text-right md:text-left">
                          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-foreground">Buy NO</div>
                          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{formatPrice(candidate.no.averagePriceMicros)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{candidate.no.venueName} · {candidate.quantity} shares</div>
                        </div>
                        <div className="md:col-span-3 grid gap-x-8 md:grid-cols-2">
                          <MathRow label="Raw complementary cost" value={formatUsd(candidate.rawCostMicros)} />
                          <MathRow label="Venue fees" value={formatUsd(candidate.feeMicros)} />
                          <MathRow label="Safety / slippage buffer" value={formatUsd(candidate.safetyBufferMicros)} />
                          <MathRow label="Settlement payout" value={formatUsd(candidate.payoutMicros)} />
                          <MathRow label="All-in cost" value={formatUsd(candidate.allInCostMicros)} />
                          <MathRow label="Modeled net profit" value={formatUsd(candidate.netProfitMicros)} tone="good" />
                          <MathRow label="Gross return" value={formatBps(candidate.grossReturnBps)} />
                          <MathRow label="Net return" value={formatBps(candidate.netReturnBps)} tone="good" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid min-h-48 place-items-center border border-dashed border-border bg-background/35 px-6 text-center">
                        <div className="max-w-md">
                          <StatusGlyph state={pipeline.trigger.active ? "blocked" : "scan"} className="mx-auto size-8 text-muted-foreground" />
                          <h3 className="mt-3 font-sans text-2xl font-semibold tracking-[-0.03em]">
                            {pipeline.trigger.active ? "No executable bundle" : "Waiting for match action"}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {reasons[0] ?? "No edge. No trade."}
                          </p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>

            <Card className="gap-0 bg-card/85 py-0">
              <PanelHeading index="05" title="Synthetic replay report + latency lab" aside={`${backtest.windows} windows`} />
              <CardContent className="px-4 py-4">
                <div className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
                  {[
                    ["Modeled matched P&L", formatUsd(backtest.lockedProfitMicros), "text-success"],
                    ["Matched bundles", String(backtest.matchedCount), "text-foreground"],
                    ["No-trade windows", String(backtest.noTradeCount), "text-foreground"],
                    ["Unhedged alerts", String(backtest.unhedgedCount), "text-danger"],
                  ].map(([label, value, tone]) => (
                    <div key={label} className="bg-card px-3 py-3">
                      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">{label}</div>
                      <div className={cn("mt-2 font-mono text-xl font-semibold tabular-nums", tone)}>{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-success/30 bg-success/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-foreground">800ms route</span>
                      <span className="font-mono text-[0.6875rem] text-success">CAPTURED</span>
                    </div>
                    <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-success">
                      {fastTrace?.scan.candidate ? formatBps(fastTrace.scan.candidate.netReturnBps) : "—"}
                    </div>
                    <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">The replay bundle remains below payout after modeled costs.</p>
                  </div>
                  <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-foreground">3,000ms route</span>
                      <span className="font-mono text-[0.6875rem] text-warning">MISSED</span>
                    </div>
                    <div className="mt-2 font-sans text-xl font-semibold">NO TRADE</div>
                    <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
                      {delayedTrace?.scan.reasons[0] ? reasonCopy[delayedTrace.scan.reasons[0]] : "The gap has decayed."}
                    </p>
                  </div>
                </div>
                <p className="mt-3 border-l-2 border-border pl-3 text-xs leading-5 text-muted-foreground">
                  Synthetic replay evidence only. Modeled matched P&amp;L excludes the intentionally unhedged window and does not predict real-world returns.
                </p>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="gap-0 bg-card/85 py-0">
              <PanelHeading index="06" title="Decision gate" aside={automatic ? "sim auto" : "scan only"} />
              <CardContent className="px-4 py-4">
                <div className={cn(
                  "mb-4 flex items-center justify-between gap-4 border px-3 py-3",
                  decisionTone === "locked" && "border-success/40 bg-success/8 text-success",
                  decisionTone === "risk" && "border-danger/45 bg-danger/8 text-danger",
                  decisionTone === "ready" && "border-signal/40 bg-signal/8 text-signal",
                  decisionTone === "idle" && "border-border bg-background/45 text-muted-foreground",
                )}>
                  <div className="flex items-center gap-2">
                    <StatusGlyph state={decisionTone === "locked" ? "locked" : decisionTone === "risk" ? "risk" : decisionTone === "ready" ? "scan" : "blocked"} />
                    <span className="font-mono text-xs font-semibold tracking-wider">{decision}</span>
                  </div>
                  <span className="font-mono text-[0.6875rem] uppercase tracking-widest">no edge, no trade</span>
                </div>
                <div className="space-y-0">
                  {gateRows.map((gate) => (
                    <div key={gate.label} className="flex items-center justify-between gap-3 border-b border-border/45 py-2.5 last:border-0">
                      <span className="text-xs text-muted-foreground">{gate.label}</span>
                      <span className={cn("font-mono text-[0.6875rem]", gate.pass ? "text-success" : "text-muted-foreground")}>
                        {gate.pass ? "PASS" : "WAIT"}
                      </span>
                    </div>
                  ))}
                </div>
                {reasons.length > 0 && pipeline.trigger.active && (
                  <div className="mt-4 border-l-2 border-warning bg-warning/6 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                    {reasons[0]}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="gap-0 bg-card/85 py-0">
              <PanelHeading index="07" title="Bundle state" aside="two-leg" />
              <CardContent className="px-4 py-4">
                <Tabs defaultValue="execution">
                  <TabsList variant="line" className="w-full justify-start">
                    <TabsTrigger value="execution">Execution</TabsTrigger>
                    <TabsTrigger value="settlement">Settlement</TabsTrigger>
                  </TabsList>
                  <TabsContent value="execution" className="pt-4">
                    <ExecutionPanel execution={execution} />
                  </TabsContent>
                  <TabsContent value="settlement" className="pt-4">
                    {branches.length > 0 ? (
                      <div className="space-y-3">
                        {branches.map((branch) => (
                          <div key={branch.winner} className="border border-border bg-background/40 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono text-xs text-foreground">{branch.winner} wins</span>
                              <span className="font-mono text-xs text-success">+{formatUsd(branch.modeledProfitMicros)}</span>
                            </div>
                            <div className="mt-1 text-[0.6875rem] text-muted-foreground">Payout {formatUsd(branch.payoutMicros)}</div>
                          </div>
                        ))}
                        <p className="text-[0.6875rem] leading-5 text-muted-foreground">
                          Both modeled branches produce the same P&amp;L only after equal complementary fills.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-muted-foreground">Settlement branches appear after a fully matched simulated bundle.</p>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card className="gap-0 border-warning/25 bg-warning/[0.035] py-0">
              <CardHeader className="px-4 py-4">
                <CardTitle className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-warning">Pitch-safe disclosure</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 text-xs leading-5 text-muted-foreground">
                {scenario.disclosure}. In this replay, modeled profit appears matched only after equal simulated fills and compatible settlement rules.
              </CardContent>
            </Card>
          </aside>
        </div>

        <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto mt-4 flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-2xl backdrop-blur-xl">
          <Button
            variant="outline"
            size="icon"
            title="Reset replay"
            onClick={() => { setStep(0); setPlaying(false); }}
            className="rounded-md"
          >
            <RotateCcw />
          </Button>
          <Button
            onClick={() => {
              if (!playing && step >= scenario.frames.length - 1) {
                setStep(0);
                setPlaying(true);
                return;
              }
              setPlaying((current) => !current);
            }}
            className="h-9 flex-1 rounded-md bg-primary px-4 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground"
          >
            {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {playing ? "Pause tape" : step >= scenario.frames.length - 1 ? "Replay tape" : "Play tape"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Advance one step"
            onClick={() => { setStep((current) => Math.min(current + 1, scenario.frames.length - 1)); setPlaying(false); }}
            className="rounded-md"
          >
            <StepForward />
          </Button>
          <div className="flex gap-1 max-[359px]:order-last max-[359px]:w-full max-[359px]:justify-end max-[359px]:border-t max-[359px]:border-border max-[359px]:pt-2">
            {[1, 2, 4].map((rate) => (
              <Button
                key={rate}
                variant={speed === rate ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSpeed(rate)}
                className="rounded-md font-mono text-[0.6875rem]"
              >
                {rate}×
              </Button>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-4 py-5 text-center font-mono text-[0.6875rem] uppercase tracking-[0.11em] text-muted-foreground">
        txBet / read-only live status / deterministic replay / money mutations disabled
      </footer>
    </div>
  );
}
