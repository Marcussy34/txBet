import { describe, expect, it } from "vitest";

import {
  deriveCancellationCostBudgetSubjectKey,
  deriveCancellationOperationSubjectKey,
  deriveAttemptKey,
  deriveBundleScopeKey,
  deriveLegScopeKey,
  deriveRecoveryOperationScopeKey,
  deriveRecoverySemanticHash,
  deriveRedemptionCostBudgetSubjectKey,
  deriveSubmissionKey,
} from "@/execution/idempotency";

describe("domain-separated execution identities", () => {
  it("pins known UTF-8 SHA-256 answers for an entry and both legs", () => {
    const bundle = deriveBundleScopeKey({
      profileId: "profile-1",
      strategyId: "strategy-1",
      opportunityId: "opportunity-1",
      bundleHash: "bundle-hash",
    });
    const leg0 = deriveLegScopeKey(bundle, 0);
    const leg1 = deriveLegScopeKey(bundle, 1);
    const attempt = deriveAttemptKey("entry", leg0, 0);

    expect(bundle).toBe("236acb5dc60d01ce88e9d8476ffbbab351fb0db5349d19ddd45356ab47ac73c7");
    expect(leg0).toBe("b8920371b3ed1af60654081fb972a74512b9ef7e2f968022089b87bdd67c2b97");
    expect(leg1).toBe("f15401ab55eacbb7a06d5ac1521e29d56de572270588b754ed1741b19230eb65");
    expect(attempt).toBe("433864743631babf2b93fa5671d2b554c4b6d551f6a919a2d69afccdec9e80e4");
    expect(deriveSubmissionKey(attempt, "a".repeat(64))).toBe(
      "ab7a9987e1e9d0961fdc01d352e6c4a1c1ea265147d6d0b19205cfa16d96fad5",
    );
  });

  it("pins the non-circular semantic hash and recovery operation scope", () => {
    const semanticHash = deriveRecoverySemanticHash("cancel", {
      reason: "EXPIRED",
      expiresAt: 123,
    });
    expect(semanticHash).toBe(
      "9c4cd48f940ad154df66f60ee626129aad89cfafc9b75caf1a49fe4156450571",
    );
    expect(
      deriveRecoveryOperationScopeKey("profile-1", "cancel", semanticHash),
    ).toBe("71309f2e8516aab02bebcc157cd552a6a749726d7e84d5249e7639480c570ebe");
  });

  it("pins cancellation and redemption subject budgets independently of semantics", () => {
    expect(
      deriveCancellationCostBudgetSubjectKey(
        "profile-1",
        "attempt-1",
        "revision-1",
      ),
    ).toBe("6f8a0cf38053ce07034211984ce417893aa0c3fa0c25c7e6a493835d80c70f04");
    expect(
      deriveCancellationOperationSubjectKey(
        "profile-1",
        "attempt-1",
        "revision-1",
      ),
    ).toBe("8df55ebe363281cd54d388ac095a7bbdbf9d7428efec6244bc37d74c67d4258d");
    expect(
      deriveRedemptionCostBudgetSubjectKey(
        "profile-1",
        "polymarket",
        "position-1",
      ),
    ).toBe("f58ea6218188ab9154c9fbaf4a78966fd997218de821eb6caf0930f20174dc9f");
  });

  it("rejects circular recovery identity fields inside semantic intent", () => {
    for (const forbidden of [
      "cancellationId",
      "compensationId",
      "redemptionId",
      "attemptKey",
      "submissionKey",
      "artifactHash",
      "semanticHash",
      "operationScopeKey",
      "recordHash",
    ]) {
      expect(() =>
        deriveRecoverySemanticHash("cancel", {
          reason: "EXPIRED",
          [forbidden]: "forbidden",
        }),
      ).toThrow(/semantic intent/i);
    }
  });

  it("changes for every tuple component and rejects invalid ordinals", () => {
    const base = deriveBundleScopeKey({
      profileId: "p",
      strategyId: "s",
      opportunityId: "o",
      bundleHash: "b",
    });
    for (const mutation of [
      { profileId: "p2", strategyId: "s", opportunityId: "o", bundleHash: "b" },
      { profileId: "p", strategyId: "s2", opportunityId: "o", bundleHash: "b" },
      { profileId: "p", strategyId: "s", opportunityId: "o2", bundleHash: "b" },
      { profileId: "p", strategyId: "s", opportunityId: "o", bundleHash: "b2" },
    ]) {
      expect(deriveBundleScopeKey(mutation)).not.toBe(base);
    }
    expect(() => deriveAttemptKey("entry", base, -1)).toThrow(/ordinal/i);
    expect(() => deriveLegScopeKey(base, 2 as 0)).toThrow(/leg/i);
  });
});
