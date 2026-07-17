import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MatchBacktestView } from "@/components/matches/match-backtest-view";
import {
  ARG_SUI_DOMINANCE_TRADES,
  ARG_SUI_WINDOWS,
} from "@/fixtures/matches/arg-sui-2026-07-11";
import {
  runAgentMatchBacktest,
  settleDominance,
} from "@/core/match-backtest";
import { formatUsd } from "@/core/money";

describe("/matches past-match backtest page", () => {
  const markup = renderToStaticMarkup(createElement(MatchBacktestView));

  it("renders the real fixture with the backtest badge", () => {
    expect(markup).toContain("Argentina vs Switzerland");
    expect(markup).toContain("FIFA World Cup 2026");
    expect(markup).toContain("Backtest");
    expect(markup).toContain("Official TxLINE timeline");
    expect(markup).toContain("RED CARD Switzerland");
  });

  it("shows every strategy with its settled capital from the artifact", () => {
    expect(markup).toContain("Match Dominance Agent");
    const dominance = settleDominance(ARG_SUI_DOMINANCE_TRADES);
    expect(markup).toContain(formatUsd(dominance.endingCapitalMicros));
    for (const report of runAgentMatchBacktest(ARG_SUI_WINDOWS)) {
      expect(markup).toContain(report.agent.name.replace(/&/g, "&amp;"));
      expect(markup).toContain(formatUsd(report.endingCapitalMicros));
    }
  });

  it("keeps the simulation disclosure in the methodology footnote", () => {
    expect(markup).toContain("BACKTEST");
    expect(markup).toContain("Simulated executions");
    expect(markup).toContain("TxLINE fixture 18222446");
  });

  it("frames refusals as protected capital with reason copy", () => {
    expect(markup).toContain("capital protected");
    expect(markup).toContain("books suspended during review");
  });
});
