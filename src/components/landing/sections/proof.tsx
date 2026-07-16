"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useInView, useReducedMotion } from "motion/react";

import { MicroLabel, Reveal } from "@/components/landing/shared";
import { cn } from "@/lib/utils";

export const decisionGates = [
  "Qualifying match action",
  "Same fixture and market family",
  "Exact settlement fingerprint",
  "Equal executable depth",
  "After-cost bundle below payout",
  "Minimum modeled return cleared",
] as const;

type GateState = "pass" | "fail" | "skipped";
type WindowId = "w1" | "w2" | "w3" | "w4";
type Outcome = "matched" | "no-trade" | "unhedged";

type ProofWindow = {
  id: WindowId;
  label: string;
  outcome: Outcome;
  gates: readonly {
    state: GateState;
    reason?: string;
  }[];
  report:
    | {
        kind: "matched";
        pnl: 4.8;
        route: "800 ms route";
        state: "captured";
        capture: 5.03;
      }
    | {
        kind: "no-trade";
        route: string;
        state: string;
        value: "No trade";
        reason: string;
      }
    | {
        kind: "unhedged";
        route: "UNHEDGED / one leg filled";
        value: "-$0.40";
        reason: "second leg missed inside the window";
      };
};

const proofWindows = [
  {
    id: "w1",
    label: "W1 MATCHED",
    outcome: "matched",
    gates: decisionGates.map(() => ({ state: "pass" as const })),
    report: {
      kind: "matched",
      pnl: 4.8,
      route: "800 ms route",
      state: "captured",
      capture: 5.03,
    },
  },
  {
    id: "w2",
    label: "W2 NO TRADE",
    outcome: "no-trade",
    gates: [
      { state: "pass" },
      { state: "pass" },
      { state: "pass" },
      { state: "pass" },
      { state: "fail", reason: "after-cost bundle above payout" },
      { state: "skipped" },
    ],
    report: {
      kind: "no-trade",
      route: "3,000 ms route",
      state: "missed",
      value: "No trade",
      reason: "The after-cost pair is no longer below payout.",
    },
  },
  {
    id: "w3",
    label: "W3 NO TRADE",
    outcome: "no-trade",
    gates: [
      { state: "pass" },
      { state: "pass" },
      { state: "pass" },
      { state: "fail", reason: "equal executable depth unavailable" },
      { state: "skipped" },
      { state: "skipped" },
    ],
    report: {
      kind: "no-trade",
      route: "Equal executable depth",
      state: "unavailable",
      value: "No trade",
      reason: "equal executable depth unavailable",
    },
  },
  {
    id: "w4",
    label: "W4 UNHEDGED",
    outcome: "unhedged",
    gates: decisionGates.map(() => ({ state: "pass" as const })),
    report: {
      kind: "unhedged",
      route: "UNHEDGED / one leg filled",
      value: "-$0.40",
      reason: "second leg missed inside the window",
    },
  },
] as const satisfies readonly ProofWindow[];

const outcomeTiles = [
  { outcome: "matched", label: "matched", value: "1" },
  { outcome: "no-trade", label: "no trade", value: "2" },
  { outcome: "unhedged", label: "unhedged", value: "1" },
] as const;

const outcomeHighlight = {
  matched: "border-success/45 bg-success/[0.045] text-success",
  "no-trade": "border-warning/45 bg-warning/[0.045] text-warning",
  unhedged: "border-danger/45 bg-danger/[0.045] text-danger",
} as const;

export function ProofSection() {
  const reduceMotion = useReducedMotion();
  const reportRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasCounted = useRef(false);
  const isInView = useInView(reportRef, { once: true, amount: 0.25 });
  const [activeWindowId, setActiveWindowId] = useState<WindowId>("w1");
  const [resolvedWindowId, setResolvedWindowId] = useState<WindowId>("w1");
  const [countProgress, setCountProgress] = useState(1);

  const activeWindow = proofWindows.find((window) => window.id === activeWindowId) ?? proofWindows[0];
  const contentResolved = activeWindowId === resolvedWindowId;

  // Report tiles resolve with the same 40ms cascade as the gate checklist.
  const tileClass = cn(
    "opacity-100 motion-safe:translate-y-0 motion-safe:transition-[opacity,transform] motion-safe:duration-150",
    !contentResolved && "motion-safe:translate-y-1 motion-safe:opacity-0",
  );
  const tileDelay = (index: number) => ({ transitionDelay: `${index * 40}ms` });

  useEffect(() => {
    if (contentResolved) return;

    // Resolve the new evidence after it has rendered in its reset state.
    const frame = window.requestAnimationFrame(() => setResolvedWindowId(activeWindowId));
    return () => window.cancelAnimationFrame(frame);
  }, [activeWindowId, contentResolved]);

  useEffect(() => {
    if (!isInView || hasCounted.current) return;
    hasCounted.current = true;

    // Reduced-motion users keep the complete server-rendered values.
    if (reduceMotion) return;

    const duration = 560;
    let frame = 0;
    let startedAt: number | undefined;

    const count = (time: number) => {
      startedAt ??= time;
      const elapsed = Math.min((time - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setCountProgress(eased);

      if (elapsed < 1) frame = window.requestAnimationFrame(count);
    };

    frame = window.requestAnimationFrame(count);
    return () => window.cancelAnimationFrame(frame);
  }, [isInView, reduceMotion]);

  const selectWindow = (windowId: WindowId) => {
    if (windowId !== activeWindowId) setActiveWindowId(windowId);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % proofWindows.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + proofWindows.length) % proofWindows.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = proofWindows.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextWindow = proofWindows[nextIndex];
    selectWindow(nextWindow.id);
    tabRefs.current[nextIndex]?.focus();
  };

  const matchedReport = proofWindows[0].report;
  const matchedPnl = `$${(matchedReport.pnl * countProgress).toFixed(2)}`;
  const capturedReturn = `${(matchedReport.capture * countProgress).toFixed(2)}%`;

  return (
    <section id="proof" className="border-b border-border bg-card/25 py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1500px] gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <Reveal className="min-w-0">
          <MicroLabel className="text-success">04 / decision evidence</MicroLabel>
          <h2 className="mt-5 font-serif text-[clamp(4.5rem,8.5vw,8.7rem)] font-normal leading-[0.82] tracking-[-0.05em]">
            No edge.
            <span className="block text-muted-foreground">No trade.</span>
          </h2>
          <p className="mt-8 max-w-lg text-sm leading-7 text-muted-foreground">
            txBet is valuable when it refuses. Every blocked state is visible, attributable, and replayable.
          </p>
          <div className="mt-10 border border-border bg-background/80">
            {decisionGates.map((gate, index) => {
              const result = activeWindow.gates[index];
              const reason = "reason" in result ? result.reason : undefined;

              return (
                <div
                  key={`${activeWindow.id}-${gate}`}
                  style={{ transitionDelay: `${index * 40}ms` }}
                  className={cn(
                    "flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 py-3 opacity-100 last:border-0 motion-safe:translate-y-0 motion-safe:transition-[opacity,transform] motion-safe:duration-150",
                    !contentResolved && "motion-safe:translate-y-1 motion-safe:opacity-0",
                    result.state === "fail" && "bg-warning/[0.045]",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="pt-0.5 font-mono text-[0.6875rem] tabular-nums text-muted-foreground">0{index + 1}</span>
                    <div className="min-w-0">
                      <div className={cn("text-xs text-muted-foreground", result.state === "fail" && "text-warning")}>{gate}</div>
                      {reason ? <p className="mt-1 text-[0.6875rem] leading-4 text-muted-foreground">{reason}</p> : null}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[0.6875rem] uppercase tracking-wider",
                      result.state === "pass" && "text-success",
                      result.state === "fail" && "text-warning",
                      result.state === "skipped" && "text-muted-foreground",
                    )}
                  >
                    {result.state === "skipped" ? "—" : result.state}
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal className="min-w-0 lg:pt-12">
          <div ref={reportRef}>
            <div className="mb-3 overflow-x-auto">
              <div role="tablist" aria-label="Decision evidence windows" className="flex min-w-full w-max border border-border bg-background p-1">
                {proofWindows.map((window, index) => {
                  const selected = window.id === activeWindowId;

                  return (
                    <button
                      key={window.id}
                      ref={(node) => { tabRefs.current[index] = node; }}
                      id={`proof-tab-${window.id}`}
                      type="button"
                      role="tab"
                      tabIndex={selected ? 0 : -1}
                      aria-selected={selected}
                      aria-controls="proof-window-panel"
                      onClick={() => selectWindow(window.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, index)}
                      className={cn(
                        "h-11 shrink-0 rounded-sm border border-transparent px-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:flex-1",
                        selected && "border-border bg-card text-foreground",
                      )}
                    >
                      {window.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border border-border bg-background">
              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <MicroLabel>Synthetic replay report</MicroLabel>
                  <div className="mt-2 text-sm font-semibold">Four deterministic windows</div>
                </div>
                <span className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">demo evidence</span>
              </div>

              <div className="grid grid-cols-3 gap-px bg-border">
                {outcomeTiles.map((tile) => {
                  const highlighted = tile.outcome === activeWindow.outcome;

                  return (
                    <div
                      key={tile.outcome}
                      className={cn(
                        "border border-transparent bg-card p-3 text-foreground sm:p-4",
                        highlighted && outcomeHighlight[tile.outcome],
                      )}
                    >
                      <div className={cn("font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground sm:text-[0.6875rem]", highlighted && "text-current")}>{tile.label}</div>
                      <div className="mt-3 font-mono text-3xl font-semibold tabular-nums">{tile.value}</div>
                    </div>
                  );
                })}
              </div>

              <div
                id="proof-window-panel"
                role="tabpanel"
                aria-labelledby={`proof-tab-${activeWindow.id}`}
                className={cn(
                  "border-t border-border opacity-100 motion-safe:transition-opacity motion-safe:duration-150",
                  !contentResolved && "motion-safe:opacity-0",
                )}
              >
                {activeWindow.report.kind === "matched" ? (
                  <div className="grid gap-px bg-border sm:grid-cols-2">
                    <div style={tileDelay(0)} className={cn("bg-card p-5", tileClass)}>
                      <MicroLabel>modeled matched P&amp;L</MicroLabel>
                      <div className="mt-6 font-mono text-5xl font-semibold tabular-nums text-success">{matchedPnl}</div>
                      <p className="mt-2 text-xs text-muted-foreground">Synthetic modeled result for the matched window.</p>
                      <div className="mt-4 space-y-2 border-t border-border pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
                        <div className="flex items-center justify-between gap-3"><span>yes leg / $0.540</span><span className="text-success">filled</span></div>
                        <div className="flex items-center justify-between gap-3"><span>no leg / $0.400</span><span className="text-success">filled</span></div>
                      </div>
                    </div>
                    <div style={tileDelay(1)} className={cn("bg-card p-5", tileClass)}>
                      <div className="flex items-center justify-between gap-4">
                        <MicroLabel>{activeWindow.report.route}</MicroLabel>
                        <span className="font-mono text-[0.6875rem] uppercase text-success">{activeWindow.report.state}</span>
                      </div>
                      <div className="mt-6 font-mono text-5xl font-semibold tabular-nums text-success">{capturedReturn}</div>
                      <p className="mt-2 text-xs text-muted-foreground">Modeled net return in the synthetic matched window.</p>
                      <div className="mt-4 space-y-2 border-t border-border pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
                        <div className="flex items-center justify-between gap-3"><span>bundle paid / $0.940</span><span>both legs</span></div>
                        <div className="flex items-center justify-between gap-3"><span>payout / $1.000</span><span className="text-success">+$0.048 edge</span></div>
                      </div>
                    </div>
                  </div>
                ) : activeWindow.report.kind === "no-trade" ? (
                  <div style={tileDelay(0)} className={cn("bg-warning/[0.045] p-5", tileClass)}>
                    <div className="flex items-center justify-between gap-4">
                      <MicroLabel>{activeWindow.report.route}</MicroLabel>
                      <span className="font-mono text-[0.6875rem] uppercase text-warning">{activeWindow.report.state}</span>
                    </div>
                    <div className="mt-10 font-sans text-5xl font-semibold tracking-[-0.04em]">{activeWindow.report.value}</div>
                    <p className="mt-2 text-xs text-muted-foreground">{activeWindow.report.reason}</p>
                  </div>
                ) : (
                  <div style={tileDelay(0)} className={cn("bg-danger/[0.045] p-5", tileClass)}>
                    <MicroLabel className="text-danger">{activeWindow.report.route}</MicroLabel>
                    <div className="mt-10 font-mono text-5xl font-semibold tabular-nums text-danger">{activeWindow.report.value}</div>
                    <p className="mt-2 text-xs text-muted-foreground">{activeWindow.report.reason}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-danger/20 pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
                      <span>no leg filled / $0.400</span>
                      <span className="text-danger">yes leg missed</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="border-t border-border px-5 py-4 text-xs leading-5 text-muted-foreground">
                Synthetic replay only. This demonstrates accounting and safety behavior—not historical performance or future returns.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
