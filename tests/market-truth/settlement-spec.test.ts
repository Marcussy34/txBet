import { describe, expect, it } from "vitest";

import {
  normalizeSettlementSpec,
  parseSettlementSpec,
  settlementFingerprint,
  settlementProvenanceHash,
  settlementSemanticProjection,
  type SettlementSpecV1,
} from "@/market-truth/settlement-spec";

import { HASH_B, worldCupSettlementSpec } from "./fixtures";

describe("World Cup settlement specification", () => {
  it("accepts and freezes a complete versioned specification", () => {
    const spec = parseSettlementSpec(worldCupSettlementSpec());

    expect(spec.schemaVersion).toBe("world-cup-settlement-v1");
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.rules)).toBe(true);
    expect(Object.isFrozen(spec.evidence.nativeIdentity)).toBe(true);
    expect(settlementFingerprint(spec)).toMatch(/^[a-f0-9]{64}$/);
    expect(settlementProvenanceHash(spec)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires every rule, identity, timing, payout, and provenance field", () => {
    const invalid: readonly [string, unknown][] = [
      ["schemaVersion", { schemaVersion: "world-cup-settlement-v2" }],
      ["specVersion", { specVersion: 0 }],
      ["competition.id", { competition: { id: "", edition: "2026" } }],
      ["competition.edition", { competition: { id: "fifa-world-cup", edition: "" } }],
      ["stage.id", { stage: { id: "Group Stage", group: "group-a", round: null } }],
      ["fixtureId", { fixtureId: "Fixture 1" }],
      ["subject.id", { subject: { id: "Team Argentina" } }],
      ["subject.name", { subject: { name: "" } }],
      ["familyId", { proposition: { familyId: "Fixture Winner" } }],
      ["statistic", { proposition: { statistic: "Total Goals" } }],
      ["rounding", { proposition: { roundingRuleId: "" } }],
      ["period", { evaluation: { period: "" } }],
      ["evaluation range", { evaluation: { startsAt: 20, endsAt: 10 } }],
      ["drawRuleId", { rules: { drawRuleId: "" } }],
      ["tieRuleId", { rules: { tieRuleId: "Tie Rule" } }],
      ["resolutionDeadline", { rules: { resolutionDeadline: -1 } }],
      ["payout unit", { payout: { valueUnit: "EUR" } }],
      ["payout", { payout: { nominalMicrosPerShare: 0 } }],
      ["source URL", { evidence: { sourceUrl: "javascript:alert(1)" } }],
      ["rule hash", { evidence: { rawRuleTextHash: HASH_B.toUpperCase() } }],
      ["venue revision", { evidence: { venueRevision: "" } }],
      ["mapping revision", { evidence: { canonicalEntityMappingRevision: "" } }],
      ["native market", { evidence: { nativeIdentity: { marketId: "" } } }],
      ["retrievedAt", { evidence: { retrievedAt: -1 } }],
    ];

    for (const [label, override] of invalid) {
      const spec = worldCupSettlementSpec(override as Partial<SettlementSpecV1>);
      expect(() => parseSettlementSpec(spec), label).toThrow();
    }
  });

  it("enforces comparator-specific threshold and exact range semantics", () => {
    const validBetween = worldCupSettlementSpec({
      proposition: {
        ...worldCupSettlementSpec().proposition,
        comparator: "between",
        threshold: null,
        lowerBound: "1.5",
        upperBound: "2.5",
      },
    });
    expect(parseSettlementSpec(validBetween).proposition.comparator).toBe("between");

    const invalidPropositions: readonly Partial<SettlementSpecV1["proposition"]>[] = [
      { comparator: "none", threshold: "1", lowerBound: null, upperBound: null },
      { comparator: "gte", threshold: null, lowerBound: null, upperBound: null },
      { comparator: "gte", threshold: "2", lowerBound: "1", upperBound: null },
      { comparator: "between", threshold: "2", lowerBound: "1", upperBound: "3" },
      { comparator: "between", threshold: null, lowerBound: "2", upperBound: "2" },
      { comparator: "between", threshold: null, lowerBound: "3", upperBound: "2" },
      { comparator: "gte", threshold: "01", lowerBound: null, upperBound: null },
      { comparator: "gte", threshold: "1.0", lowerBound: null, upperBound: null },
      { comparator: "gte", threshold: "1e0", lowerBound: null, upperBound: null },
      { comparator: "gte", threshold: "-0", lowerBound: null, upperBound: null },
    ];

    for (const proposition of invalidPropositions) {
      expect(() =>
        parseSettlementSpec(
          worldCupSettlementSpec({
            proposition: {
              ...worldCupSettlementSpec().proposition,
              ...proposition,
            } as SettlementSpecV1["proposition"],
          }),
        ),
      ).toThrow();
    }
  });

  it("fingerprints every semantic field but excludes display and provenance fields", () => {
    const base = worldCupSettlementSpec();
    const original = settlementFingerprint(base);
    const semanticMutations: readonly Partial<SettlementSpecV1>[] = [
      { competition: { id: "fifa-club-world-cup", edition: "2026" } },
      { competition: { id: "fifa-world-cup", edition: "2030" } },
      { stage: { id: "knockout-stage", group: "group-a", round: null } },
      { stage: { id: "group-stage", group: "group-b", round: null } },
      { stage: { id: "group-stage", group: "group-a", round: "round-1" } },
      { fixtureId: "fixture-arg-esp" },
      { subject: { ...base.subject, kind: "player" } },
      { subject: { ...base.subject, id: "team-brazil" } },
      { proposition: { ...base.proposition, familyId: "fixture-total-goals" } },
      { proposition: { ...base.proposition, statistic: "shots-on-target" } },
      { proposition: { ...base.proposition, comparator: "gt" } },
      { proposition: { ...base.proposition, threshold: "3" } },
      {
        proposition: {
          ...base.proposition,
          comparator: "between",
          threshold: null,
          lowerBound: "1",
          upperBound: "3",
        },
      },
      { proposition: { ...base.proposition, unit: "goals" } },
      { proposition: { ...base.proposition, roundingRuleId: "floor-integer" } },
      { evaluation: { ...base.evaluation, period: "regulation-time" } },
      { evaluation: { ...base.evaluation, startsAt: base.evaluation.startsAt! + 1 } },
      { evaluation: { ...base.evaluation, endsAt: base.evaluation.endsAt! + 1 } },
      { evaluation: { ...base.evaluation, includesStoppageTime: false } },
      { evaluation: { ...base.evaluation, includesExtraTime: true } },
      { evaluation: { ...base.evaluation, includesPenalties: true } },
      ...Object.keys(base.rules).map((key) => ({
        rules: {
          ...base.rules,
          [key]:
            key === "resolutionDeadline"
              ? base.rules.resolutionDeadline! + 1
              : `${String(base.rules[key as keyof typeof base.rules])}-v2`,
        },
      })),
      { payout: { ...base.payout, nominalMicrosPerShare: 2_000_000 } },
    ];

    for (const mutation of semanticMutations) {
      expect(settlementFingerprint(worldCupSettlementSpec(mutation)), JSON.stringify(mutation)).not.toBe(
        original,
      );
    }

    const ignoredMutations: readonly Partial<SettlementSpecV1>[] = [
      { specVersion: 2 },
      { subject: { ...base.subject, name: "Selección Argentina" } },
      { evidence: { ...base.evidence, sourceUrl: "https://other.example/rules" } },
      { evidence: { ...base.evidence, rawRuleTextHash: HASH_B } },
      { evidence: { ...base.evidence, venueRevision: "venue-revision-2" } },
      {
        evidence: {
          ...base.evidence,
          canonicalEntityMappingRevision: "mapping-revision-2",
        },
      },
      { evidence: { ...base.evidence, retrievedAt: base.evidence.retrievedAt + 1 } },
      {
        evidence: {
          ...base.evidence,
          nativeIdentity: { ...base.evidence.nativeIdentity, marketId: "native-market-2" },
        },
      },
    ];

    for (const mutation of ignoredMutations) {
      expect(settlementFingerprint(worldCupSettlementSpec(mutation))).toBe(original);
    }
  });

  it("hashes provenance independently from semantic equivalence", () => {
    const base = worldCupSettlementSpec();
    const originalFingerprint = settlementFingerprint(base);
    const originalProvenance = settlementProvenanceHash(base);
    const provenanceMutations: readonly Partial<SettlementSpecV1>[] = [
      { evidence: { ...base.evidence, sourceUrl: "https://other.example/rules" } },
      { evidence: { ...base.evidence, rawRuleTextHash: HASH_B } },
      { evidence: { ...base.evidence, venueRevision: "venue-revision-2" } },
      {
        evidence: {
          ...base.evidence,
          canonicalEntityMappingRevision: "mapping-revision-2",
        },
      },
      { evidence: { ...base.evidence, retrievedAt: base.evidence.retrievedAt + 1 } },
      {
        evidence: {
          ...base.evidence,
          nativeIdentity: { ...base.evidence.nativeIdentity, outcomeId: "native-outcome-no" },
        },
      },
    ];

    for (const mutation of provenanceMutations) {
      const changed = worldCupSettlementSpec(mutation);
      expect(settlementFingerprint(changed)).toBe(originalFingerprint);
      expect(settlementProvenanceHash(changed)).not.toBe(originalProvenance);
    }
  });

  it("returns typed UNVERIFIED evidence instead of hashing incomplete specs", () => {
    const incomplete = worldCupSettlementSpec() as unknown as Record<string, unknown>;
    delete incomplete.rules;
    const result = normalizeSettlementSpec(incomplete);

    expect(result.status).toBe("UNVERIFIED");
    if (result.status === "UNVERIFIED") {
      expect(result.missingFields).toContain("rules");
      expect(result.rawRuleTextHash).toBe(worldCupSettlementSpec().evidence.rawRuleTextHash);
      expect(result.venueRevision).toBe(worldCupSettlementSpec().evidence.venueRevision);
    }
    expect(() => settlementFingerprint(incomplete as never)).toThrow();
  });

  it("uses an explicit semantic projection without bookkeeping or display fields", () => {
    const projection = settlementSemanticProjection(worldCupSettlementSpec());

    expect(projection).toMatchObject({
      competition: { id: "fifa-world-cup", edition: "2026" },
      subject: { kind: "team", id: "team-argentina" },
      payout: { valueUnit: "USD", nominalMicrosPerShare: 1_000_000 },
    });
    expect(projection).not.toHaveProperty("schemaVersion");
    expect(projection).not.toHaveProperty("specVersion");
    expect(projection).not.toHaveProperty("evidence");
    expect(projection.subject).not.toHaveProperty("name");
  });
});
