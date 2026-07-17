// Past-match backtest surface: real TxLINE events + real venue books replayed
// through the live pipeline, per-strategy $100 bankrolls, settled PnL.
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

import {
  ARG_SUI_FIXTURE,
  ARG_SUI_MOMENTUM_TRADES,
  ARG_SUI_WINDOWS,
} from "@/fixtures/matches/arg-sui-2026-07-11";
import {
  MATCH_BANKROLL_MICROS,
  runAgentMatchBacktest,
  type MatchAgentReport,
} from "@/core/match-backtest";
import { formatUsd } from "@/core/money";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const timeUtc = (ms: number) =>
  `${new Date(ms).toISOString().slice(11, 16)}Z`;

/* Refusal reason codes, humanized for the trace table. */
const REASON_COPY: Record<string, string> = {
  SUSPENDED_QUOTE: "books suspended during review",
  NO_APPROVED_QUOTES: "no pairable books in family",
  SAME_VENUE: "no cross-venue pair",
  NOT_COMPLEMENTARY: "no complementary side",
  SETTLEMENT_MISMATCH: "settlement identity mismatch",
  CAPITAL_LIMIT: "sizing above free capital",
  COMBINED_COST_GTE_PAYOUT: "no locked edge at these prices",
  MIN_RETURN_NOT_MET: "edge below the 2% floor",
  MARKET_CLOSED: "regulation books settled",
  QUOTE_STALE: "quote outside freshness window",
  INSUFFICIENT_LIQUIDITY: "equal depth unavailable",
};

function DeltaHeadline({ endingMicros }: { endingMicros: number }) {
  const delta = endingMicros - MATCH_BANKROLL_MICROS;
  const positive = delta > 0;
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-sm tabular-nums text-muted-foreground">$100.00</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span
        className={cn(
          "font-mono text-2xl font-semibold tabular-nums",
          positive ? "text-success" : "text-foreground",
        )}
      >
        {formatUsd(endingMicros)}
      </span>
      {positive ? (
        <span className="font-mono text-xs font-semibold tabular-nums text-success">
          +{formatUsd(delta)} · +{((delta / MATCH_BANKROLL_MICROS) * 100).toFixed(1)}%
        </span>
      ) : delta < 0 ? (
        <span className="font-mono text-xs font-semibold tabular-nums text-destructive">
          −{formatUsd(-delta)} · −{((-delta / MATCH_BANKROLL_MICROS) * 100).toFixed(1)}%
        </span>
      ) : (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">capital preserved</span>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function AgentCard({ report }: { report: MatchAgentReport }) {
  return (
    <article className="flex flex-col gap-4 border border-border bg-card/30 p-4">
      <header className="flex flex-col gap-1">
        <h3 className="font-mono text-sm font-semibold uppercase tracking-wide">{report.agent.name}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{report.agent.description}</p>
      </header>
      <DeltaHeadline endingMicros={report.endingCapitalMicros} />
      <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        <StatCell label="windows" value={String(report.windowsScanned)} />
        <StatCell label="executed" value={String(report.trades.length)} />
        <StatCell label="deployed" value={formatUsd(report.deployedMicros)} />
      </div>
      {report.refusals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.refusals.map((refusal) => (
            <span
              key={refusal.windowId}
              className="inline-flex items-center gap-1 border border-border bg-background px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wide text-muted-foreground"
            >
              <ShieldCheck className="h-3 w-3 text-success/80" aria-hidden />
              capital protected · {timeUtc(refusal.at)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export function MatchBacktestView() {
  // Momentum entries share each agent's $100 bankroll with its complement scans.
  const reports = runAgentMatchBacktest(ARG_SUI_WINDOWS, ARG_SUI_MOMENTUM_TRADES);
  const sorted = [...reports].sort(
    (a, b) => b.settledPnlMicros - a.settledPnlMicros || b.trades.length - a.trades.length,
  );

  const strategies = reports.length;
  const allocatedMicros = strategies * MATCH_BANKROLL_MICROS;
  const settledMicros = reports.reduce((sum, report) => sum + report.settledPnlMicros, 0);

  const executedRows = reports
    .flatMap((report) => [
      ...report.positions.map((position) => ({
        key: position.id,
        at: position.enteredAt,
        strategy: report.agent.name,
        position: `${position.title} — YES`,
        venues: "Kalshi",
        contracts: position.contracts,
        costMicros: position.costMicros,
        pnlMicros: position.pnlMicros,
        note: position.signal,
      })),
      ...report.trades.map((trade) => ({
        key: trade.windowId,
        at: trade.at,
        strategy: report.agent.name,
        position: trade.proposition.replace(/-/g, " "),
        venues: `YES ${trade.yesVenue} / NO ${trade.noVenue}`,
        contracts: trade.contracts,
        costMicros: trade.costMicros,
        pnlMicros: trade.lockedProfitMicros,
        note: "exact complement — payout locked at entry",
      })),
    ])
    .sort((a, b) => a.at - b.at);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 lg:px-8">
      {/* header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
            Past match · agent performance
          </span>
          <span className="border border-border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
            Backtest
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
              {ARG_SUI_FIXTURE.home} vs {ARG_SUI_FIXTURE.away}
            </h1>
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {ARG_SUI_FIXTURE.competition} · {ARG_SUI_FIXTURE.kickoffUtc.slice(0, 10)} · FT{" "}
              {ARG_SUI_FIXTURE.finalScore} · REG {ARG_SUI_FIXTURE.regulationScore}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {strategies} strategies · {formatUsd(allocatedMicros, 0)} allocated
            </span>
            <span className="font-mono text-2xl font-semibold tabular-nums text-success">
              +{formatUsd(settledMicros)} settled
            </span>
          </div>
        </div>
        {/* match picker rail */}
        <nav className="flex flex-wrap items-center gap-2 border-y border-border py-2">
          <span className="border border-foreground/40 bg-card px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wide">
            ARG–SUI · Quarterfinal · Jul 11
          </span>
          <Link
            href="/console"
            className="border border-border px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            Spain vs Argentina · live tape
          </Link>
          <span className="px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wide text-muted-foreground/50">
            Full knockout catalog · M2
          </span>
        </nav>
      </header>

      {/* timeline */}
      <section aria-label="Match timeline" className="flex flex-col gap-3">
        <h2 className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
          Official TxLINE timeline
        </h2>
        {/* Themed ScrollArea instead of overflow-x-auto: the native scrollbar
         * clashes with the dark theme. pb-2.5 clears the overlaid thumb. */}
        <ScrollArea orientation="horizontal" className="w-full">
          <ol className="flex w-max gap-2 pb-2.5">
            {ARG_SUI_FIXTURE.timeline.map((entry) => (
              <li
                key={`${entry.at}-${entry.label}`}
                className="flex shrink-0 flex-col gap-0.5 border border-border bg-card/30 px-2.5 py-1.5"
              >
                <span className="font-mono text-[0.625rem] tabular-nums text-muted-foreground">{timeUtc(entry.at)}</span>
                <span className="whitespace-nowrap font-mono text-xs">{entry.label}</span>
              </li>
            ))}
          </ol>
        </ScrollArea>
      </section>

      {/* strategy results */}
      <section aria-label="Strategy results" className="flex flex-col gap-3">
        <h2 className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
          Strategy results · $100 per agent
        </h2>
        {/* agent grid */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((report) => (
            <AgentCard key={report.agent.id} report={report} />
          ))}
        </div>
      </section>

      {/* executed positions */}
      <section aria-label="Executed positions" className="flex flex-col gap-3">
        <h2 className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
          Executed positions
        </h2>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-border font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">time</th>
                <th className="px-3 py-2 font-medium">strategy</th>
                <th className="px-3 py-2 font-medium">position</th>
                <th className="px-3 py-2 font-medium">venues</th>
                <th className="px-3 py-2 text-right font-medium">contracts</th>
                <th className="px-3 py-2 text-right font-medium">cost</th>
                <th className="px-3 py-2 text-right font-medium">settled pnl</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {executedRows.map((row) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{timeUtc(row.at)}</td>
                  <td className="px-3 py-2">{row.strategy}</td>
                  <td className="px-3 py-2">{row.position}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.venues}</td>
                  <td className="px-3 py-2 text-right">{row.contracts}</td>
                  <td className="px-3 py-2 text-right">{formatUsd(row.costMicros)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-semibold",
                      row.pnlMicros >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {row.pnlMicros >= 0 ? "+" : "−"}
                    {formatUsd(Math.abs(row.pnlMicros))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* scan trace */}
      <section aria-label="Scan trace" className="flex flex-col gap-3">
        <details className="border border-border">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
            Full scan trace · every window, every gate
          </summary>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[640px] text-left text-xs">
              <tbody className="font-mono">
                {reports.flatMap((report) =>
                  [...report.trades.map((trade) => (
                    <tr key={trade.windowId} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{timeUtc(trade.at)}</td>
                      <td className="px-3 py-2">{report.agent.shortName}</td>
                      <td className="px-3 py-2">{trade.label}</td>
                      <td className="px-3 py-2 font-semibold text-success">
                        MATCHED · {trade.contracts}x · +{formatUsd(trade.lockedProfitMicros)}
                      </td>
                    </tr>
                  )),
                  ...report.refusals.map((refusal) => (
                    <tr key={`${report.agent.id}-${refusal.windowId}`} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{timeUtc(refusal.at)}</td>
                      <td className="px-3 py-2">{report.agent.shortName}</td>
                      <td className="px-3 py-2">{refusal.label}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {refusal.triggerReason ??
                          refusal.reasons.map((reason) => REASON_COPY[reason] ?? reason).join(" · ")}
                      </td>
                    </tr>
                  ))],
                )}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      {/* methodology */}
      <footer className="border-t border-border pt-4">
        <p className="max-w-4xl font-mono text-[0.625rem] leading-relaxed text-muted-foreground">
          BACKTEST · Replayed from public data captured 2026-07-17: TxLINE fixture 18222446 (mainnet level-12
          World Cup feed), Kalshi 1-minute candlesticks, Polymarket 1-minute price history. Fills: Kalshi at the
          shock-window volume-weighted mean, Polymarket at the printed mid; fees at published venue schedules
          (Kalshi 7% × p(1−p); Polymarket worst-case curve). Momentum rule fixed ex-ante: event-triggered entries
          at the printed ask, 25% of free capital per signal, hold to settlement. Complements lock payout at
          entry; positions settle against the official result. Simulated executions — no live orders.
        </p>
      </footer>
    </main>
  );
}
