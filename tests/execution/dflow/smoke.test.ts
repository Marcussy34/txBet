import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runDflowShadowSmoke } from "@/execution/venues/dflow/smoke";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../fixtures/dflow/order-response.json", import.meta.url),
    "utf8",
  ),
) as unknown;

describe("DFlow offline shadow smoke", () => {
  it("checks the fixed hosts and parses a non-transaction fixture", () => {
    expect(runDflowShadowSmoke(fixture)).toEqual({
      ok: true,
      venue: "kalshi-dflow",
      shadowOnly: true,
      liveReady: false,
      endpoints: {
        rest: "https://quote-api.dflow.net",
        websocket: "wss://quote-api.dflow.net",
      },
      quote: {
        inputAtomic: "1000000",
        expectedOutputAtomic: "2000000",
        minimumOutputAtomic: "1900000",
        maximumOutputAtomic: null,
        exactOutputGuaranteed: false,
      },
      blockingReasons: [
        "DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE",
        "DFLOW_OUTPUT_NOT_EXACT",
      ],
    });
  });

  it("rejects a fixture carrying a transaction or user identity", () => {
    for (const mutation of [
      { transaction: "c2lnbmFibGU=" },
      { userPublicKey: "11111111111111111111111111111111" },
    ]) {
      expect(() =>
        runDflowShadowSmoke({ ...(fixture as object), ...mutation }),
      ).toThrow();
    }
  });
});
