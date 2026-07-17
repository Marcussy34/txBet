import type { SettlementSpecV1 } from "@/market-truth/settlement-spec";

export const HASH_A = "a".repeat(64);
export const HASH_B = "b".repeat(64);
export const HASH_C = "c".repeat(64);

export function worldCupSettlementSpec(
  overrides: Partial<SettlementSpecV1> = {},
): SettlementSpecV1 {
  const base: SettlementSpecV1 = {
    schemaVersion: "world-cup-settlement-v1",
    specVersion: 1,
    competition: { id: "fifa-world-cup", edition: "2026" },
    stage: { id: "group-stage", group: "group-a", round: null },
    fixtureId: "fixture-arg-bra",
    subject: { kind: "team", id: "team-argentina", name: "Argentina" },
    proposition: {
      familyId: "fixture-team-total-goals",
      statistic: "goals",
      comparator: "gte",
      threshold: "2",
      lowerBound: null,
      upperBound: null,
      unit: "count",
      roundingRuleId: "integer-exact",
    },
    evaluation: {
      period: "full-match",
      startsAt: 1_800_000_000_000,
      endsAt: 1_800_010_800_000,
      includesStoppageTime: true,
      includesExtraTime: false,
      includesPenalties: false,
    },
    rules: {
      drawRuleId: "draw-counts",
      tieRuleId: "tie-not-applicable",
      deadHeatRuleId: "dead-heat-not-applicable",
      sharedWinnerRuleId: "shared-winner-not-applicable",
      postponementRuleId: "postponed-until-deadline",
      abandonmentRuleId: "abandoned-void",
      cancellationRuleId: "cancelled-void",
      rescheduleRuleId: "rescheduled-same-fixture",
      voidRuleId: "void-refund",
      qualificationRuleId: "qualification-not-applicable",
      replacementRuleId: "replacement-not-applicable",
      resolutionSourceId: "fifa-official-match-report",
      resolutionDeadline: 1_800_097_200_000,
      disputeRuleId: "venue-dispute-v1",
      revisionRuleId: "venue-rules-at-order-time",
    },
    payout: { valueUnit: "USD", nominalMicrosPerShare: 1_000_000 },
    evidence: {
      sourceUrl: "https://venue.example/rules/world-cup/market-1",
      rawRuleTextHash: HASH_A,
      venueRevision: "venue-revision-1",
      canonicalEntityMappingRevision: "mapping-revision-1",
      nativeIdentity: {
        competitionId: "native-competition-1",
        stageId: "native-stage-1",
        fixtureId: "native-fixture-1",
        subjectId: "native-subject-1",
        marketId: "native-market-1",
        outcomeId: "native-outcome-yes",
        statisticId: "native-stat-goals",
      },
      retrievedAt: 1_799_000_000_000,
    },
  };

  return {
    ...base,
    ...overrides,
    competition: { ...base.competition, ...overrides.competition },
    stage: { ...base.stage, ...overrides.stage },
    subject: { ...base.subject, ...overrides.subject },
    proposition: { ...base.proposition, ...overrides.proposition },
    evaluation: { ...base.evaluation, ...overrides.evaluation },
    rules: { ...base.rules, ...overrides.rules },
    payout: { ...base.payout, ...overrides.payout },
    evidence: {
      ...base.evidence,
      ...overrides.evidence,
      nativeIdentity: {
        ...base.evidence.nativeIdentity,
        ...overrides.evidence?.nativeIdentity,
      },
    },
  };
}
