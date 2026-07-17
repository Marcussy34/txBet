import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TxBetConsole } from "@/components/dashboard/txbet-console";
import { ExecutionControlStatus } from "@/components/dashboard/execution-control-panel";

describe("quick MVP console disclosures", () => {
  it("positions the roster as match trading without banned framing", () => {
    const matchesMarkup = renderToStaticMarkup(createElement(TxBetConsole, { initialView: "matches" }));
    const rosterMarkup = renderToStaticMarkup(createElement(TxBetConsole, { initialView: "roster" }));
    const visibleCopy = `${matchesMarkup} ${rosterMarkup}`.replace(/<[^>]*>/g, " ");

    expect(matchesMarkup).toContain("Pick your agent.");
    expect(matchesMarkup).toContain("It trades the match.");
    expect(visibleCopy).not.toMatch(/\b(?:replay|synthetic|simulated|demo|fake|tape)\b/i);
  });

  it("keeps strategy and execution disclosures beside the live read-only boundaries", () => {
    // The boundaries card lives under the header's Controls tab.
    const markup = renderToStaticMarkup(createElement(TxBetConsole, { initialView: "controls" }));

    expect(markup).toContain("MVP live boundaries");
    expect(markup).toContain("LIVE-EXECUTABLE STRATEGY");
    expect(markup).toContain("OPERATOR-GATED EXECUTION");
    expect(markup).toContain("TxLINE");
    expect(markup).toContain("Polymarket");
    expect(markup).toContain("Agent arming");
    expect(markup).toContain("fail closed / shadow only");
  });

  it("shows persisted authority instead of the editable default", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionControlStatus, {
      control: {
        schemaVersion: "txbet-vercel-control-view-v1",
        version: 3,
        requestedMode: "canary",
        effectiveAgentMode: "shadow",
        maxTotalMicros: 10_000_000,
        expiresAtMs: Date.UTC(2026, 6, 24, 12, 30),
        worldCupOnly: true,
        polymarket: {
          mode: "canary",
          exactInventorySellCanaryCandidate: true,
        },
        kalshiDflow: {
          mode: "shadow",
          executable: false,
          blocker: "DFLOW_EXACT_OUTPUT_AND_PRODUCTION_ELIGIBILITY_UNPROVEN",
          manualExactInputCanary: {
            candidate: true,
            authorized: true,
          },
        },
        pairedExecution: {
          executable: false,
          blockers: [
            "DFLOW_EXACT_OUTPUT_AND_PRODUCTION_ELIGIBILITY_UNPROVEN",
            "SECOND_EXACT_COMPLEMENTARY_LIVE_LEG_UNAVAILABLE",
          ],
        },
      },
    }));

    expect(markup).toContain("current maximum");
    expect(markup).toContain("$10.00");
    expect(markup).toContain("2026-07-24 12:30 UTC");
  });
});
