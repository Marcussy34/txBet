import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it, vi } from "vitest";

import type { AtomicAmount } from "@/core/live-money";
import type { DflowLiveOrder } from "@/execution/venues/dflow/live-order";
import type { InspectedDflowTransaction } from "@/execution/venues/dflow/live-transaction";
import type { VercelDflowCanaryEnv } from "@/server/config/env";
import {
  BlobJournalConflictError,
  readBlobJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";
import {
  DflowCanaryError,
  submitDflowCanaryOrder,
  type DflowCanaryDependencies,
} from "@/server/execution/dflow-canary-service";
import type { DflowPrivySigner } from "@/server/execution/dflow-privy-signer";
import { updateVercelExecutionControl } from "@/server/execution/vercel-control";

const PROFILE_ID = "did:privy:user-1";
const NOW = 1_784_270_000_000;
const WALLET = new PublicKey(Uint8Array.from({ length: 32 }, () => 3)).toBase58();
const OUTCOME = new PublicKey(Uint8Array.from({ length: 32 }, () => 4)).toBase58();
const PROGRAM = new PublicKey(Uint8Array.from({ length: 32 }, () => 5)).toBase58();
const BLOCKHASH = new PublicKey(Uint8Array.from({ length: 32 }, () => 6)).toBase58();
const SIGNATURE = bs58.encode(Uint8Array.from({ length: 64 }, () => 7));
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function memoryStore(): BlobJournalObjectStore {
  const objects = new Map<string, { body: string; etag: string }>();
  let revision = 0;
  return {
    async read(pathname) {
      const current = objects.get(pathname);
      return current ? { ...current } : null;
    },
    async create(pathname, body) {
      if (objects.has(pathname)) throw new BlobJournalConflictError();
      const etag = `etag-${++revision}`;
      objects.set(pathname, { body, etag });
      return { etag };
    },
    async replace(pathname, body, expectedEtag) {
      const current = objects.get(pathname);
      if (current?.etag !== expectedEtag) throw new BlobJournalConflictError();
      const etag = `etag-${++revision}`;
      objects.set(pathname, { body, etag });
      return { etag };
    },
  };
}

function env(): VercelDflowCanaryEnv {
  return {
    DFLOW_API_KEY: "dflow-secret",
    DFLOW_LIVE_SLIPPAGE_BPS: 50,
    DFLOW_LIVE_PREDICTION_MARKET_SLIPPAGE_BPS: 100,
    DFLOW_MAX_PRIORITY_FEE_LAMPORTS: "100000",
    DFLOW_MAX_INIT_COST_LAMPORTS: "3000000",
    DFLOW_BASE_FEE_LAMPORTS: "5000",
    SOLANA_RPC_URL: "https://solana.example/rpc?api-key=secret",
    SOLANA_NATIVE_USD_UPPER_BOUND_MICROS: "1000000000",
    CANARY_MAX_TOTAL_MICROS: 10_000_000,
    dflowProgramAllowlist: [PROGRAM],
    dflowWorldCupBindings: {
      schemaVersion: "txbet-dflow-world-cup-bindings-v1",
      bindings: [{
        id: "world-cup-winner-argentina-yes",
        competition: "fifa-world-cup",
        edition: 2026,
        title: "Will Argentina win the 2026 FIFA World Cup?",
        outcome: "YES",
        marketKey: "kalshi-world-cup-winner-argentina",
        outcomeMint: OUTCOME,
        evidenceUrl: "https://example.test/evidence",
        evidenceHash: HASH_A,
        reviewedAtMs: NOW - 1_000,
        validUntilMs: NOW + 86_400_000,
        bindingHash: HASH_B,
      }],
    },
  } as unknown as VercelDflowCanaryEnv;
}

async function armedStore(): Promise<BlobJournalObjectStore> {
  const store = memoryStore();
  await updateVercelExecutionControl({
    store,
    profileId: PROFILE_ID,
    nowMs: NOW - 1_000,
    input: {
      expectedVersion: 0,
      mode: "canary",
      maxTotalMicros: 10_000_000,
      expiresAtMs: NOW + 86_400_000,
      confirmRealMoney: true,
    },
  });
  return store;
}

function harness(store: BlobJournalObjectStore) {
  const stages: string[] = [];
  const quote: DflowLiveOrder = {
    inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    inputAtomic: "1000000" as AtomicAmount,
    outputMint: OUTCOME,
    expectedOutputAtomic: "600000" as AtomicAmount,
    minimumOutputAtomic: "500000" as AtomicAmount,
    executionMode: "async",
    contextSlot: 100,
    lastValidBlockHeight: 500,
    transactionBase64: "AAAA",
    computeUnitLimit: 200_000,
    prioritizationFeeLamports: 200,
    initPredictionMarketCostLamports: 0,
    predictionMarketInitPayerMustSign: false,
    slippageBps: 50,
    predictionMarketSlippageBps: 100,
  };
  const inspected: InspectedDflowTransaction = {
    transactionBase64: "AAAA",
    transactionHash: HASH_A,
    messageBase64: "AQ==",
    messageHash: HASH_B,
    walletAddress: WALLET,
    inputTokenAccount: new PublicKey(Uint8Array.from({ length: 32 }, () => 8)).toBase58(),
    outputTokenAccount: new PublicKey(Uint8Array.from({ length: 32 }, () => 9)).toBase58(),
    recentBlockhash: BLOCKHASH,
    computeUnitLimit: 200_000,
    computeUnitPriceMicroLamports: "1000",
    priorityFeeLamports: "200",
    programIds: [PROGRAM],
  };
  const resolveWallet = vi.fn(async () => {
    stages.push("wallet");
    return { id: "wallet-1", address: WALLET, userId: PROFILE_ID };
  });
  const signTransaction = vi.fn(async ({ wallet }: Parameters<DflowPrivySigner["signTransaction"]>[0]) => {
    stages.push("sign");
    return { wallet, signedTransactionBase64: "BBBB" };
  });
  const signer: DflowPrivySigner = { resolveWallet, signTransaction };
  const fetchQuote = vi.fn(async () => {
    stages.push("quote");
    return quote;
  });
  const inspectTransaction = vi.fn(() => {
    stages.push("inspect");
    return inspected;
  });
  const validateSignedTransaction = vi.fn(async () => {
    stages.push("validate-signature");
    return { transactionBase64: "BBBB", transactionHash: HASH_A, signature: SIGNATURE };
  });
  const simulateTransaction = vi.fn(async () => {
    stages.push("simulate");
    return { contextSlot: 101, unitsConsumed: 190_000 };
  });
  const getBlockHeight = vi.fn(async () => {
    stages.push("block-height");
    return 499;
  });
  const submitTransaction = vi.fn(async () => {
    stages.push("send");
    const journal = await readBlobJournal(store, PROFILE_ID);
    expect(journal.events.some((event) => event.kind === "DFLOW_SUBMIT_STARTED")).toBe(true);
    return { state: "submitted" as const, signature: SIGNATURE };
  });
  const dependencies: DflowCanaryDependencies = {
    now: () => NOW,
    fetchQuote,
    inspectTransaction,
    validateSignedTransaction,
    simulateTransaction,
    getBlockHeight,
    submitTransaction,
  };
  return {
    signer,
    dependencies,
    stages,
    mocks: {
      fetchQuote,
      inspectTransaction,
      validateSignedTransaction,
      simulateTransaction,
      getBlockHeight,
      submitTransaction,
    },
  };
}

const order = {
  bindingId: "world-cup-winner-argentina-yes",
  amountMicros: 1_000_000,
  minimumOutputAtomic: "500000",
  expectedControlVersion: 1,
  confirmRealMoney: true,
};

describe("manual DFlow canary service", () => {
  it("persists preparation, signs, simulates, claims, then submits exactly once", async () => {
    const store = await armedStore();
    const test = harness(store);

    await expect(submitDflowCanaryOrder({
      store,
      env: env(),
      signer: test.signer,
      profileId: PROFILE_ID,
      idempotencyKey: "order-1",
      order,
      dependencies: test.dependencies,
    })).resolves.toMatchObject({
      state: "submitted",
      signature: SIGNATURE,
      amountMicros: 1_000_000,
      riskMicros: 1_005_200,
    });
    expect(test.stages).toEqual([
      "wallet",
      "quote",
      "inspect",
      "inspect",
      "sign",
      "validate-signature",
      "simulate",
      "block-height",
      "block-height",
      "send",
    ]);
    const journal = await readBlobJournal(store, PROFILE_ID);
    expect(journal.events.map((event) => event.kind)).toEqual([
      "CONTROL_UPDATED",
      "DFLOW_ORDER_PREPARED",
      "DFLOW_SUBMIT_STARTED",
      "DFLOW_SUBMIT_ACK",
    ]);
  });

  it("allows one send under an identical race and makes later replay read-only", async () => {
    const store = await armedStore();
    const test = harness(store);
    const execute = () => submitDflowCanaryOrder({
      store,
      env: env(),
      signer: test.signer,
      profileId: PROFILE_ID,
      idempotencyKey: "same-order",
      order,
      dependencies: test.dependencies,
    });

    const raced = await Promise.all([execute(), execute()]);
    expect(raced.map((result) => result.state).sort()).toEqual(["submitted", "unknown"]);
    expect(test.mocks.submitTransaction).toHaveBeenCalledTimes(1);
    const replay = await execute();
    expect(replay.state).toBe("submitted");
    expect(test.mocks.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a reused key with another request before any second quote or signing", async () => {
    const store = await armedStore();
    const test = harness(store);
    const execute = (amountMicros: number) => submitDflowCanaryOrder({
      store,
      env: env(),
      signer: test.signer,
      profileId: PROFILE_ID,
      idempotencyKey: "fixed-key",
      order: { ...order, amountMicros },
      dependencies: test.dependencies,
    });
    await execute(1_000_000);
    const error = await execute(2_000_000).catch((caught) => caught as unknown);
    expect(error).toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(test.mocks.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it("rechecks control inside the claim and never sends after authority is revoked", async () => {
    const store = await armedStore();
    const test = harness(store);
    const dependencies: DflowCanaryDependencies = {
      ...test.dependencies,
      simulateTransaction: vi.fn(async () => {
        await updateVercelExecutionControl({
          store,
          profileId: PROFILE_ID,
          nowMs: NOW,
          input: {
            expectedVersion: 1,
            mode: "disabled",
            maxTotalMicros: 0,
            expiresAtMs: null,
            confirmRealMoney: false,
          },
        });
        return { contextSlot: 101, unitsConsumed: 1 };
      }),
    };

    const error = await submitDflowCanaryOrder({
      store,
      env: env(),
      signer: test.signer,
      profileId: PROFILE_ID,
      idempotencyKey: "revoked-order",
      order,
      dependencies,
    }).catch((caught) => caught as unknown);
    expect(error).toBeInstanceOf(DflowCanaryError);
    expect(error).toMatchObject({ code: "CONTROL_OR_BUDGET_REJECTED" });
    expect(test.mocks.submitTransaction).not.toHaveBeenCalled();
  });
});
