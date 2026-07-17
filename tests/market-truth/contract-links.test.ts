import { describe, expect, it } from "vitest";

import { reduceShares } from "@/core/live-money";
import {
  checkContractLinkPayoutBasis,
  proveComplement,
  verifyContractLink,
  type ContractRevisionRef,
  type LinkableContract,
  type VerifiedContractLink,
} from "@/market-truth/contract-links";
import {
  settlementFingerprint,
  settlementProvenanceHash,
  type AssetValuePolicy,
  type SettlementSpecV1,
} from "@/market-truth/settlement-spec";

import { HASH_B, HASH_C, worldCupSettlementSpec } from "./fixtures";

const NOW = 1_799_500_000_000;

function linkableContract(input: {
  venueId: string;
  contractId: string;
  outcome: "YES" | "NO";
  spec?: SettlementSpecV1;
  reference?: Partial<ContractRevisionRef>;
  status?: LinkableContract["status"];
  outcomeUniverse?: readonly string[];
  payoutAssetId?: string;
  payoutAssetRevision?: string;
  unitNumerator?: string;
  unitDenominator?: string;
}): LinkableContract {
  const spec = input.spec ?? worldCupSettlementSpec();
  const payoutAssetRevision = input.payoutAssetRevision ?? `${input.venueId}-usd-asset-v1`;
  const reference: ContractRevisionRef = {
    venueId: input.venueId,
    contractId: input.contractId,
    settlementSpecVersion: spec.specVersion,
    settlementFingerprint: settlementFingerprint(spec),
    venueRevision: spec.evidence.venueRevision,
    rawRuleTextHash: spec.evidence.rawRuleTextHash,
    settlementProvenanceHash: settlementProvenanceHash(spec),
    canonicalEntityMappingRevision: spec.evidence.canonicalEntityMappingRevision,
    tradingClosesAt: 1_800_000_000_000,
    closeTimeRevision: "close-v1",
    closeTimeEvidenceHash: HASH_B,
    payoutAssetRevision,
    ...input.reference,
  };

  return {
    reference,
    title: `${input.contractId} ${input.outcome}`,
    outcome: input.outcome,
    outcomeUniverse: input.outcomeUniverse ?? ["YES", "NO"],
    status: input.status ?? "open",
    settlementSpec: spec,
    unitSize: reduceShares(input.unitNumerator ?? "1", input.unitDenominator ?? "1"),
    payoutAsset: {
      network: input.venueId === "venue-a" ? "network-a" : "network-b",
      assetId: input.payoutAssetId ?? `${input.venueId}-usd`,
      symbol: "USDx",
      decimals: 6,
      assetRevision: payoutAssetRevision,
    },
  };
}

function exactPair() {
  return {
    left: linkableContract({ venueId: "venue-a", contractId: "yes-1", outcome: "YES" }),
    right: linkableContract({ venueId: "venue-b", contractId: "no-1", outcome: "NO" }),
  };
}

function verifiedExactLink(): VerifiedContractLink {
  const pair = exactPair();
  const result = proveComplement(pair.left, pair.right);
  if (result.status !== "VERIFIED") throw new Error("Expected exact pair to verify");
  return result;
}

function policyFor(contract: LinkableContract, overrides: Partial<AssetValuePolicy> = {}) {
  return {
    version: "policy-v1",
    network: contract.payoutAsset.network,
    assetId: contract.payoutAsset.assetId,
    assetRevision: contract.payoutAsset.assetRevision,
    usdLowerBoundMicrosPerToken: 999_000,
    usdUpperBoundMicrosPerToken: 1_001_000,
    validUntil: NOW + 60_000,
    evidenceHash: HASH_C,
    ...overrides,
  } satisfies AssetValuePolicy;
}

describe("World Cup contract complement proof", () => {
  it("verifies inverse, exhaustive binary contracts on different venues", () => {
    const { left, right } = exactPair();
    const result = proveComplement(left, right);

    expect(result).toMatchObject({
      status: "VERIFIED",
      fingerprint: settlementFingerprint(left.settlementSpec),
      method: "exact",
      transformRuleId: null,
      left: left.reference,
      right: right.reference,
    });
  });

  it("fails closed for same venue, same polarity, non-binary/push outcomes, and unit mismatch", () => {
    const { left, right } = exactPair();
    const cases: readonly [string, LinkableContract, LinkableContract, string][] = [
      ["same venue", left, linkableContract({ venueId: "venue-a", contractId: "no", outcome: "NO" }), "SAME_VENUE"],
      ["same polarity", left, { ...right, outcome: "YES" }, "SAME_POLARITY"],
      ["non-binary", left, { ...right, outcomeUniverse: ["YES", "NO", "OTHER"] }, "NON_BINARY_OUTCOMES"],
      ["push", left, { ...right, outcomeUniverse: ["YES", "NO", "PUSH"] }, "NON_BINARY_OUTCOMES"],
      [
        "unit mismatch",
        left,
        linkableContract({
          venueId: "venue-b",
          contractId: "no",
          outcome: "NO",
          unitNumerator: "2",
        }),
        "UNIT_SIZE_MISMATCH",
      ],
    ];

    for (const [label, a, b, code] of cases) {
      const result = proveComplement(a, b);
      expect(result.status, label).toBe("UNVERIFIED");
      if (result.status === "UNVERIFIED") {
        expect(result.reasons.map((reason) => reason.code), label).toContain(code);
      }
    }
  });

  it("rejects every semantic mismatch including nominal payout", () => {
    const { left, right } = exactPair();
    const changedSpecs = [
      worldCupSettlementSpec({ fixtureId: "fixture-other" }),
      worldCupSettlementSpec({ evaluation: { ...right.settlementSpec.evaluation, includesExtraTime: true } }),
      worldCupSettlementSpec({ rules: { ...right.settlementSpec.rules, drawRuleId: "draw-void" } }),
      worldCupSettlementSpec({ payout: { valueUnit: "USD", nominalMicrosPerShare: 2_000_000 } }),
    ];

    for (const spec of changedSpecs) {
      const result = proveComplement(
        left,
        linkableContract({ venueId: "venue-b", contractId: "no", outcome: "NO", spec }),
      );
      expect(result.status).toBe("UNVERIFIED");
      if (result.status === "UNVERIFIED") {
        expect(result.reasons.map((reason) => reason.code)).toContain("SETTLEMENT_MISMATCH");
      }
    }
  });

  it("supports only the closed integer gte/gt reviewed transform", () => {
    const leftSpec = worldCupSettlementSpec();
    const rightSpec = worldCupSettlementSpec({
      proposition: {
        ...leftSpec.proposition,
        comparator: "gt",
        threshold: "1",
      },
    });
    const left = linkableContract({ venueId: "venue-a", contractId: "yes", outcome: "YES", spec: leftSpec });
    const right = linkableContract({ venueId: "venue-b", contractId: "no", outcome: "NO", spec: rightSpec });

    const verified = proveComplement(left, right, {
      method: "reviewed-transform",
      transformRuleId: "world-cup-integer-gte-gt-v1",
    });
    expect(verified).toMatchObject({
      status: "VERIFIED",
      method: "reviewed-transform",
      transformRuleId: "world-cup-integer-gte-gt-v1",
    });

    for (const [ruleId, changed] of [
      ["operator-code", right],
      [
        "world-cup-integer-gte-gt-v1",
        linkableContract({
          venueId: "venue-b",
          contractId: "no",
          outcome: "NO",
          spec: worldCupSettlementSpec({
            proposition: { ...rightSpec.proposition, unit: "meters" },
          }),
        }),
      ],
    ] as const) {
      const result = proveComplement(left, changed, {
        method: "reviewed-transform",
        transformRuleId: ruleId,
      });
      expect(result.status).toBe("UNVERIFIED");
    }
  });

  it("invalidates a verified link when any stored revision field changes", () => {
    const pair = exactPair();
    const linkResult = proveComplement(pair.left, pair.right);
    if (linkResult.status !== "VERIFIED") throw new Error("Expected verified link");

    const mutations: readonly [keyof ContractRevisionRef, unknown][] = [
      ["venueId", "venue-c"],
      ["contractId", "changed-contract"],
      ["settlementSpecVersion", 2],
      ["settlementFingerprint", HASH_C],
      ["venueRevision", "venue-revision-2"],
      ["rawRuleTextHash", HASH_C],
      ["settlementProvenanceHash", HASH_C],
      ["canonicalEntityMappingRevision", "mapping-revision-2"],
      ["tradingClosesAt", pair.left.reference.tradingClosesAt + 1],
      ["closeTimeRevision", "close-v2"],
      ["closeTimeEvidenceHash", HASH_C],
      ["payoutAssetRevision", "asset-v2"],
    ];

    for (const [field, value] of mutations) {
      const currentLeft = {
        ...pair.left,
        reference: { ...pair.left.reference, [field]: value },
      };
      const result = verifyContractLink(linkResult, currentLeft, pair.right, NOW);
      expect(result.status, field).toBe("UNVERIFIED");
      if (result.status === "UNVERIFIED") {
        expect(result.reasons.some((reason) => reason.code === "STALE_REFERENCE" && reason.field === field), field).toBe(true);
      }
    }
  });

  it("invalidates closed, suspended, resolved, or time-closed contracts", () => {
    const pair = exactPair();
    const link = verifiedExactLink();

    for (const status of ["suspended", "closed", "resolved"] as const) {
      const result = verifyContractLink(link, { ...pair.left, status }, pair.right, NOW);
      expect(result.status).toBe("UNVERIFIED");
    }

    expect(
      verifyContractLink(link, pair.left, pair.right, pair.left.reference.tradingClosesAt),
    ).toMatchObject({ status: "UNVERIFIED" });
  });

  it("binds current per-asset valuation policies and uses the conservative payout", () => {
    const pair = exactPair();
    const link = verifiedExactLink();
    const leftPolicy = policyFor(pair.left, { usdLowerBoundMicrosPerToken: 995_000 });
    const rightPolicy = policyFor(pair.right, { usdLowerBoundMicrosPerToken: 990_000 });
    const result = checkContractLinkPayoutBasis({
      link,
      left: pair.left,
      right: pair.right,
      leftPolicy,
      rightPolicy,
      now: NOW,
    });

    expect(result).toMatchObject({
      status: "VERIFIED",
      conservativePayoutMicrosPerShare: 990_000,
      leftPayoutMicrosPerShare: 995_000,
      rightPayoutMicrosPerShare: 990_000,
    });
    if (result.status === "VERIFIED") {
      expect(result.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("rejects missing, expired, mismatched, or malformed payout policies", () => {
    const pair = exactPair();
    const link = verifiedExactLink();
    const validLeft = policyFor(pair.left);
    const validRight = policyFor(pair.right);
    const cases: readonly [string, AssetValuePolicy | null, AssetValuePolicy | null][] = [
      ["missing", null, validRight],
      ["expired", { ...validLeft, validUntil: NOW }, validRight],
      ["network", { ...validLeft, network: "wrong-network" }, validRight],
      ["asset", { ...validLeft, assetId: "wrong-asset" }, validRight],
      ["revision", { ...validLeft, assetRevision: "wrong-revision" }, validRight],
      ["bounds", { ...validLeft, usdLowerBoundMicrosPerToken: 1_100_000 }, validRight],
      ["hash", { ...validLeft, evidenceHash: "not-a-hash" }, validRight],
    ];

    for (const [label, leftPolicy, rightPolicy] of cases) {
      const result = checkContractLinkPayoutBasis({
        link,
        left: pair.left,
        right: pair.right,
        leftPolicy,
        rightPolicy,
        now: NOW,
      });
      expect(result.status, label).toBe("UNVERIFIED");
    }
  });
});
