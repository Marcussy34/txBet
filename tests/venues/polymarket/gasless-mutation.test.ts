import { describe, expect, it, vi } from "vitest";

import {
  drivePolymarketGaslessMutationOnce,
  type PolymarketGaslessMutationJournal,
} from "@/venues/polymarket/gasless-mutation";

const SIGNER = "0x1111111111111111111111111111111111111111";
const SIGNATURE = `0x${"22".repeat(65)}`;
const TRANSACTION_HASH = `0x${"33".repeat(32)}`;

function journal(
  events: string[],
  claim: "claimed" | "already_claimed" = "claimed",
): PolymarketGaslessMutationJournal {
  return {
    claimOperation: vi.fn(async () => {
      events.push("claim");
      return claim;
    }),
    persistPrepareStarted: vi.fn(async () => {
      events.push("prepare-started");
    }),
    persistPrepared: vi.fn(async () => {
      events.push("prepared");
    }),
    persistSignRequested: vi.fn(async () => {
      events.push("sign-requested");
    }),
    persistSigned: vi.fn(async () => {
      events.push("signed");
    }),
    persistSubmitStarted: vi.fn(async () => {
      events.push("submit-started");
    }),
    persistAcknowledged: vi.fn(async () => {
      events.push("acknowledged");
    }),
    persistUnknown: vi.fn(async () => {
      events.push("unknown");
    }),
  };
}

describe("crash-safe Polymarket gasless mutation boundary", () => {
  it("persists every boundary before one submit continuation", async () => {
    const events: string[] = [];
    const mutationJournal = journal(events);
    const payload = { domain: { chainId: 137 }, message: { nonce: 7n } };
    let submissionCount = 0;

    async function* workflow(): AsyncGenerator<unknown, unknown, string> {
      const address = yield { kind: "requestAddress" };
      expect(address).toBe(SIGNER);
      const signature = yield { kind: "signGaslessTypedData", payload };
      expect(signature).toBe(SIGNATURE);
      submissionCount += 1;
      return {
        transactionHash: TRANSACTION_HASH,
        transactionId: "gasless-transaction-1",
        wait: vi.fn(),
      };
    }

    const result = await drivePolymarketGaslessMutationOnce({
      operationId: "operation-1",
      signerAddress: SIGNER,
      journal: mutationJournal,
      prepareWorkflow: async () => workflow(),
      sign: async (request) => {
        events.push("sign");
        expect(request).toEqual({ kind: "signGaslessTypedData", payload });
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.payload)).toBe(true);
        if (request.kind === "signGaslessTypedData") {
          expect(Object.isFrozen(request.payload.domain)).toBe(true);
          expect(Object.isFrozen(request.payload.message)).toBe(true);
        }
        return SIGNATURE;
      },
    });

    expect(result).toEqual({
      kind: "acked",
      terminal: false,
      operationId: "operation-1",
      transactionHash: TRANSACTION_HASH,
      transactionId: "gasless-transaction-1",
    });
    expect(submissionCount).toBe(1);
    expect(events).toEqual([
      "claim",
      "prepare-started",
      "prepared",
      "sign-requested",
      "sign",
      "signed",
      "submit-started",
      "acknowledged",
    ]);
    expect(mutationJournal.persistSignRequested).toHaveBeenCalledWith({
      operationId: "operation-1",
      request: { kind: "signGaslessTypedData", payload },
    });
    expect(mutationJournal.persistPrepareStarted).toHaveBeenCalledWith({
      operationId: "operation-1",
      sdkVersion: "0.1.0-beta.16",
      sdkGaslessSourceSha256:
        "7f2e78c855c184154e42a6096ab1cd9bef89183626ec1f393492a6b168fcb46c",
    });
    expect(mutationJournal.persistSigned).toHaveBeenCalledWith({
      operationId: "operation-1",
      signatureSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("stops an SDK retry generator before it can submit twice", async () => {
    const events: string[] = [];
    let submissionCount = 0;

    async function* retryingWorkflow() {
      yield { kind: "requestAddress" };
      yield { kind: "signGaslessTypedData", payload: { nonce: 1n } };
      submissionCount += 1;
      yield { kind: "signGaslessTypedData", payload: { nonce: 2n } };
      submissionCount += 1;
      return {
        transactionHash: TRANSACTION_HASH,
        transactionId: "must-not-be-reached",
      };
    }

    const result = await drivePolymarketGaslessMutationOnce({
      operationId: "operation-retry",
      signerAddress: SIGNER,
      journal: journal(events),
      prepareWorkflow: async () => retryingWorkflow(),
      sign: async () => SIGNATURE,
    });

    expect(result).toEqual({
      kind: "unknown",
      retryable: false,
      operationId: "operation-retry",
      reason: "POLYMARKET_GASLESS_MUTATION_AMBIGUOUS",
    });
    expect(submissionCount).toBe(1);
    expect(events).toContain("unknown");
  });

  it.each(["rate limit", "network reset", "timeout", "malformed response"])(
    "maps a %s after submit start to non-retryable UNKNOWN",
    async (message) => {
      const events: string[] = [];
      let submissionCount = 0;

      async function* failingWorkflow() {
        yield { kind: "requestAddress" };
        yield { kind: "signGaslessMessage", payload: `0x${"44".repeat(32)}` };
        submissionCount += 1;
        throw new Error(message);
      }

      const result = await drivePolymarketGaslessMutationOnce({
        operationId: `operation-${message}`,
        signerAddress: SIGNER,
        journal: journal(events),
        prepareWorkflow: async () => failingWorkflow(),
        sign: async () => SIGNATURE,
      });

      expect(result.kind).toBe("unknown");
      expect(result).toMatchObject({ retryable: false });
      expect(submissionCount).toBe(1);
      expect(events.filter((event) => event === "submit-started")).toHaveLength(1);
      expect(events.filter((event) => event === "unknown")).toHaveLength(1);
    },
  );

  it("does not prepare or submit an already-claimed durable operation", async () => {
    const events: string[] = [];
    const prepareWorkflow = vi.fn();

    const result = await drivePolymarketGaslessMutationOnce({
      operationId: "operation-duplicate",
      signerAddress: SIGNER,
      journal: journal(events, "already_claimed"),
      prepareWorkflow,
      sign: vi.fn(),
    });

    expect(result).toMatchObject({ kind: "unknown", retryable: false });
    expect(prepareWorkflow).not.toHaveBeenCalled();
    expect(events).toEqual(["claim"]);
  });

  it("cannot submit when durable submit-start persistence fails", async () => {
    const events: string[] = [];
    const mutationJournal = journal(events);
    mutationJournal.persistSubmitStarted = vi.fn(async () => {
      events.push("submit-persistence-failed");
      throw new Error("database unavailable");
    });
    let submissionCount = 0;

    async function* workflow() {
      yield { kind: "requestAddress" };
      yield { kind: "signGaslessTypedData", payload: { nonce: 1n } };
      submissionCount += 1;
      return { transactionHash: TRANSACTION_HASH, transactionId: "unexpected" };
    }

    await expect(
      drivePolymarketGaslessMutationOnce({
        operationId: "operation-persist-failure",
        signerAddress: SIGNER,
        journal: mutationJournal,
        prepareWorkflow: async () => workflow(),
        sign: async () => SIGNATURE,
      }),
    ).rejects.toThrow("database unavailable");
    expect(submissionCount).toBe(0);
    expect(events).not.toContain("unknown");
  });

  it("fails closed on malformed workflow steps and locators", async () => {
    const malformedSteps = [
      async function* () {
        yield { kind: "notRequestAddress" };
      },
      async function* () {
        yield { kind: "requestAddress" };
        yield { kind: "signGaslessTypedData" };
      },
      async function* () {
        yield { kind: "requestAddress" };
        yield {
          kind: "signGaslessTypedData",
          payload: { uncloneable: () => undefined },
        };
      },
      async function* () {
        yield { kind: "requestAddress" };
        yield { kind: "signGaslessTypedData", payload: {} };
        return { transactionHash: null, transactionId: null };
      },
    ];

    for (const [index, createWorkflow] of malformedSteps.entries()) {
      const events: string[] = [];
      const result = await drivePolymarketGaslessMutationOnce({
        operationId: `operation-malformed-${index}`,
        signerAddress: SIGNER,
        journal: journal(events),
        prepareWorkflow: async () => createWorkflow(),
        sign: async () => SIGNATURE,
      });

      expect(result).toMatchObject({ kind: "unknown", retryable: false });
      expect(events).toContain("unknown");
    }
  });
});
