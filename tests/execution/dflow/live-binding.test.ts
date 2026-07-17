import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  parseDflowWorldCupBindings,
  resolveCurrentDflowWorldCupBinding,
} from "@/execution/venues/dflow/live-binding";

const NOW = 1_784_270_000_000;
const mint = (byte: number) =>
  new PublicKey(Uint8Array.from({ length: 32 }, () => byte)).toBase58();

function manifest() {
  return JSON.stringify({
    schemaVersion: "txbet-dflow-world-cup-bindings-v1",
    bindings: [
      {
        id: "world-cup-winner-argentina-yes",
        competition: "fifa-world-cup",
        edition: 2026,
        title: "Will Argentina win the 2026 FIFA World Cup?",
        outcome: "YES",
        marketKey: "kalshi-world-cup-winner-argentina",
        outcomeMint: mint(3),
        evidenceUrl: "https://dflow.net/markets/world-cup-argentina",
        evidenceHash: `sha256:${"a".repeat(64)}`,
        reviewedAtMs: NOW - 60_000,
        validUntilMs: NOW + 86_400_000,
      },
    ],
  });
}

describe("reviewed DFlow World Cup bindings", () => {
  it("parses and resolves only the fixed 2026 World Cup binding", () => {
    const bindings = parseDflowWorldCupBindings(manifest());
    const binding = resolveCurrentDflowWorldCupBinding(
      bindings,
      "world-cup-winner-argentina-yes",
      NOW,
    );

    expect(binding).toMatchObject({
      competition: "fifa-world-cup",
      edition: 2026,
      outcomeMint: mint(3),
    });
    expect(binding.bindingHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it("rejects non-World-Cup identity, stale evidence, duplicates, and malformed mints", () => {
    const base = JSON.parse(manifest()) as { bindings: Record<string, unknown>[] };
    for (const mutation of [
      { competition: "uefa-euros" },
      { edition: 2030 },
      { outcomeMint: "not-a-mint" },
      { evidenceHash: "sha256:bad" },
    ]) {
      const value = structuredClone(base);
      Object.assign(value.bindings[0]!, mutation);
      expect(() => parseDflowWorldCupBindings(JSON.stringify(value))).toThrow();
    }

    const duplicates = structuredClone(base);
    duplicates.bindings.push({ ...duplicates.bindings[0]! });
    expect(() => parseDflowWorldCupBindings(JSON.stringify(duplicates))).toThrow(/unique/i);

    const bindings = parseDflowWorldCupBindings(manifest());
    expect(() => resolveCurrentDflowWorldCupBinding(
      bindings,
      "world-cup-winner-argentina-yes",
      NOW + 86_400_001,
    )).toThrow(/expired|current/i);
    expect(() => resolveCurrentDflowWorldCupBinding(
      bindings,
      "unknown-binding",
      NOW,
    )).toThrow(/binding/i);
  });
});
