import { describe, expect, it } from "vitest";
import { compareContracts, settlementKey } from "../src/core/settlement";
import type { CanonicalContract } from "../src/core/types";
import { USD_MICROS } from "../src/core/money";

function contract(outcome: "YES" | "NO", overrides: Partial<CanonicalContract["settlement"]> = {}): CanonicalContract {
  return {
    contractId: `venue:${outcome.toLowerCase()}`,
    venueId: outcome === "YES" ? "venue-a" : "venue-b",
    venueName: outcome === "YES" ? "Venue A" : "Venue B",
    title: outcome === "YES" ? "Argentina qualifies" : "Argentina does not qualify",
    family: "qualification",
    outcome,
    settlement: {
      fixtureId: "fixture-1",
      proposition: "argentina-qualifies",
      subject: "Argentina",
      period: "full-match",
      scope: "including-extra-time-and-penalties",
      line: null,
      resolutionRuleId: "official-result-v1",
      voidRuleId: "postponed-48h-refund-v1",
      closesAt: 1_900_000_000_000,
      payoutCurrency: "USD",
      payoutMicros: USD_MICROS,
      ...overrides,
    },
  };
}

describe("settlement matching", () => {
  it("accepts exact YES and NO complements", () => {
    expect(compareContracts(contract("YES"), contract("NO"))).toEqual({
      matches: true,
      reasons: [],
    });
  });

  it("uses an ordered, deterministic settlement key", () => {
    expect(settlementKey(contract("YES").settlement)).toBe(settlementKey(contract("NO").settlement));
  });

  it.each([
    ["period", "regulation", "PERIOD"],
    ["scope", "regulation-only", "SCOPE"],
    ["line", "3.5", "LINE"],
    ["voidRuleId", "abandoned-refund-v2", "VOID_RULE"],
    ["resolutionRuleId", "venue-result-v2", "RESOLUTION_RULE"],
    ["closesAt", 1_900_000_000_001, "CLOSE_TIME"],
    ["payoutMicros", 900_000, "PAYOUT"],
  ] as const)("rejects a %s mismatch", (field, value, reason) => {
    const result = compareContracts(contract("YES"), contract("NO", { [field]: value }));
    expect(result.matches).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it("rejects two contracts on the same outcome", () => {
    expect(compareContracts(contract("YES"), contract("YES")).reasons).toContain("OUTCOME");
  });

  it("does not use display-title similarity as settlement evidence", () => {
    const left = contract("YES");
    const right = { ...contract("NO"), title: "A completely different venue title" };
    expect(compareContracts(left, right).matches).toBe(true);
  });
});
