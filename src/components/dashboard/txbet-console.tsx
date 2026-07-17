"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronDown, Pause, Play, RotateCcw, StepForward } from "lucide-react";

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
import { AgentGlyph, agentTelemetry, StatusGlyph, TxBetLockup, TxBetMark } from "@/components/brand/txbet-brand";
import { AuthWalletControl } from "@/components/auth/privy-auth";
import { ConsoleBackdrop } from "@/components/dashboard/console-backdrop";
import { ExecutionControlPanel } from "@/components/dashboard/execution-control-panel";
import { PolymarketShadowStatus } from "@/components/dashboard/polymarket-shadow-status";
import { StadiumPitch } from "@/components/dashboard/stadium-pitch";
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

// Every agent carries a deterministic replay tape, so the full roster is
// launchable: three profitable/risk stories and three honest refusal scans.
const AGENT_TAPES: Partial<Record<AgentId, DemoScenarioId>> = {
  "red-card": "red-card-profit",
  "corner-pressure": "corner-no-edge",
  "penalty-var": "penalty-partial",
  injury: "injury-no-edge",
  "goal-reaction": "goal-reaction-profit",
  "dangerous-free-kick": "free-kick-margin",
};

type ReplayMatch = {
  fixture: (typeof DEMO_SCENARIOS)[number]["fixture"];
  scenarios: (typeof DEMO_SCENARIOS)[number][];
};

// One entry per fixture. Every current tape shares the synthetic Spain–Argentina
// fixture, so today this yields a single enterable match; live fixtures join the
// list only once the TxLINE feed is configured (no invented schedules).
const REPLAY_MATCHES: readonly ReplayMatch[] = (() => {
  const byFixture = new Map<string, ReplayMatch>();
  for (const scenario of DEMO_SCENARIOS) {
    const entry = byFixture.get(scenario.fixture.id) ?? { fixture: scenario.fixture, scenarios: [] };
    entry.scenarios.push(scenario);
    byFixture.set(scenario.fixture.id, entry);
  }
  return [...byFixture.values()];
})();

type BoardTeam = { name: string; flag: string };

type BoardFixture = {
  id: string;
  home: BoardTeam;
  away: BoardTeam;
  kickoffDate: string;
  kickoffTime: string;
  kickoffISO: string;
  /** Synthetic pre-match book, percent chances; multipliers derive as 100/p. */
  book: { home: number; draw: number; away: number };
};

// Fixture board. Flags are self-hosted Flagpedia SVGs under /public/flags.
// wc-demo-001 carries the replay tapes and is enterable; the other fixture
// stays awaiting-feed until TxLINE is configured. Books are synthetic.
const WORLD_CUP_BOARD: readonly BoardFixture[] = [
  {
    id: "wc-demo-001",
    home: { name: "Spain", flag: "/flags/es.svg" },
    away: { name: "Argentina", flag: "/flags/ar.svg" },
    kickoffDate: "Mon, Jul 20",
    kickoffTime: "03:00 AM",
    kickoffISO: "2026-07-20T03:00:00",
    book: { home: 42.8, draw: 32.5, away: 26.9 },
  },
  {
    id: "wc-demo-002",
    home: { name: "France", flag: "/flags/fr.svg" },
    away: { name: "England", flag: "/flags/gb-eng.svg" },
    kickoffDate: "Sun, Jul 19",
    kickoffTime: "05:00 AM",
    kickoffISO: "2026-07-19T05:00:00",
    book: { home: 51, draw: 25, away: 25.6 },
  },
];

const TEAM_COLORS: Record<string, string> = {
  Spain: "#d92b2b",
  Argentina: "#6cace4",
  France: "#1d3f8f",
  England: "#ffffff",
};

function bookMultiplier(percent: number): string {
  return `${(100 / percent).toFixed(2)}x`;
}

// Each agent owns one watch market, rendered Predictefy-style: named outcomes
// with one yes-ask each (no yes/no columns). Prices are the asks from each
// agent's tape decision frame; `lead` marks the side the agent enters first
// and gets the filled price pill. Each leg carries the venue it is shopped
// on; the market header shows the venues its bundle spans.
type AgentVenue = "Polymarket" | "Kalshi";
const AGENT_VENUE_MARKS: Record<AgentVenue, string> = {
  Polymarket: "/venues/polymarket-blue.svg",
  Kalshi: "/venues/kalshi.svg",
};
type AgentOutcome = { label: string; price: number; venue: AgentVenue; flag?: string; lead?: boolean };
const AGENT_MARKET_LINES: Record<AgentId, { market: string; outcomes: readonly AgentOutcome[] }> = {
  "red-card": {
    market: "Match winner after dismissal",
    outcomes: [
      { label: "Spain", price: 54, venue: "Polymarket", flag: "/flags/es.svg", lead: true },
      { label: "Argentina", price: 40, venue: "Kalshi", flag: "/flags/ar.svg" },
    ],
  },
  "penalty-var": {
    market: "Next goal on penalty",
    outcomes: [
      { label: "Goal", price: 58, venue: "Polymarket", lead: true },
      { label: "No goal", price: 35, venue: "Kalshi" },
    ],
  },
  "corner-pressure": {
    market: "Next goal in pressure window",
    outcomes: [
      { label: "Goal", price: 72, venue: "Kalshi", lead: true },
      { label: "No goal", price: 34, venue: "Polymarket" },
    ],
  },
  "goal-reaction": {
    market: "Totals after a goal",
    outcomes: [
      { label: "Over 2.5", price: 51, venue: "Polymarket", lead: true },
      { label: "Under 2.5", price: 42, venue: "Kalshi" },
    ],
  },
  injury: {
    market: "Match winner after key sub",
    outcomes: [
      { label: "Spain", price: 58, venue: "Kalshi", flag: "/flags/es.svg", lead: true },
      { label: "Argentina", price: 45, venue: "Polymarket", flag: "/flags/ar.svg" },
    ],
  },
  "dangerous-free-kick": {
    market: "Next goal from set piece",
    outcomes: [
      { label: "Goal", price: 33, venue: "Polymarket", lead: true },
      { label: "No goal", price: 65, venue: "Kalshi" },
    ],
  },
};

// Backtest windows carry their owning agent; traces reuse the window ids.
const WINDOW_AGENT_BY_ID = new Map(SYNTHETIC_BACKTEST_WINDOWS.map((window) => [window.id, window.agentId]));

type PastFixture = {
  id: string;
  home: BoardTeam;
  away: BoardTeam;
  date: string;
  score: { home: number; away: number };
  scoreNote?: string;
  href?: string; // settled matches with an agent backtest page link out to it
};

// Archive row: settled fixtures; ARG-SUI opens the real-data agent backtest.
const PAST_WORLD_CUP: readonly PastFixture[] = [
  {
    id: "txline-18222446",
    home: { name: "Argentina", flag: "/flags/ar.svg" },
    away: { name: "Switzerland", flag: "/flags/ch.svg" },
    date: "Sat, Jul 11",
    score: { home: 3, away: 1 },
    scoreNote: "aet",
    href: "/matches",
  },
];

/* MATCH HUB
 * Inside a match, four tabs: the agent roster plus market, venue odds, and
 * match details. The fixture supplies its market series, books, and stats;
 * the timeline markers derive from the actual replay tape events.
 */
type MatchTab = "market" | "odds" | "details";

const MATCH_TABS: readonly { id: MatchTab; label: string }[] = [
  { id: "market", label: "Market" },
  { id: "odds", label: "Compare odds" },
  { id: "details", label: "Details" },
];

// Synthetic pre-match probability series; each line ends on the board book.
const MATCH_MARKET_SERIES: readonly { label: string; dash?: boolean; muted?: boolean; labelDy?: number; points: readonly number[] }[] = [
  { label: "Spain", points: [45, 44.4, 44.8, 44.1, 43.5, 43.8, 43, 42.4, 42.8] },
  { label: "Draw", dash: true, muted: true, labelDy: -5, points: [30, 30.5, 30.2, 31, 31.4, 31.1, 31.8, 32.2, 32.5] },
  { label: "Argentina", muted: true, labelDy: 8, points: [25, 25.3, 24.9, 25.2, 25.5, 25.7, 25.9, 26.5, 26.9] },
];

// Synthetic asks in cents per outcome; the cheapest ask per column is marked.
const MATCH_VENUE_ODDS: readonly {
  venue: string;
  icon?: string;
  flatten?: boolean;
  prices: { home: number | null; draw: number | null; away: number | null };
}[] = [
  { venue: "Polymarket", icon: "/venues/polymarket-blue.svg", prices: { home: 43, draw: 33, away: 27 } },
  { venue: "Kalshi", icon: "/venues/kalshi.svg", prices: { home: 44, draw: 32, away: 27 } },
  { venue: "SX Bet", icon: "/venues/sxbet.png", flatten: true, prices: { home: 43, draw: 34, away: 28 } },
  { venue: "Predict.fun", icon: "/venues/predictfun.svg", prices: { home: 44, draw: 33, away: 26 } },
  { venue: "Limitless", icon: "/venues/limitless.svg", prices: { home: 45, draw: 33, away: 27 } },
  { venue: "Opinion", icon: "/venues/opinion.webp", prices: { home: 43, draw: null, away: null } },
];

// Synthetic snapshot at the 63:00 trigger minute.
const MATCH_STATS: readonly { label: string; home: number; away: number; suffix?: string }[] = [
  { label: "Ball possession", home: 54, away: 46, suffix: "%" },
  { label: "Shots", home: 9, away: 7 },
  { label: "Shots on target", home: 4, away: 3 },
  { label: "Attacks", home: 38, away: 31 },
  { label: "Corners", home: 5, away: 3 },
  { label: "Cards", home: 2, away: 1 },
];

// Every marker comes from a real tape frame, so the timeline stays truthful.
const TIMELINE_EVENTS: readonly { minute: number; label: string }[] = DEMO_SCENARIOS.flatMap((scenario) =>
  scenario.frames
    .filter((frame) => frame.event)
    .map((frame) => ({ minute: Number.parseInt(frame.clock, 10), label: frame.label })),
).sort((a, b) => a.minute - b.minute);

function MarketChartCard() {
  const width = 640;
  const height = 210;
  const top = 14;
  const bottom = 26;
  const left = 44;
  const right = 110;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const yFor = (percent: number) => top + plotH - (percent / 100) * plotH;
  const xFor = (index: number, count: number) => left + (index / (count - 1)) * plotW;
  return (
    <Card className="gap-0 bg-card/85 py-0">
      <PanelHeading index="MK" title="Match-winner market" aside="market series" />
      <CardContent className="px-4 py-4">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Match-winner probability series" className="h-auto w-full">
          {[25, 50, 75].map((percent) => (
            <g key={percent}>
              <line x1={left} x2={left + plotW} y1={yFor(percent)} y2={yFor(percent)} stroke="currentColor" strokeOpacity="0.08" />
              <text x={left - 8} y={yFor(percent) + 3} textAnchor="end" fill="currentColor" fillOpacity="0.35" fontSize="9" className="font-mono">
                {percent}%
              </text>
            </g>
          ))}
          {MATCH_MARKET_SERIES.map((series) => {
            const count = series.points.length;
            const points = series.points.map((percent, index) => `${xFor(index, count)},${yFor(percent)}`).join(" ");
            const endX = xFor(count - 1, count);
            const endPercent = series.points[count - 1]!;
            return (
              <g key={series.label} className={series.muted ? "text-muted-foreground" : "text-foreground"}>
                <polyline
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeDasharray={series.dash ? "5 4" : undefined}
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                />
                <circle cx={endX} cy={yFor(endPercent)} r="3" fill="currentColor" />
                <text x={endX + 8} y={yFor(endPercent) + 3 + (series.labelDy ?? 0)} fill="currentColor" fontSize="10" className="font-mono">
                  {series.label} {endPercent}%
                </text>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 flex items-center justify-between font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
          <span>book opened</span>
          <span>now</span>
        </div>
      </CardContent>
    </Card>
  );
}

function OddsCell({ value, best }: { value: number | null; best: number }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-mono tabular-nums", value === best ? "font-semibold text-success" : "text-foreground")}>
      {value}¢
    </span>
  );
}

function VenueOddsCard({ homeName, awayName }: { homeName: string; awayName: string }) {
  const bestOf = (key: "home" | "draw" | "away") =>
    Math.min(...MATCH_VENUE_ODDS.flatMap((row) => (row.prices[key] === null ? [] : [row.prices[key]!])));
  const best = { home: bestOf("home"), draw: bestOf("draw"), away: bestOf("away") };
  return (
    <Card className="gap-0 bg-card/85 py-0">
      <PanelHeading index="BK" title="Venue books" aside="match winner" />
      <CardContent className="px-0 py-0">
        <div className="grid grid-cols-[minmax(7rem,1.4fr)_1fr_1fr_1fr] items-center gap-3 border-b border-border px-4 py-2.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
          <span>venue</span>
          <span className="text-right">{homeName}</span>
          <span className="text-right">draw</span>
          <span className="text-right">{awayName}</span>
        </div>
        {MATCH_VENUE_ODDS.map((row) => (
          <div
            key={row.venue}
            className="grid min-h-12 grid-cols-[minmax(7rem,1.4fr)_1fr_1fr_1fr] items-center gap-3 border-b border-border/60 px-4 py-2 last:border-0"
          >
            {row.icon ? (
              <Image
                src={row.icon}
                alt={row.venue}
                width={110}
                height={20}
                className={cn("h-4 w-auto max-w-full object-contain object-left", row.flatten && "brightness-0 invert")}
              />
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.12em]">{row.venue}</span>
            )}
            <span className="text-right"><OddsCell value={row.prices.home} best={best.home} /></span>
            <span className="text-right"><OddsCell value={row.prices.draw} best={best.draw} /></span>
            <span className="text-right"><OddsCell value={row.prices.away} best={best.away} /></span>
          </div>
        ))}
        <div className="px-4 py-2.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
          market books / best ask per outcome in green
        </div>
      </CardContent>
    </Card>
  );
}

function MatchDetailsCards({
  homeName,
  awayName,
  kickoffISO,
}: {
  homeName: string;
  awayName: string;
  kickoffISO: string | null;
}) {
  return (
    <div className="space-y-4">
      <StadiumPitch
        home={{ name: homeName, logo: null, color: TEAM_COLORS[homeName] ?? null }}
        away={{ name: awayName, logo: null, color: TEAM_COLORS[awayName] ?? null }}
        score={null}
        kickoffISO={kickoffISO}
        notStarted={true}
      />
      <Card className="gap-0 bg-card/85 py-0">
        <PanelHeading index="TL" title="Match timeline" aside="match events" />
        <CardContent className="px-4 pb-4 pt-8">
          <div className="relative mx-1 h-px bg-border">
            {TIMELINE_EVENTS.map((event) => (
              <div
                key={`${event.minute}-${event.label}`}
                title={`${event.minute}' ${event.label}`}
                className="absolute -top-[3px] size-[7px] -translate-x-1/2 border border-primary bg-primary"
                style={{ left: `${(event.minute / 95) * 100}%` }}
              />
            ))}
            {[0, 45, 90].map((minute) => (
              <span
                key={minute}
                className="absolute top-2 -translate-x-1/2 font-mono text-[0.625rem] text-muted-foreground"
                style={{ left: `${(minute / 95) * 100}%` }}
              >
                {minute}&apos;
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
            {TIMELINE_EVENTS.map((event) => (
              <span key={`${event.minute}-${event.label}-legend`}>
                <span className="text-foreground">{event.minute}&apos;</span> {event.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 bg-card/85 py-0">
        <PanelHeading index="ST" title="Match statistics" aside="63:00 snapshot" />
        <CardContent className="px-0 py-0">
          {MATCH_STATS.map((stat) => {
            const total = stat.home + stat.away;
            const homeShare = total === 0 ? 50 : (stat.home / total) * 100;
            return (
              <div key={stat.label} className="border-b border-border/60 px-4 py-2.5 last:border-0">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-mono font-semibold tabular-nums">{stat.home}{stat.suffix ?? ""}</span>
                  <span className="text-muted-foreground">{stat.label}</span>
                  <span className="font-mono font-semibold tabular-nums">{stat.away}{stat.suffix ?? ""}</span>
                </div>
                <div className="mt-1.5 flex h-0.5 overflow-hidden bg-border/50" aria-hidden="true">
                  <div className="bg-foreground" style={{ width: `${homeShare}%` }} />
                  <div className="bg-foreground/30" style={{ width: `${100 - homeShare}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

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

function playsLabel(action: string): string {
  return action.replaceAll("_", " ");
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

/* Header section tab: mono, full-height, primary underline when active.
 * Roadmap tabs render dimmed and inert until their surface exists. */
function HeaderTab({
  label,
  active = false,
  soon = false,
  onSelect,
}: {
  label: string;
  active?: boolean;
  soon?: boolean;
  onSelect?: () => void;
}) {
  if (soon) {
    return (
      <span
        title="Roadmap — not in the MVP build"
        className="flex cursor-not-allowed items-center gap-1.5 border-b-2 border-transparent px-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground/45"
      >
        {label}
        <span className="text-[0.5rem] tracking-[0.08em]">soon</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "border-b-2 px-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/* Collapsible desk panel: keeps secondary instruments one click away so the
 * running desk stays focused on tape, books, and the decision gate. */
function DeskDrawer({
  index,
  title,
  aside,
  defaultOpen = false,
  children,
}: {
  index: string;
  title: string;
  aside?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="gap-0 bg-card/85 py-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className={cn("flex items-center justify-between gap-3 px-4 py-3", open && "border-b border-border/70")}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.6875rem] text-primary">{index}</span>
            <h2 className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-foreground">{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {aside && <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">{aside}</span>}
            <ChevronDown aria-hidden="true" className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
        </div>
      </button>
      {open && children}
    </Card>
  );
}

/* Slim signature line for a compact card: the agent's trace without the full
 * telemetry tile. Stretched to fit; strokes stay crisp via non-scaling. */
function AgentTraceStrip({ agent }: { agent: AgentId }) {
  const telemetry = agentTelemetry[agent];
  return (
    <div className="border border-border/60 bg-background/40 px-2 py-1.5">
      <svg viewBox="0 0 160 88" preserveAspectRatio="none" aria-hidden="true" className="h-8 w-full text-foreground/75" fill="none">
        <path d="M8 20H152M8 44H152M8 68H152" stroke="currentColor" strokeOpacity="0.1" vectorEffect="non-scaling-stroke" />
        <path d={telemetry.trace} stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function TeamBadge({ team, align }: { team: BoardTeam; align: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", align === "right" && "items-end text-right")}>
      <Image src={team.flag} alt={`${team.name} flag`} width={48} height={32} className="h-8 w-12 border border-border object-cover" />
      <span className="truncate text-sm font-semibold">{team.name}</span>
    </div>
  );
}

function PriceBox({ label, percent }: { label?: string; percent: number }) {
  return (
    <div className="flex flex-col items-center gap-1 border border-border bg-background/60 px-2 py-2">
      <span className="whitespace-nowrap font-mono text-sm font-semibold uppercase tabular-nums">
        {label ? `${label} ` : ""}
        {percent}%
      </span>
      <span className="font-mono text-[0.625rem] tabular-nums text-muted-foreground">{bookMultiplier(percent)}</span>
    </div>
  );
}

/* One fixture on the board: flags, kickoff, and the synthetic three-way book.
 * Enterable only when the fixture has replay tapes behind it. */
function FixtureCard({
  fixture,
  replay,
  onOpen,
}: {
  fixture: BoardFixture;
  replay?: ReplayMatch;
  onOpen?: () => void;
}) {
  const enterable = Boolean(replay && onOpen);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <TeamBadge team={fixture.home} align="left" />
        <div className="flex flex-col items-center pt-0.5 text-center">
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">{fixture.kickoffDate}</span>
          <span className="font-mono text-lg font-semibold tabular-nums">{fixture.kickoffTime}</span>
        </div>
        <TeamBadge team={fixture.away} align="right" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <PriceBox percent={fixture.book.home} />
        <PriceBox label="draw" percent={fixture.book.draw} />
        <PriceBox percent={fixture.book.away} />
      </div>
      <div className="flex items-center justify-between gap-3 font-mono text-[0.625rem] uppercase tracking-[0.1em]">
        {enterable && replay ? (
          <>
            <span className="border border-success/35 bg-success/[0.045] px-1.5 py-0.5 text-[0.5625rem] tracking-[0.08em] text-success">
              live
            </span>
            <span className="text-muted-foreground">
              {replay.scenarios.length} strategies · {new Set(replay.scenarios.map((item) => item.defaultAgent)).size} agents
            </span>
            <span className="text-foreground">
              Open <span aria-hidden="true">↗</span>
            </span>
          </>
        ) : (
          <>
            <span className="border border-border bg-background/80 px-1.5 py-0.5 text-[0.5625rem] tracking-[0.08em] text-muted-foreground">
              soon
            </span>
            <span className="text-muted-foreground">awaiting TxLINE feed</span>
          </>
        )}
      </div>
    </>
  );
  const cardClass = "flex min-w-0 flex-col gap-3 border border-border bg-card/60 p-4";
  if (enterable) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(cardClass, "text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      >
        {body}
      </button>
    );
  }
  return <div className={cn(cardClass, "opacity-80")}>{body}</div>;
}

/* A settled fixture: final score in place of the book. Fixtures with a backtest
 * page link out to it; the rest stay inert. */
function PastFixtureCard({ fixture }: { fixture: PastFixture }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <TeamBadge team={fixture.home} align="left" />
        <div className="flex flex-col items-center pt-0.5 text-center">
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">{fixture.date}</span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {fixture.score.home} – {fixture.score.away}
          </span>
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
            full time{fixture.scoreNote ? ` · ${fixture.scoreNote}` : ""}
          </span>
        </div>
        <TeamBadge team={fixture.away} align="right" />
      </div>
      <div className="flex items-center justify-between gap-3 font-mono text-[0.625rem] uppercase tracking-[0.1em]">
        <span className="border border-border bg-background/80 px-1.5 py-0.5 text-[0.5625rem] tracking-[0.08em] text-muted-foreground">
          settled
        </span>
        {fixture.href ? (
          <span className="text-foreground">agent backtest ↗</span>
        ) : (
          <span className="text-muted-foreground">no active agents</span>
        )}
      </div>
    </>
  );
  if (fixture.href) {
    return (
      <Link
        href={fixture.href}
        aria-label={`${fixture.home.name} vs ${fixture.away.name} agent backtest`}
        className="flex min-w-0 flex-col gap-3 border border-border bg-card/40 p-4 transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex min-w-0 flex-col gap-3 border border-border bg-card/40 p-4 opacity-80">{body}</div>;
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
    return <p className="text-sm leading-6 text-muted-foreground">No orders have been submitted at this point.</p>;
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

/* RUN RELAY
 * Narrates the anatomy of every run as a four-stage handoff: signal (TxLINE
 * trigger) → scan (venue books) → gate (cost math) → evidence (simulated
 * result). Each cell derives from the same pipeline values the instruments
 * below render, so the relay can never disagree with them.
 */
type RelayTone = "idle" | "live" | "pass" | "warn" | "risk";

type RelayStage = { role: string; state: string; tone: RelayTone };

function relayToneClass(tone: RelayTone): string {
  switch (tone) {
    case "live":
      return "border-signal/40 bg-signal/8 text-signal";
    case "pass":
      return "border-success/40 bg-success/8 text-success";
    case "warn":
      return "border-warning/40 bg-warning/8 text-warning";
    case "risk":
      return "border-danger/45 bg-danger/8 text-danger";
    default:
      return "border-border bg-background/45 text-muted-foreground";
  }
}

function DeskRelay({ stages }: { stages: readonly RelayStage[] }) {
  return (
    <section aria-label="Run relay" className="mb-4 grid grid-cols-2 gap-2 md:flex md:items-center">
      {stages.map((stage, index) => (
        <Fragment key={stage.role}>
          {index > 0 && (
            <span aria-hidden="true" className="hidden shrink-0 font-mono text-xs text-muted-foreground md:block">
              →
            </span>
          )}
          <div className={cn("flex min-w-0 flex-1 items-center justify-between gap-3 border px-3 py-2", relayToneClass(stage.tone))}>
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em]">{stage.role}</span>
            <span className="truncate font-mono text-[0.6875rem] font-semibold uppercase tracking-wider">{stage.state}</span>
          </div>
        </Fragment>
      ))}
    </section>
  );
}

// "matches" is the home surface; "roster" is scoped inside the chosen match.
export type ConsoleView = "matches" | "roster" | "desk" | "controls";

export function TxBetConsole({ initialView = "matches" }: { initialView?: ConsoleView }) {
  const [view, setView] = useState<ConsoleView>(initialView);
  const [matchTab, setMatchTab] = useState<MatchTab>("market");
  const [selectedRailAgent, setSelectedRailAgent] = useState<AgentId>("red-card");
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
  // Match-hub header data: board entry for flags/kickoff, opening score tiles.
  const matchBoard = WORLD_CUP_BOARD.find((entry) => entry.id === scenario.fixture.id);
  // Tape scores use an en dash; accept both dash flavors.
  const scoreParts = (scenario.frames[0]?.score ?? "0-0").split(/[–-]/).map((part) => part.trim());
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

  // Agent dossier: projected P&L runs the real pipeline on the selected
  // agent's tape action frame under the CURRENT guardrails; history filters
  // the backtest windows owned by that agent. Everything stays synthetic.
  const railAgent = getAgent(selectedRailAgent);
  const railLine = AGENT_MARKET_LINES[selectedRailAgent];
  const railTape = AGENT_TAPES[selectedRailAgent];
  const railScenario = railTape ? getDemoScenario(railTape) : null;
  // Last actionable frame: the tape's decision moment (post-reprice books),
  // not the raw event frame where books have not moved yet.
  const railActionFrame = [...(railScenario?.frames ?? [])].reverse().find((item) => item.event && item.quotes.length > 0) ?? null;
  const railPipeline = railActionFrame
    ? runPipeline({
        agentId: selectedRailAgent,
        event: railActionFrame.event,
        quotes: railActionFrame.quotes,
        settings,
        now: railActionFrame.now,
      })
    : null;
  const railCandidate = railPipeline?.scan.candidate ?? null;
  const railRefusal =
    railPipeline && !railCandidate && railPipeline.trigger.active ? railPipeline.scan.reasons[0] ?? null : null;
  const railWindows = backtest.traces.filter((trace) => WINDOW_AGENT_BY_ID.get(trace.id) === selectedRailAgent);
  const railHistoryMicros = railWindows.reduce(
    (sum, trace) => sum + (trace.execution?.state === "MATCHED" ? trace.scan.candidate?.netProfitMicros ?? 0 : 0),
    0,
  );

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

  // Header navigation; leaving the desk pauses the tape (same as the back button).
  const selectView = (next: ConsoleView) => {
    if (next !== "desk") setPlaying(false);
    setView(next);
  };

  // Launch = arm this agent on its deterministic tape and start it right away.
  const launchAgent = (id: AgentId) => {
    const tape = AGENT_TAPES[id];
    if (!tape) return;
    const next = getDemoScenario(tape);
    setScenarioId(next.id);
    setAgentId(id);
    setStep(0);
    setPlaying(true);
    setView("desk");
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

  // Relay narration for the active tape frame; mirrors trigger/scan/gate state.
  const scanReached = pipeline.trigger.active;
  const booksOpen = frame.quotes.length > 0;
  const relayStages: readonly RelayStage[] = [
    {
      role: "signal",
      state: scanReached ? "event caught" : "watching",
      tone: scanReached ? "live" : "idle",
    },
    {
      role: "scan",
      state: !scanReached ? "idle" : booksOpen ? `${frame.quotes.length} books` : "requesting",
      tone: !scanReached ? "idle" : "live",
    },
    {
      role: "gate",
      state: candidate ? "pass" : scanReached && booksOpen ? "refused" : "waiting",
      tone: candidate ? "pass" : scanReached && booksOpen ? "warn" : "idle",
    },
    {
      role: "evidence",
      state: execution
        ? execution.state.toLowerCase()
        : candidate
          ? "ready"
          : scanReached && booksOpen
            ? "refusal logged"
            : "pending",
      tone: execution
        ? execution.state === "MATCHED"
          ? "pass"
          : "risk"
        : candidate
          ? "live"
          : scanReached && booksOpen
            ? "warn"
            : "idle",
    },
  ];

  return (
    <div className="relative isolate min-h-screen text-foreground">
      <ConsoleBackdrop />
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Back to txBet landing page" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <TxBetLockup compact />
          </Link>
          <nav aria-label="Console sections" className="hidden items-stretch self-stretch md:flex">
            <HeaderTab label="Matches" active={view === "matches" || view === "roster"} onSelect={() => selectView("matches")} />
            <HeaderTab label="Desk" active={view === "desk"} onSelect={() => selectView("desk")} />
            <HeaderTab label="Controls" active={view === "controls"} onSelect={() => selectView("controls")} />
            <HeaderTab label="Markets" soon />
            <HeaderTab label="Activity" soon />
          </nav>
          <AuthWalletControl />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
        {view === "matches" ? (
          <>
            <section className="mb-5 px-1 pt-1 sm:pt-2">
              <p className="mb-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-primary">
                World Cup
              </p>
              <h1 className="font-serif text-3xl font-normal leading-none tracking-[-0.03em] sm:text-4xl">
                Pick your agent. <span className="text-muted-foreground">It trades the match.</span>
              </h1>
            </section>

            <section aria-label="World Cup fixtures" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {WORLD_CUP_BOARD.map((fixture) => {
                const replay = REPLAY_MATCHES.find((match) => match.fixture.id === fixture.id);
                return (
                  <FixtureCard
                    key={fixture.id}
                    fixture={fixture}
                    replay={replay}
                    onOpen={replay ? () => { setMatchTab("market"); selectView("roster"); } : undefined}
                  />
                );
              })}
              {/* Honest placeholder: live fixtures list only once the feed is configured. */}
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed border-border p-4 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
                <span>live fixture slot</span>
                <span className="border border-border bg-background/80 px-1.5 py-0.5 text-[0.5625rem] tracking-[0.08em]">soon</span>
              </div>
            </section>

            <section aria-label="Past matches" className="mt-8">
              <p className="mb-2 px-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
                Past matches
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {PAST_WORLD_CUP.map((fixture) => (
                  <PastFixtureCard key={fixture.id} fixture={fixture} />
                ))}
              </div>
            </section>
          </>
        ) : view === "roster" ? (
          <>
            <section className="mb-5 px-1 pt-1 sm:pt-2">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => selectView("matches")}
                  className="rounded-md font-mono text-[0.6875rem] uppercase tracking-wider"
                >
                  <ArrowLeft data-icon="inline-start" /> Matches
                </Button>
                <span className="border border-border bg-card/60 px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
                  <span className="text-foreground">{scenario.fixture.home}</span>
                  <span aria-hidden="true"> v </span>
                  <span className="text-foreground">{scenario.fixture.away}</span>
                  <span> / live</span>
                </span>
              </div>
            </section>

            <section aria-label="Match summary" className="mb-4 border border-border bg-card/60 px-4 py-5">
              <div className="text-center font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
                {matchBoard ? `${matchBoard.kickoffDate} · ${matchBoard.kickoffTime} · ` : ""}agents ready
              </div>
              <div className="mt-4 flex items-start justify-center gap-8 sm:gap-14">
                <div className="flex w-24 flex-col items-center gap-2">
                  {matchBoard && (
                    <Image src={matchBoard.home.flag} alt={`${scenario.fixture.home} flag`} width={56} height={38} className="h-9 w-14 border border-border object-cover" />
                  )}
                  <span className="text-sm font-semibold">{scenario.fixture.home}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {scoreParts.map((part, index) => (
                    <span
                      key={index}
                      className="grid size-11 place-items-center border border-border bg-background/60 font-mono text-2xl font-semibold tabular-nums"
                    >
                      {part}
                    </span>
                  ))}
                </div>
                <div className="flex w-24 flex-col items-center gap-2">
                  {matchBoard && (
                    <Image src={matchBoard.away.flag} alt={`${scenario.fixture.away} flag`} width={56} height={38} className="h-9 w-14 border border-border object-cover" />
                  )}
                  <span className="text-sm font-semibold">{scenario.fixture.away}</span>
                </div>
              </div>
            </section>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              <div role="tablist" aria-label="Match sections" className="flex flex-wrap gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em]">
                {MATCH_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMatchTab(tab.id)}
                    aria-pressed={matchTab === tab.id}
                    className={cn(
                      "border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      matchTab === tab.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {matchTab === "market" && <MarketChartCard />}
              {matchTab === "odds" && <VenueOddsCard homeName={scenario.fixture.home} awayName={scenario.fixture.away} />}
              {matchTab === "details" && (
                <MatchDetailsCards
                  homeName={scenario.fixture.home}
                  awayName={scenario.fixture.away}
                  kickoffISO={matchBoard?.kickoffISO ?? null}
                />
              )}

              {/* Each agent market stands as its own card — no shared container. */}
              <div className="space-y-3 self-start">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[0.6875rem] text-primary">AG</span>
                    <h2 className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-foreground">
                      Agent markets
                    </h2>
                  </div>
                  <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
                    one agent per market
                  </span>
                </div>
                {AGENTS.map((agent) => {
                  const line = AGENT_MARKET_LINES[agent.id];
                  // Fixed display order: Polymarket first, then Kalshi.
                  const venues = (["Polymarket", "Kalshi"] as const).filter((venue) =>
                    line.outcomes.some((outcome) => outcome.venue === venue),
                  );
                  const ready = Boolean(AGENT_TAPES[agent.id]);
                  const selected = selectedRailAgent === agent.id;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedRailAgent(agent.id)}
                      aria-pressed={selected}
                      className={cn(
                        "block w-full border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected ? "border-primary/45 bg-primary/[0.05]" : "border-border bg-card/85 hover:bg-card",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <AgentGlyph agent={agent.id} className="size-3.5 shrink-0 text-primary" />
                          <span className="truncate font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.06em]">{agent.shortName}</span>
                          <span className="truncate text-[0.625rem] text-muted-foreground">/ {line.market}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {venues.map((venue) => (
                            <Image
                              key={venue}
                              src={AGENT_VENUE_MARKS[venue]}
                              alt={venue}
                              width={96}
                              height={16}
                              className="h-3.5 w-auto object-contain opacity-90"
                            />
                          ))}
                          <span
                            className={cn(
                              "border px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                              ready
                                ? "border-success/35 bg-success/[0.045] text-success"
                                : "border-border bg-background/80 text-muted-foreground",
                            )}
                          >
                            {ready ? "live" : "roadmap"}
                          </span>
                        </span>
                      </span>
                      <span className="block divide-y divide-border/40">
                        {line.outcomes.map((outcome) => (
                          <span key={outcome.label} className="flex items-center justify-between gap-3 px-3.5 py-2">
                            <span className="flex min-w-0 items-center gap-2 text-xs">
                              {outcome.flag ? (
                                <Image
                                  src={outcome.flag}
                                  alt=""
                                  width={20}
                                  height={14}
                                  className="h-3.5 w-5 shrink-0 border border-border/70 object-cover"
                                />
                              ) : null}
                              <span className="truncate">{outcome.label}</span>
                            </span>
                            <span
                              className={cn(
                                "min-w-14 shrink-0 border px-2.5 py-1 text-center font-mono text-xs tabular-nums",
                                ready && outcome.lead
                                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                                  : "border-border bg-background/70 text-foreground",
                              )}
                            >
                              {outcome.price}¢
                            </span>
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
                <div className="px-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
                  model asks / yes price per outcome
                </div>
              </div>
            </div>

              <aside aria-label="Agent detail" className="min-w-0 self-start border border-border bg-card/60 xl:sticky xl:top-24">
                <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="grid size-8 shrink-0 place-items-center border border-border bg-background/60">
                      <AgentGlyph agent={railAgent.id} className="size-4 text-primary" />
                    </div>
                    <span className="truncate font-mono text-xs font-semibold uppercase tracking-[0.06em]">{railAgent.shortName}</span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 border px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                      railTape
                        ? "border-success/35 bg-success/[0.045] text-success"
                        : "border-border bg-background/80 text-muted-foreground",
                    )}
                  >
                    {railTape ? "live" : "roadmap"}
                  </span>
                </div>
                <div className="space-y-3 px-4 py-4">
                  <AgentTraceStrip agent={railAgent.id} />
                  <p className="text-[0.6875rem] leading-4 text-muted-foreground">{railAgent.description}</p>
                  <div className="flex items-center justify-between gap-3 border border-border bg-background/45 px-3 py-2 font-mono text-[0.625rem] uppercase tracking-[0.1em]">
                    <span className="truncate text-muted-foreground">{railLine.market}</span>
                    <span className="shrink-0 tabular-nums text-foreground">
                      {railLine.outcomes.map((outcome) => `${outcome.label} ${outcome.price}¢`).join(" · ")}
                    </span>
                  </div>

                  <div>
                    <div className="mb-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
                      Projected P&L / current guardrails
                    </div>
                    {railCandidate ? (
                      <div className="border border-success/35 bg-success/[0.045] px-3 py-2.5">
                        <div className="font-mono text-lg font-semibold tabular-nums text-success">
                          +{formatUsd(railCandidate.netProfitMicros)}
                        </div>
                        <div className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
                          {formatBps(railCandidate.netReturnBps)} net · modeled on the {railScenario?.name} run
                        </div>
                      </div>
                    ) : railRefusal ? (
                      <div className="border border-warning/35 bg-warning/[0.045] px-3 py-2.5 text-[0.6875rem] leading-4 text-muted-foreground">
                        Refuses at these guardrails: {reasonCopy[railRefusal]}
                      </div>
                    ) : (
                      <div className="grid min-h-10 place-items-center border border-dashed border-border font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
                        strategy pending
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
                      Modeled P&L / strategy windows
                    </div>
                    {railWindows.length > 0 ? (
                      <div className="border border-border">
                        {railWindows.map((trace) => {
                          const outcome = trace.execution ? trace.execution.state : trace.scan.candidate ? "READY" : "NO TRADE";
                          const pnl =
                            trace.execution?.state === "MATCHED"
                              ? `+${formatUsd(trace.scan.candidate?.netProfitMicros ?? 0)}`
                              : trace.execution?.state === "UNHEDGED"
                                ? "exposed"
                                : "$0.00";
                          return (
                            <div
                              key={trace.id}
                              className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-[0.6875rem] last:border-b-0"
                            >
                              <span className="truncate text-muted-foreground">{trace.label}</span>
                              <span className="flex shrink-0 items-center gap-2 font-mono text-[0.625rem] uppercase">
                                <span
                                  className={cn(
                                    outcome === "MATCHED"
                                      ? "text-success"
                                      : outcome === "UNHEDGED"
                                        ? "text-danger"
                                        : "text-muted-foreground",
                                  )}
                                >
                                  {outcome.toLowerCase()}
                                </span>
                                <span className={cn("tabular-nums", trace.execution?.state === "MATCHED" ? "text-success" : "text-foreground")}>
                                  {pnl}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between gap-3 bg-background/45 px-3 py-2 font-mono text-[0.625rem] uppercase tracking-[0.1em]">
                          <span className="text-muted-foreground">locked total</span>
                          <span className={cn("tabular-nums", railHistoryMicros > 0 ? "text-success" : "text-foreground")}>
                            {railHistoryMicros > 0 ? "+" : ""}
                            {formatUsd(railHistoryMicros)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid min-h-10 place-items-center border border-dashed border-border font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
                        no strategy windows yet
                      </div>
                    )}
                    <p className="mt-1.5 text-[0.625rem] leading-4 text-muted-foreground">
                      Strategy-run evidence only; not a prediction of real returns.
                    </p>
                  </div>

                  {railTape ? (
                    <Button
                      type="button"
                      onClick={() => launchAgent(railAgent.id)}
                      className="h-10 w-full rounded-md font-mono text-xs font-semibold uppercase tracking-[0.12em]"
                    >
                      Start agent <span aria-hidden="true">↗</span>
                    </Button>
                  ) : (
                    <div className="grid h-10 place-items-center border border-dashed border-border font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
                      strategy pending
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </>
        ) : view === "controls" ? (
          <>
            <section className="mb-5 px-1 pt-1 sm:pt-2">
              <p className="mb-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-primary">
                Execution controls
              </p>
              <h1 className="font-serif text-3xl font-normal leading-none tracking-[-0.03em] sm:text-4xl">
                Live boundaries. <span className="text-muted-foreground">Fail closed by default.</span>
              </h1>
            </section>

            <Card className="gap-0 bg-card/85 py-0">
              <PanelHeading index="M1" title="MVP live boundaries" aside="read-only" />
              <CardContent className="grid gap-3 px-3 py-3 xl:grid-cols-3">
                <WorldCupLiveStatus />
                <PolymarketShadowStatus />
                <ExecutionControlPanel />
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <section className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border border-border bg-card/80 px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setPlaying(false); setView("roster"); }}
                className="rounded-md font-mono text-[0.6875rem] uppercase tracking-wider"
              >
                <ArrowLeft data-icon="inline-start" /> Agents
              </Button>
              <div className="flex min-w-0 items-center gap-2.5">
                <AgentGlyph agent={selectedAgent.id} className="size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold leading-5">{selectedAgent.name}</div>
                  <div className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
                    plays / {selectedAgent.eventTypes.map(playsLabel).join(" · ")}
                  </div>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
                <span className="hidden sm:inline">{scenario.name}</span>
                <span className="border border-border bg-background/60 px-3 py-1.5 tabular-nums text-foreground">
                  {scenario.fixture.home} {frame.score} {scenario.fixture.away} · {frame.clock}
                </span>
              </div>
            </section>

            <DeskRelay stages={relayStages} />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-4">
                <Card className="gap-0 bg-card/85 py-0">
                  <PanelHeading index="01" title="TxLINE action feed" aside={`${step + 1} / ${scenario.frames.length}`} />
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
                  <PanelHeading index="02" title="Cross-venue matrix" aside={`${frame.quotes.length} books`} />
                  <CardContent className="px-0 py-0"><VenueMatrix frame={frame} /></CardContent>
                </Card>

                <Card className="gap-0 bg-card/85 py-0">
                  <PanelHeading index="03" title="Matched-position composer" aside="fixed $1 payout" />
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

                <DeskDrawer index="04" title="Operator settings" aside="execution">
                  <CardContent className="space-y-5 px-4 py-4">
                    <div>
                      <ControlLabel label="Strategy" />
                      <Select value={scenarioId} onValueChange={changeScenario}>
                        <SelectTrigger aria-label="Strategy" className="h-10 w-full border-border bg-background/60">
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
                        <div className="text-xs font-semibold">Automatic execution</div>
                        <div className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">off = scan only</div>
                      </div>
                      <Switch aria-label="Automatic execution" checked={automatic} onCheckedChange={setAutomatic} />
                    </div>
                  </CardContent>
                </DeskDrawer>

                <DeskDrawer index="05" title="Execution report + latency lab" aside={`${backtest.windows} windows`}>
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
                        <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">The bundle remains below payout after costs.</p>
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
                      Strategy-run evidence only. Modeled matched P&amp;L excludes the intentionally unhedged window and does not predict real-world returns.
                    </p>
                  </CardContent>
                </DeskDrawer>
              </div>

              <aside className="space-y-4">
                <Card className="gap-0 bg-card/85 py-0">
                  <PanelHeading index="06" title="Decision gate" aside={automatic ? "auto" : "scan only"} />
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
                          <p className="text-sm leading-6 text-muted-foreground">Settlement branches appear after a fully matched bundle.</p>
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
                    {scenario.disclosure}. In this run, modeled profit appears matched only after equal fills and compatible settlement rules.
                  </CardContent>
                </Card>
              </aside>
            </div>

            <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto mt-4 flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-2xl backdrop-blur-xl">
              <Button
                variant="outline"
                size="icon"
                title="Reset run"
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
                {playing ? "Pause run" : step >= scenario.frames.length - 1 ? "Restart run" : "Play run"}
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
          </>
        )}
      </main>
    </div>
  );
}
