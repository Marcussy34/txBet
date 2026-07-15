import { centsToMicros, dollarsToMicros, USD_MICROS } from "../core/money";
import type {
  AgentId,
  CanonicalContract,
  FeeModel,
  MarketFamily,
  SettlementSpec,
  TxLineEvent,
  VenueQuote,
} from "../core/types";
import type { SimulatedFillPlan } from "../core/executor";
import type { BacktestWindow } from "../core/backtest";

export type DemoScenarioId = "red-card-profit" | "corner-no-edge" | "penalty-partial";

export interface DemoFrame {
  id: string;
  label: string;
  now: number;
  clock: string;
  score: string;
  event: TxLineEvent | null;
  quotes: readonly VenueQuote[];
  execution?: SimulatedFillPlan | "matched";
  settlement?: boolean;
}

export interface DemoScenario {
  id: DemoScenarioId;
  name: string;
  subtitle: string;
  disclosure: string;
  fixture: { id: string; home: string; away: string };
  defaultAgent: AgentId;
  frames: readonly DemoFrame[];
}

const START = 1_800_000_000_000;
const FIXTURE = { id: "wc-demo-001", home: "Spain", away: "Argentina" } as const;
const fee: FeeModel = {
  kind: "flat-per-share",
  microsPerShare: 4_000,
  label: "$0.004 per filled share",
};

const qualificationSettlement: SettlementSpec = {
  fixtureId: FIXTURE.id,
  proposition: "argentina-qualifies",
  subject: "Argentina",
  period: "full-match",
  scope: "including-extra-time-and-penalties",
  line: null,
  resolutionRuleId: "official-fifa-match-result-v1",
  voidRuleId: "postponed-48h-refund-v1",
  closesAt: START + 90 * 60_000,
  payoutCurrency: "USD" as const,
  payoutMicros: USD_MICROS,
};

const totalGoalsSettlement: SettlementSpec = {
  ...qualificationSettlement,
  proposition: "match-total-over-2.5",
  subject: "Over 2.5 goals",
  period: "regulation-time",
  scope: "including-stoppage-time",
  line: "2.5",
  resolutionRuleId: "official-regulation-score-v1",
};

type DemoMarketFamily = Extract<MarketFamily, "qualification" | "total-goals">;

const demoMarkets: Record<DemoMarketFamily, {
  question: string;
  settlement: SettlementSpec;
}> = {
  qualification: {
    question: "Will Argentina qualify?",
    settlement: qualificationSettlement,
  },
  "total-goals": {
    question: "Will the match finish with over 2.5 goals?",
    settlement: totalGoalsSettlement,
  },
};

function contract(
  venueId: string,
  venueName: string,
  outcome: "YES" | "NO",
  family: DemoMarketFamily,
): CanonicalContract {
  const market = demoMarkets[family];
  return {
    contractId: `${venueId}:${market.settlement.proposition}:${outcome.toLowerCase()}`,
    venueId,
    venueName,
    title: `${market.question} — ${outcome}`,
    family,
    outcome,
    settlement: market.settlement,
  };
}

function quote(input: {
  venueId: string;
  venueName: string;
  outcome: "YES" | "NO";
  priceCents: number;
  depth?: number;
  updatedAt: number;
  updateState: VenueQuote["updateState"];
  status?: VenueQuote["status"];
  family?: DemoMarketFamily;
}): VenueQuote {
  return {
    contract: contract(input.venueId, input.venueName, input.outcome, input.family ?? "qualification"),
    asks: [{ priceMicros: centsToMicros(input.priceCents), quantity: input.depth ?? 140 }],
    feeModel: fee,
    status: input.status ?? "open",
    updatedAt: input.updatedAt,
    updateState: input.updateState,
  };
}

function event(
  id: string,
  action: TxLineEvent["action"],
  minute: number,
  description: string,
  extras: Partial<TxLineEvent> = {},
): TxLineEvent {
  return {
    id,
    fixtureId: FIXTURE.id,
    occurredAt: START + minute * 60_000,
    minute,
    action,
    description,
    confirmed: true,
    ...extras,
  };
}

const redCard = event(
  "evt-red-63",
  "red_card",
  63,
  "Spain defender shown a confirmed red card",
  { team: "Spain" },
);
const pressure = event(
  "evt-pressure-71",
  "pressure_window",
  71,
  "Argentina pressure window: 3 corners and 4 shots in 10 minutes",
  { metrics: { cornersLast10: 3, shotsLast10: 4, possessionPct: 68 } },
);
const penalty = event(
  "evt-penalty-78",
  "penalty_awarded",
  78,
  "Penalty awarded to Argentina; VAR check pending",
  { team: "Argentina" },
);

export const DEMO_SETTINGS = {
  allocatedCapitalMicros: dollarsToMicros(500),
  maxExposureMicros: dollarsToMicros(100),
  minNetReturnBps: 200,
  safetyBufferBps: 43,
  maxQuoteAgeMs: 5_000,
  approvedVenues: new Set(["northstar", "coast", "atlas"]),
} as const;

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: "red-card-profit",
    name: "Red card / matched bundle",
    subtitle: "A repricing gap survives fees, depth, and the safety buffer.",
    disclosure: "Synthetic TxLINE-format replay · simulated venue books · simulated IOC fills",
    fixture: FIXTURE,
    defaultAgent: "red-card",
    frames: [
      {
        id: "armed",
        label: "Agent armed",
        now: START + 63 * 60_000 - 1_000,
        clock: "62:58",
        score: "0–0",
        event: null,
        quotes: [
          quote({ venueId: "northstar", venueName: "Northstar", outcome: "YES", priceCents: 60, updatedAt: START + 63 * 60_000 - 1_400, updateState: "baseline" }),
          quote({ venueId: "coast", venueName: "Coast", outcome: "NO", priceCents: 43, updatedAt: START + 63 * 60_000 - 1_200, updateState: "baseline" }),
        ],
      },
      {
        id: "event",
        label: "TxLINE event",
        now: START + 63 * 60_000,
        clock: "63:00",
        score: "0–0",
        event: redCard,
        quotes: [
          quote({ venueId: "northstar", venueName: "Northstar", outcome: "YES", priceCents: 60, updatedAt: START + 63 * 60_000 - 900, updateState: "older-quote" }),
          quote({ venueId: "coast", venueName: "Coast", outcome: "NO", priceCents: 43, updatedAt: START + 63 * 60_000 - 700, updateState: "older-quote" }),
        ],
      },
      {
        id: "gap",
        label: "Gap detected",
        now: START + 63 * 60_000 + 800,
        clock: "63:01",
        score: "0–0",
        event: redCard,
        quotes: [
          quote({ venueId: "northstar", venueName: "Northstar", outcome: "YES", priceCents: 54, updatedAt: START + 63 * 60_000 + 760, updateState: "repriced" }),
          quote({ venueId: "coast", venueName: "Coast", outcome: "NO", priceCents: 40, depth: 100, updatedAt: START + 63 * 60_000 - 400, updateState: "older-quote" }),
        ],
        execution: "matched",
      },
      {
        id: "settlement",
        label: "Outcome proof",
        now: START + 63 * 60_000 + 2_000,
        clock: "63:02",
        score: "0–0",
        event: redCard,
        quotes: [
          quote({ venueId: "northstar", venueName: "Northstar", outcome: "YES", priceCents: 54, updatedAt: START + 63 * 60_000 + 760, updateState: "repriced" }),
          quote({ venueId: "coast", venueName: "Coast", outcome: "NO", priceCents: 40, depth: 100, updatedAt: START + 63 * 60_000 - 400, updateState: "older-quote" }),
        ],
        execution: "matched",
        settlement: true,
      },
    ],
  },
  {
    id: "corner-no-edge",
    name: "Corner pressure / no trade",
    subtitle: "The scan runs, but $0.72 + $0.34 is already above payout.",
    disclosure: "Synthetic TxLINE-format replay · simulated venue books · no execution",
    fixture: FIXTURE,
    defaultAgent: "corner-pressure",
    frames: [
      {
        id: "armed",
        label: "Pressure watch",
        now: START + 71 * 60_000 - 1_000,
        clock: "70:58",
        score: "0–0",
        event: null,
        quotes: [],
      },
      {
        id: "no-edge",
        label: "No edge",
        now: START + 71 * 60_000,
        clock: "71:00",
        score: "0–0",
        event: pressure,
        quotes: [
          quote({ venueId: "northstar", venueName: "Northstar", outcome: "YES", family: "total-goals", priceCents: 72, updatedAt: START + 71 * 60_000 - 100, updateState: "repriced" }),
          quote({ venueId: "atlas", venueName: "Atlas", outcome: "NO", family: "total-goals", priceCents: 34, updatedAt: START + 71 * 60_000 - 250, updateState: "older-quote" }),
        ],
      },
    ],
  },
  {
    id: "penalty-partial",
    name: "Penalty / partial-fill risk",
    subtitle: "One leg fills less than the other; txBet exposes the residual and trips the kill switch.",
    disclosure: "Synthetic TxLINE-format replay · intentionally partial simulated fill",
    fixture: FIXTURE,
    defaultAgent: "penalty-var",
    frames: [
      {
        id: "armed",
        label: "Penalty watch",
        now: START + 78 * 60_000 - 1_000,
        clock: "77:58",
        score: "0–0",
        event: null,
        quotes: [],
      },
      {
        id: "partial",
        label: "Leg risk exposed",
        now: START + 78 * 60_000,
        clock: "78:00",
        score: "0–0",
        event: penalty,
        quotes: [
          quote({ venueId: "northstar", venueName: "Northstar", outcome: "YES", family: "total-goals", priceCents: 58, depth: 100, updatedAt: START + 78 * 60_000 - 80, updateState: "repriced" }),
          quote({ venueId: "atlas", venueName: "Atlas", outcome: "NO", family: "total-goals", priceCents: 35, depth: 100, updatedAt: START + 78 * 60_000 - 120, updateState: "older-quote" }),
        ],
        execution: { yesQuantity: 100, noQuantity: 70 },
      },
    ],
  },
] as const;

export const LATENCY_RECHECK_FRAME: DemoFrame = {
  id: "latency-3s",
  label: "Three-second recheck",
  now: START + 63 * 60_000 + 3_000,
  clock: "63:03",
  score: "0–0",
  event: redCard,
  quotes: [
    quote({ venueId: "northstar", venueName: "Northstar", outcome: "YES", priceCents: 58, updatedAt: START + 63 * 60_000 + 2_950, updateState: "repriced" }),
    quote({ venueId: "coast", venueName: "Coast", outcome: "NO", priceCents: 43, depth: 100, updatedAt: START + 63 * 60_000 + 2_900, updateState: "repriced" }),
  ],
};

export const SYNTHETIC_BACKTEST_WINDOWS: readonly BacktestWindow[] = [
  {
    id: "red-card-fast",
    label: "Red card · fast route",
    latencyMs: 800,
    agentId: "red-card",
    event: redCard,
    quotes: DEMO_SCENARIOS[0]!.frames[2]!.quotes,
    now: DEMO_SCENARIOS[0]!.frames[2]!.now,
    execution: "matched",
  },
  {
    id: "red-card-delayed",
    label: "Red card · delayed route",
    latencyMs: 3_000,
    agentId: "red-card",
    event: redCard,
    quotes: LATENCY_RECHECK_FRAME.quotes,
    now: LATENCY_RECHECK_FRAME.now,
  },
  {
    id: "corner-no-edge",
    label: "Corner pressure · no edge",
    latencyMs: 650,
    agentId: "corner-pressure",
    event: pressure,
    quotes: DEMO_SCENARIOS[1]!.frames[1]!.quotes,
    now: DEMO_SCENARIOS[1]!.frames[1]!.now,
  },
  {
    id: "penalty-partial",
    label: "Penalty · partial fills",
    latencyMs: 900,
    agentId: "penalty-var",
    event: penalty,
    quotes: DEMO_SCENARIOS[2]!.frames[1]!.quotes,
    now: DEMO_SCENARIOS[2]!.frames[1]!.now,
    execution: { yesQuantity: 100, noQuantity: 70 },
  },
] as const;

export function getDemoScenario(id: DemoScenarioId): DemoScenario {
  const scenario = DEMO_SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`Unknown demo scenario ${id}`);
  return scenario;
}
