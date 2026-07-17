"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";

import { AddressRow, DepositMenu } from "@/components/auth/account-menu";
import { AuthWalletControl, summarizeEmbeddedWallets } from "@/components/auth/privy-auth";
import { TxBetLockup } from "@/components/brand/txbet-brand";
import { Card, CardContent } from "@/components/ui/card";
import { runBacktest } from "@/core/backtest";
import { dollarsToMicros, formatBps, formatUsd } from "@/core/money";
import { SYNTHETIC_BACKTEST_WINDOWS } from "@/fixtures/demo-tapes";
import { cn } from "@/lib/utils";

/* OPERATOR PORTFOLIO
 * Adapted from the predictefy portfolio, scoped to what txBet actually does
 * today: live cash/positions stay honest (adapters not live, no live orders),
 * while the P&L showcase comes from the deterministic synthetic replay.
 */

// Same operator defaults as the console desk controls.
const PORTFOLIO_SETTINGS = {
  allocatedCapitalMicros: dollarsToMicros(500),
  maxExposureMicros: dollarsToMicros(100),
  minNetReturnBps: 200,
  safetyBufferBps: 43,
  maxQuoteAgeMs: 5_000,
  approvedVenues: new Set(["northstar", "coast", "atlas"]),
};

const BACKTEST = runBacktest(SYNTHETIC_BACKTEST_WINDOWS, PORTFOLIO_SETTINGS);

// Cumulative modeled P&L per replay window, mirroring runBacktest's accounting.
type PnlPoint = {
  id: string;
  label: string;
  cumulativeMicros: number;
  state: "MATCHED" | "UNHEDGED" | "UNFILLED" | "INVALID" | "NO_TRADE";
};

const PNL_POINTS: readonly PnlPoint[] = (() => {
  let cumulative = 0;
  return BACKTEST.traces.map((trace) => {
    const candidate = trace.scan.candidate;
    if (trace.execution?.state === "MATCHED" && candidate) {
      cumulative += Math.round(
        candidate.netProfitMicros * (trace.execution.matchedQuantity / candidate.quantity),
      );
    }
    return {
      id: trace.id,
      label: trace.label,
      cumulativeMicros: cumulative,
      state: trace.execution?.state ?? "NO_TRADE",
    };
  });
})();

function SectionHeading({ index, title, aside }: { index: string; title: string; aside?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[0.6875rem] text-primary">{index}</span>
        <h2 className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-foreground">{title}</h2>
      </div>
      {aside && <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">{aside}</span>}
    </div>
  );
}

function StatTile({ label, value, tone = "text-foreground", note }: {
  label: string;
  value: string;
  tone?: string;
  note?: string;
}) {
  return (
    <div className="border border-border bg-background/50 px-3 py-2.5">
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-sm tabular-nums", tone)}>{value}</p>
      {note && <p className="mt-1 text-[0.625rem] leading-4 text-muted-foreground">{note}</p>}
    </div>
  );
}

/* Cumulative replay P&L as one crisp trace, in the roster-strip style. Window
 * dots stay honest: matched green, unhedged red, no-trade muted. */
function ReplayPnlChart() {
  const width = 600;
  const height = 150;
  const padX = 10;
  const padY = 16;
  const maxMicros = Math.max(...PNL_POINTS.map((point) => point.cumulativeMicros), 1);
  const stepX = (width - padX * 2) / Math.max(PNL_POINTS.length - 1, 1);
  const y = (micros: number) => height - padY - (micros / maxMicros) * (height - padY * 2);
  const coords = PNL_POINTS.map((point, index) => ({
    ...point,
    x: padX + index * stepX,
    y: y(point.cumulativeMicros),
  }));
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");

  return (
    <div className="border border-border/60 bg-background/40 px-2 py-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Cumulative modeled replay P&L across ${PNL_POINTS.length} windows, ending at ${formatUsd(BACKTEST.lockedProfitMicros)}`}
        className="h-36 w-full text-foreground/80"
        fill="none"
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <path
            key={fraction}
            d={`M${padX} ${padY + fraction * (height - padY * 2)}H${width - padX}`}
            stroke="currentColor"
            strokeOpacity="0.08"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Zero baseline */}
        <path d={`M${padX} ${y(0)}H${width - padX}`} stroke="currentColor" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" />
        <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
        {coords.map((point) => (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r="3"
            className={cn(
              point.state === "MATCHED" && "fill-success",
              point.state === "UNHEDGED" && "fill-danger",
              (point.state === "NO_TRADE" || point.state === "UNFILLED" || point.state === "INVALID") &&
                "fill-muted-foreground/60",
            )}
          >
            <title>{`${point.label} · ${point.state.replaceAll("_", " ").toLowerCase()} · ${formatUsd(point.cumulativeMicros)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex items-center justify-between px-1 pt-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
        <span>window 01</span>
        <span>window {String(PNL_POINTS.length).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

/* Roadmap action chips beside the working deposit picker. */
function SoonAction({ label }: { label: string }) {
  return (
    <span
      title="Roadmap — not in the MVP build"
      className="flex h-8 cursor-not-allowed items-center gap-1.5 border border-border/60 bg-background/40 px-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground/45"
    >
      {label}
      <span className="text-[0.5rem] tracking-[0.08em]">soon</span>
    </span>
  );
}

export function TxBetPortfolio() {
  const { user } = usePrivy();
  const email = user?.google?.email ?? user?.email?.address ?? null;
  const trimmedEmail = email?.trim() ?? "";
  const initial = trimmedEmail.charAt(0).toUpperCase();
  const wallets = summarizeEmbeddedWallets(user?.linkedAccounts ?? []);
  const hitRate = BACKTEST.windows > 0 ? Math.round((BACKTEST.matchedCount / BACKTEST.windows) * 100) : 0;

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Back to txBet landing page" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <TxBetLockup compact />
            </Link>
            <Link
              href="/console"
              className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft aria-hidden="true" className="size-3" /> Console
            </Link>
          </div>
          <AuthWalletControl />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
        <section className="mb-5 px-1 pt-1 sm:pt-2">
          <p className="mb-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-primary">
            Operator portfolio
          </p>
          <h1 className="font-serif text-3xl font-normal leading-none tracking-[-0.03em] sm:text-4xl">
            Your book. <span className="text-muted-foreground">Replay-proven, live-safe.</span>
          </h1>
        </section>

        {/* Identity + honest live figures. */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card className="gap-0 bg-card/85 py-0">
            <SectionHeading index="P0" title="Identity" aside="privy embedded" />
            <CardContent className="px-4 py-4">
              <div className="flex flex-wrap items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 font-mono text-base">
                  {initial !== "" ? initial : "·"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{trimmedEmail !== "" ? trimmedEmail : "Signed in"}</p>
                  {wallets.status === "ready" ? (
                    <div className="mt-2 flex max-w-64 flex-col gap-1.5">
                      <AddressRow chain="EVM" address={wallets.ethereumAddress} />
                      <AddressRow chain="SOL" address={wallets.solanaAddress} />
                    </div>
                  ) : (
                    <p className="mt-2 font-mono text-[0.625rem] uppercase text-warning">
                      {wallets.status === "pending" ? "Creating embedded wallets" : "Wallet identity ambiguous"}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <DepositMenu wallets={wallets} />
                <SoonAction label="Withdraw" />
                <SoonAction label="Export wallet" />
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 bg-card/85 py-0">
            <SectionHeading index="P1" title="Live book" aside="fail-closed" />
            <CardContent className="grid gap-2 px-3 py-3 sm:grid-cols-2">
              <StatTile
                label="Live positions value"
                value="$0.00"
                note="No live orders leave the MVP build."
              />
              <StatTile
                label="Cash balance"
                value="—"
                note="Loads once venue balance adapters are live."
              />
            </CardContent>
          </Card>
        </div>

        {/* The performance we can actually prove: deterministic replay. */}
        <Card className="mt-3 gap-0 bg-card/85 py-0">
          <SectionHeading
            index="P2"
            title="Synthetic replay P&L"
            aside={`${BACKTEST.windows} windows · simulated`}
          />
          <CardContent className="grid gap-3 px-3 py-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ReplayPnlChart />
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Modeled matched P&L" value={formatUsd(BACKTEST.lockedProfitMicros)} tone="text-success" />
              <StatTile label="Locked return" value={formatBps(BACKTEST.lockedReturnBps)} tone="text-success" />
              <StatTile label="Matched bundles" value={`${BACKTEST.matchedCount} / ${BACKTEST.windows}`} note={`${hitRate}% of replay windows`} />
              <StatTile label="Capital matched" value={formatUsd(BACKTEST.matchedCapitalMicros)} />
              <StatTile label="No-trade windows" value={String(BACKTEST.noTradeCount)} />
              <StatTile label="Unhedged alerts" value={String(BACKTEST.unhedgedCount)} tone="text-danger" />
            </div>
          </CardContent>
          <p className="border-t border-border/70 px-4 py-2.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
            Synthetic replay evidence only — modeled figures do not predict real-world returns.
          </p>
        </Card>

        {/* Live positions: empty until real execution exists, and says so. */}
        <Card className="mt-3 gap-0 bg-card/85 py-0">
          <SectionHeading index="P3" title="Live positions" aside="0 open" />
          <CardContent className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8 text-muted-foreground/50" fill="currentColor">
              <rect x="4" y="12" width="4" height="8" />
              <rect x="10" y="7" width="4" height="13" />
              <rect x="16" y="10" width="4" height="10" />
            </svg>
            <p className="text-sm font-medium">No live positions</p>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              Execution stays simulated in the MVP — replay fills never leave the desk. Launch an
              agent to watch the full decision pipeline run.
            </p>
            <Link
              href="/console"
              className="mt-1 flex h-9 items-center border border-border bg-card px-4 font-mono text-[0.6875rem] uppercase tracking-[0.12em] transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open the console
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
