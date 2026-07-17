import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import { parseAtomicAmount } from "@/core/live-money";
import {
  inspectUnsignedDflowTransaction,
  validatePrivySignedDflowTransaction,
  type InspectedDflowTransaction,
} from "@/execution/venues/dflow/live-transaction";
import {
  resolveCurrentDflowWorldCupBinding,
  type DflowWorldCupBinding,
} from "@/execution/venues/dflow/live-binding";
import { DFLOW_CANONICAL_SOLANA_USDC_MINT } from "@/execution/venues/dflow/live-order";
import { assertFreshBlockHeight } from "@/execution/venues/dflow/bounds";
import type { VercelDflowCanaryEnv } from "@/server/config/env";
import {
  appendBlobJournalEvent,
  claimBlobJournalEvent,
  readBlobJournal,
  type BlobExecutionJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";
import {
  assertDflowCanaryClaimBudget,
  calculateDflowRiskMicros,
} from "@/server/execution/dflow-canary-budget";
import {
  fetchDflowLiveQuote,
  type DflowLiveQuoteConfig,
} from "@/server/execution/dflow-live-quote";
import {
  type DflowPrivySigner,
  PrivyDflowSignerError,
} from "@/server/execution/dflow-privy-signer";
import {
  DflowSubmissionUnknownError,
  getDflowSolanaBlockHeight,
  simulateDflowSignedTransaction,
  submitDflowSignedTransactionOnce,
} from "@/server/execution/dflow-solana-rpc";
import { DFLOW_SIGNED_RESPONSE_PUBLIC_KEY } from "@/server/execution/dflow-signed-response";
import { z } from "zod";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const OPERATION_ID = /^[a-f0-9]{64}$/;
const CANONICAL_POSITIVE_ATOMIC = /^[1-9][0-9]*$/;
const PLATFORM_CANARY_CEILING_MICROS = 10_000_000;

export const dflowCanaryOrderInputSchema = z.strictObject({
  bindingId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  amountMicros: z.number().int().positive().safe().max(PLATFORM_CANARY_CEILING_MICROS),
  minimumOutputAtomic: z.string().regex(CANONICAL_POSITIVE_ATOMIC).max(20),
  expectedControlVersion: z.number().int().positive().safe(),
  confirmRealMoney: z.literal(true),
});

export type DflowCanaryOrderInput = Readonly<z.infer<typeof dflowCanaryOrderInputSchema>>;

const preparedSchema = z.strictObject({
  schemaVersion: z.literal("txbet-dflow-order-prepared-v1"),
  operationId: z.string().regex(OPERATION_ID),
  requestHash: z.string().regex(HASH),
  bindingId: z.string().min(1).max(120),
  bindingHash: z.string().regex(HASH),
  marketKey: z.string().min(1).max(240),
  controlVersion: z.number().int().positive().safe(),
  amountMicros: z.number().int().positive().safe(),
  minimumOutputAtomic: z.string().regex(CANONICAL_POSITIVE_ATOMIC),
  expectedOutputAtomic: z.string().regex(CANONICAL_POSITIVE_ATOMIC),
  quotedMinimumOutputAtomic: z.string().regex(CANONICAL_POSITIVE_ATOMIC),
  walletId: z.string().min(1).max(256),
  walletAddress: z.string().min(32).max(44),
  inputTokenAccount: z.string().min(32).max(44),
  outputTokenAccount: z.string().min(32).max(44),
  writableAccountAddresses: z.array(z.string().min(32).max(44)).min(1).max(64),
  transactionBase64: z.string().min(1).max(2_000),
  transactionHash: z.string().regex(HASH),
  messageHash: z.string().regex(HASH),
  recentBlockhash: z.string().min(32).max(44),
  contextSlot: z.number().int().nonnegative().safe(),
  lastValidBlockHeight: z.number().int().nonnegative().safe(),
  computeUnitLimit: z.number().int().positive().safe(),
  priorityFeeLamports: z.string().regex(/^(0|[1-9][0-9]*)$/),
  initCostLamports: z.string().regex(/^(0|[1-9][0-9]*)$/),
  totalLamports: z.string().regex(/^(0|[1-9][0-9]*)$/),
  networkCostMicros: z.number().int().nonnegative().safe(),
  riskMicros: z.number().int().positive().safe(),
  programIds: z.array(z.string().min(32).max(44)).min(1).max(64),
  privyIdempotencyKey: z.string().min(1).max(128),
  preparedAtMs: z.number().int().nonnegative().safe(),
});

type PreparedOrder = Readonly<z.infer<typeof preparedSchema>>;

const submitStartedSchema = z.strictObject({
  schemaVersion: z.literal("txbet-dflow-submit-started-v1"),
  operationId: z.string().regex(OPERATION_ID),
  requestHash: z.string().regex(HASH),
  bindingId: z.string().min(1).max(120),
  bindingHash: z.string().regex(HASH),
  controlVersion: z.number().int().positive().safe(),
  amountMicros: z.number().int().positive().safe(),
  riskMicros: z.number().int().positive().safe(),
  transactionHash: z.string().regex(HASH),
  messageHash: z.string().regex(HASH),
  signature: z.string().min(64).max(128),
  recentBlockhash: z.string().min(32).max(44),
  lastValidBlockHeight: z.number().int().nonnegative().safe(),
  contextSlot: z.number().int().nonnegative().safe(),
  startedAtMs: z.number().int().nonnegative().safe(),
});

type SubmitStarted = Readonly<z.infer<typeof submitStartedSchema>>;

const terminalSchema = z.strictObject({
  schemaVersion: z.enum(["txbet-dflow-submit-ack-v1", "txbet-dflow-submit-unknown-v1"]),
  operationId: z.string().regex(OPERATION_ID),
  signature: z.string().min(64).max(128),
  observedAtMs: z.number().int().nonnegative().safe(),
});

export interface DflowCanaryOrderResult {
  readonly schemaVersion: "txbet-dflow-canary-result-v1";
  readonly operationId: string;
  readonly state: "submitted" | "unknown";
  readonly signature: string;
  readonly bindingId: string;
  readonly amountMicros: number;
  readonly riskMicros: number;
}

export type DflowCanaryErrorCode =
  | "CONTROL_OR_BUDGET_REJECTED"
  | "IDEMPOTENCY_CONFLICT"
  | "JOURNAL_UNAVAILABLE"
  | "QUOTE_REJECTED"
  | "SIGNER_NOT_READY"
  | "SIGNING_REJECTED"
  | "SIMULATION_REJECTED";

export class DflowCanaryError extends Error {
  readonly code: DflowCanaryErrorCode;
  readonly status: number;

  constructor(code: DflowCanaryErrorCode, status: number) {
    super("DFlow canary order was refused");
    this.name = "DflowCanaryError";
    this.code = code;
    this.status = status;
  }
}

export interface DflowCanaryDependencies {
  readonly now?: () => number;
  readonly fetchQuote?: typeof fetchDflowLiveQuote;
  readonly inspectTransaction?: typeof inspectUnsignedDflowTransaction;
  readonly validateSignedTransaction?: typeof validatePrivySignedDflowTransaction;
  readonly simulateTransaction?: typeof simulateDflowSignedTransaction;
  readonly getBlockHeight?: typeof getDflowSolanaBlockHeight;
  readonly submitTransaction?: typeof submitDflowSignedTransactionOnce;
}

/** Manual exact-input canary. Cron and the paired strategy do not call this service. */
export async function submitDflowCanaryOrder(input: {
  readonly store: BlobJournalObjectStore;
  readonly env: VercelDflowCanaryEnv;
  readonly signer: DflowPrivySigner;
  readonly profileId: string;
  readonly idempotencyKey: string;
  readonly order: unknown;
  readonly dependencies?: DflowCanaryDependencies;
}): Promise<DflowCanaryOrderResult> {
  if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
    throw new DflowCanaryError("IDEMPOTENCY_CONFLICT", 409);
  }
  const order = dflowCanaryOrderInputSchema.parse(input.order);
  const requestHash = `sha256:${sha256Canonical(order)}`;
  const operationId = sha256Canonical({
    hashDomain: "txbet:dflow-canary-operation:v1",
    profileId: input.profileId,
    idempotencyKey: input.idempotencyKey,
  });
  const ids = operationEventIds(operationId);
  const now = input.dependencies?.now ?? Date.now;

  let journal: BlobExecutionJournal;
  try {
    journal = await readBlobJournal(input.store, input.profileId);
  } catch {
    throw new DflowCanaryError("JOURNAL_UNAVAILABLE", 503);
  }
  const existingStart = eventPayload(journal, ids.started, "DFLOW_SUBMIT_STARTED");
  if (existingStart !== null) {
    const started = submitStartedSchema.parse(existingStart);
    assertSameRequest(started.requestHash, requestHash);
    return resultFromStarted(journal, ids, started);
  }

  const initialNow = checkedNow(now());
  try {
    assertDflowCanaryClaimBudget({
      journal,
      expectedControlVersion: order.expectedControlVersion,
      riskMicros: order.amountMicros,
      configuredMaxTotalMicros: input.env.CANARY_MAX_TOTAL_MICROS,
      nowMs: initialNow,
    });
  } catch {
    throw new DflowCanaryError("CONTROL_OR_BUDGET_REJECTED", 409);
  }
  const binding = resolveBinding(input.env, order.bindingId, initialNow);

  let wallet: Awaited<ReturnType<DflowPrivySigner["resolveWallet"]>>;
  try {
    wallet = await input.signer.resolveWallet(input.profileId);
  } catch {
    throw new DflowCanaryError("SIGNER_NOT_READY", 409);
  }

  const prepared = await resolveOrPrepare({
    ...input,
    order,
    requestHash,
    operationId,
    preparedEventId: ids.prepared,
    binding,
    wallet,
    initialJournal: journal,
    preparedAtMs: initialNow,
  });

  // A persisted preparation can outlive its control. Recheck before Privy signs.
  try {
    journal = await readBlobJournal(input.store, input.profileId);
    assertDflowCanaryClaimBudget({
      journal,
      expectedControlVersion: order.expectedControlVersion,
      riskMicros: prepared.order.riskMicros,
      configuredMaxTotalMicros: input.env.CANARY_MAX_TOTAL_MICROS,
      nowMs: checkedNow(now()),
    });
  } catch {
    throw new DflowCanaryError("CONTROL_OR_BUDGET_REJECTED", 409);
  }

  let signedBase64: string;
  try {
    const signed = await input.signer.signTransaction({
      wallet,
      unsignedTransactionBase64: prepared.order.transactionBase64,
      idempotencyKey: prepared.order.privyIdempotencyKey,
    });
    if (
      signed.wallet.id !== prepared.order.walletId ||
      signed.wallet.address !== prepared.order.walletAddress
    ) {
      throw new Error("wallet changed");
    }
    signedBase64 = signed.signedTransactionBase64;
  } catch (error) {
    const code = error instanceof PrivyDflowSignerError &&
      ["WALLET_CHANGED", "WALLET_NOT_ELIGIBLE"].includes(error.code)
      ? "SIGNER_NOT_READY"
      : "SIGNING_REJECTED";
    throw new DflowCanaryError(code, 409);
  }

  let signed: Awaited<ReturnType<typeof validatePrivySignedDflowTransaction>>;
  try {
    signed = await (input.dependencies?.validateSignedTransaction ??
      validatePrivySignedDflowTransaction)({
      signedTransactionBase64: signedBase64,
      inspected: prepared.inspected,
    });
  } catch {
    throw new DflowCanaryError("SIGNING_REJECTED", 409);
  }

  try {
    await (input.dependencies?.simulateTransaction ?? simulateDflowSignedTransaction)({
      rpcUrl: input.env.SOLANA_RPC_URL,
      transactionBase64: signed.transactionBase64,
      minimumContextSlot: prepared.order.contextSlot,
      operationId,
      balanceGuard: {
        walletAddress: prepared.order.walletAddress,
        inputTokenAccount: prepared.order.inputTokenAccount,
        outputTokenAccount: prepared.order.outputTokenAccount,
        writableAccountAddresses: prepared.order.writableAccountAddresses,
        inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
        outputMint: binding.outcomeMint,
        expectedInputDebitAtomic: String(prepared.order.amountMicros),
        // DFlow's accepted async order may mint the outcome after this Solana
        // transaction. The signed quote protects its floor; simulation proves
        // only the immediate user debits that enforce the spend ceiling.
        minimumOutputCreditAtomic: "0",
        maximumLamportDebit: prepared.order.totalLamports,
      },
    });
  } catch {
    throw new DflowCanaryError("SIMULATION_REJECTED", 422);
  }

  let currentBlockHeight: number;
  try {
    currentBlockHeight = await (input.dependencies?.getBlockHeight ??
      getDflowSolanaBlockHeight)({
      rpcUrl: input.env.SOLANA_RPC_URL,
      operationId,
    });
    assertFreshBlockHeight(currentBlockHeight, prepared.order.lastValidBlockHeight);
  } catch {
    throw new DflowCanaryError("SIMULATION_REJECTED", 422);
  }

  const claimNow = checkedNow(now());
  const started: SubmitStarted = Object.freeze({
    schemaVersion: "txbet-dflow-submit-started-v1",
    operationId,
    requestHash,
    bindingId: prepared.order.bindingId,
    bindingHash: prepared.order.bindingHash,
    controlVersion: order.expectedControlVersion,
    amountMicros: order.amountMicros,
    riskMicros: prepared.order.riskMicros,
    transactionHash: signed.transactionHash,
    messageHash: prepared.order.messageHash,
    signature: signed.signature,
    recentBlockhash: prepared.order.recentBlockhash,
    lastValidBlockHeight: prepared.order.lastValidBlockHeight,
    contextSlot: prepared.order.contextSlot,
    startedAtMs: claimNow,
  });

  let claim;
  try {
    claim = await claimBlobJournalEvent({
      store: input.store,
      profileId: input.profileId,
      event: {
        id: ids.started,
        kind: "DFLOW_SUBMIT_STARTED",
        occurredAtMs: claimNow,
        payload: started as unknown as JsonValue,
      },
      validate(latest) {
        const validationNow = checkedNow(now());
        const currentBinding = resolveBinding(input.env, order.bindingId, validationNow);
        const latestPrepared = preparedSchema.parse(
          eventPayloadRequired(latest, ids.prepared, "DFLOW_ORDER_PREPARED"),
        );
        if (
          latestPrepared.requestHash !== requestHash ||
          latestPrepared.transactionHash !== prepared.order.transactionHash ||
          latestPrepared.bindingHash !== currentBinding.bindingHash
        ) {
          throw new Error("DFlow preparation changed before claim");
        }
        assertDflowCanaryClaimBudget({
          journal: latest,
          expectedControlVersion: order.expectedControlVersion,
          riskMicros: prepared.order.riskMicros,
          configuredMaxTotalMicros: input.env.CANARY_MAX_TOTAL_MICROS,
          nowMs: validationNow,
        });
      },
    });
  } catch {
    // A concurrent identical request can win with a different millisecond in
    // its claim evidence. Recover the persisted winner without another send.
    try {
      const recovered = await readBlobJournal(input.store, input.profileId);
      const recoveredPayload = eventPayload(
        recovered,
        ids.started,
        "DFLOW_SUBMIT_STARTED",
      );
      if (recoveredPayload !== null) {
        const recoveredStart = submitStartedSchema.parse(recoveredPayload);
        assertSameRequest(recoveredStart.requestHash, requestHash);
        return resultFromStarted(recovered, ids, recoveredStart);
      }
    } catch (recoveryError) {
      if (recoveryError instanceof DflowCanaryError) throw recoveryError;
    }
    throw new DflowCanaryError("CONTROL_OR_BUDGET_REJECTED", 409);
  }
  if (claim.status === "already_started") {
    const persisted = submitStartedSchema.parse(
      eventPayloadRequired(claim.journal, ids.started, "DFLOW_SUBMIT_STARTED"),
    );
    assertSameRequest(persisted.requestHash, requestHash);
    return resultFromStarted(claim.journal, ids, persisted);
  }

  // Blob CAS retries can cross the quote's last valid height. Re-read after the
  // winning claim and refuse to send an expired transaction.
  try {
    const postClaimHeight = await (input.dependencies?.getBlockHeight ??
      getDflowSolanaBlockHeight)({
      rpcUrl: input.env.SOLANA_RPC_URL,
      operationId,
    });
    assertFreshBlockHeight(postClaimHeight, prepared.order.lastValidBlockHeight);
  } catch {
    await appendTerminalBestEffort({
      store: input.store,
      profileId: input.profileId,
      eventId: ids.unknown,
      kind: "DFLOW_SUBMIT_UNKNOWN",
      schemaVersion: "txbet-dflow-submit-unknown-v1",
      operationId,
      signature: signed.signature,
      observedAtMs: checkedNow(now()),
    });
    return publicResult(started, "unknown");
  }

  try {
    await (input.dependencies?.submitTransaction ?? submitDflowSignedTransactionOnce)({
      rpcUrl: input.env.SOLANA_RPC_URL,
      transactionBase64: signed.transactionBase64,
      expectedSignature: signed.signature,
      minimumContextSlot: prepared.order.contextSlot,
      operationId,
    });
  } catch (error) {
    // Every post-claim failure is ambiguous, even if an injected adapter did not
    // use the production error class. Never offer an automatic resubmission.
    void (error instanceof DflowSubmissionUnknownError);
    await appendTerminalBestEffort({
      store: input.store,
      profileId: input.profileId,
      eventId: ids.unknown,
      kind: "DFLOW_SUBMIT_UNKNOWN",
      schemaVersion: "txbet-dflow-submit-unknown-v1",
      operationId,
      signature: signed.signature,
      observedAtMs: checkedNow(now()),
    });
    return publicResult(started, "unknown");
  }

  try {
    await appendTerminal({
      store: input.store,
      profileId: input.profileId,
      eventId: ids.ack,
      kind: "DFLOW_SUBMIT_ACK",
      schemaVersion: "txbet-dflow-submit-ack-v1",
      operationId,
      signature: signed.signature,
      observedAtMs: checkedNow(now()),
    });
    return publicResult(started, "submitted");
  } catch {
    // The packet may be accepted but the durable ACK failed. Keep the public
    // result UNKNOWN; the existing submit-started claim blocks another send.
    return publicResult(started, "unknown");
  }
}

async function resolveOrPrepare(input: {
  readonly store: BlobJournalObjectStore;
  readonly env: VercelDflowCanaryEnv;
  readonly signer: DflowPrivySigner;
  readonly profileId: string;
  readonly order: DflowCanaryOrderInput;
  readonly requestHash: string;
  readonly operationId: string;
  readonly preparedEventId: string;
  readonly binding: DflowWorldCupBinding;
  readonly wallet: Awaited<ReturnType<DflowPrivySigner["resolveWallet"]>>;
  readonly initialJournal: BlobExecutionJournal;
  readonly preparedAtMs: number;
  readonly dependencies?: DflowCanaryDependencies;
}): Promise<Readonly<{ order: PreparedOrder; inspected: InspectedDflowTransaction }>> {
  const existing = eventPayload(
    input.initialJournal,
    input.preparedEventId,
    "DFLOW_ORDER_PREPARED",
  );
  if (existing !== null) {
    return validatePrepared(preparedSchema.parse(existing), input);
  }

  let quote;
  try {
    quote = await (input.dependencies?.fetchQuote ?? fetchDflowLiveQuote)(
      {
        requestId: input.operationId,
        userWallet: input.wallet.address,
        outputMint: input.binding.outcomeMint,
        amountAtomic: parseAtomicAmount(String(input.order.amountMicros)),
        minimumOutputAtomic: parseAtomicAmount(input.order.minimumOutputAtomic),
      },
      liveQuoteConfig(input.env),
      { clock: input.dependencies?.now ?? Date.now },
    );
  } catch {
    throw new DflowCanaryError("QUOTE_REJECTED", 422);
  }

  let inspected: InspectedDflowTransaction;
  try {
    inspected = (input.dependencies?.inspectTransaction ??
      inspectUnsignedDflowTransaction)({
      transactionBase64: quote.transactionBase64,
      walletAddress: input.wallet.address,
      inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
      outputMint: input.binding.outcomeMint,
      allowedProgramIds: input.env.dflowProgramAllowlist,
    });
    if (
      inspected.computeUnitLimit !== quote.computeUnitLimit ||
      inspected.priorityFeeLamports !== String(quote.prioritizationFeeLamports)
    ) {
      throw new Error("DFlow quote and transaction fee controls disagree");
    }
  } catch {
    throw new DflowCanaryError("QUOTE_REJECTED", 422);
  }

  const risk = calculateDflowRiskMicros({
    amountMicros: input.order.amountMicros,
    priorityFeeLamports: inspected.priorityFeeLamports,
    initCostLamports: String(quote.initPredictionMarketCostLamports),
    baseFeeLamports: input.env.DFLOW_BASE_FEE_LAMPORTS,
    solUsdUpperBoundMicros: input.env.SOLANA_NATIVE_USD_UPPER_BOUND_MICROS,
  });
  try {
    assertDflowCanaryClaimBudget({
      journal: input.initialJournal,
      expectedControlVersion: input.order.expectedControlVersion,
      riskMicros: risk.riskMicros,
      configuredMaxTotalMicros: input.env.CANARY_MAX_TOTAL_MICROS,
      nowMs: input.preparedAtMs,
    });
  } catch {
    throw new DflowCanaryError("CONTROL_OR_BUDGET_REJECTED", 409);
  }

  const prepared: PreparedOrder = Object.freeze({
    schemaVersion: "txbet-dflow-order-prepared-v1",
    operationId: input.operationId,
    requestHash: input.requestHash,
    bindingId: input.binding.id,
    bindingHash: input.binding.bindingHash,
    marketKey: input.binding.marketKey,
    controlVersion: input.order.expectedControlVersion,
    amountMicros: input.order.amountMicros,
    minimumOutputAtomic: input.order.minimumOutputAtomic,
    expectedOutputAtomic: quote.expectedOutputAtomic,
    quotedMinimumOutputAtomic: quote.minimumOutputAtomic,
    walletId: input.wallet.id,
    walletAddress: input.wallet.address,
    inputTokenAccount: inspected.inputTokenAccount,
    outputTokenAccount: inspected.outputTokenAccount,
    writableAccountAddresses: [...inspected.writableAccountAddresses],
    transactionBase64: quote.transactionBase64,
    transactionHash: inspected.transactionHash,
    messageHash: inspected.messageHash,
    recentBlockhash: inspected.recentBlockhash,
    contextSlot: quote.contextSlot,
    lastValidBlockHeight: quote.lastValidBlockHeight,
    computeUnitLimit: inspected.computeUnitLimit,
    priorityFeeLamports: inspected.priorityFeeLamports,
    initCostLamports: String(quote.initPredictionMarketCostLamports),
    totalLamports: risk.totalLamports,
    networkCostMicros: risk.networkCostMicros,
    riskMicros: risk.riskMicros,
    programIds: [...inspected.programIds],
    privyIdempotencyKey: `dflow:${input.operationId}`,
    preparedAtMs: input.preparedAtMs,
  });

  try {
    const appended = await appendBlobJournalEvent({
      store: input.store,
      profileId: input.profileId,
      event: {
        id: input.preparedEventId,
        kind: "DFLOW_ORDER_PREPARED",
        occurredAtMs: input.preparedAtMs,
        payload: prepared as unknown as JsonValue,
      },
    });
    const persisted = preparedSchema.parse(
      eventPayloadRequired(appended, input.preparedEventId, "DFLOW_ORDER_PREPARED"),
    );
    return validatePrepared(persisted, input);
  } catch (error) {
    if (!/event ID/i.test(String(error))) {
      throw new DflowCanaryError("JOURNAL_UNAVAILABLE", 503);
    }
    try {
      const recovered = await readBlobJournal(input.store, input.profileId);
      const persisted = preparedSchema.parse(
        eventPayloadRequired(recovered, input.preparedEventId, "DFLOW_ORDER_PREPARED"),
      );
      return validatePrepared(persisted, input);
    } catch (recoveryError) {
      if (recoveryError instanceof DflowCanaryError) throw recoveryError;
      throw new DflowCanaryError("IDEMPOTENCY_CONFLICT", 409);
    }
  }
}

function validatePrepared(
  prepared: PreparedOrder,
  input: {
    readonly env: VercelDflowCanaryEnv;
    readonly order: DflowCanaryOrderInput;
    readonly requestHash: string;
    readonly operationId: string;
    readonly binding: DflowWorldCupBinding;
    readonly wallet: Awaited<ReturnType<DflowPrivySigner["resolveWallet"]>>;
    readonly dependencies?: DflowCanaryDependencies;
  },
): Readonly<{ order: PreparedOrder; inspected: InspectedDflowTransaction }> {
  if (
    prepared.operationId !== input.operationId ||
    prepared.requestHash !== input.requestHash ||
    prepared.bindingId !== input.binding.id ||
    prepared.bindingHash !== input.binding.bindingHash ||
    prepared.controlVersion !== input.order.expectedControlVersion ||
    prepared.amountMicros !== input.order.amountMicros ||
    prepared.minimumOutputAtomic !== input.order.minimumOutputAtomic
  ) {
    throw new DflowCanaryError("IDEMPOTENCY_CONFLICT", 409);
  }
  if (
    prepared.walletId !== input.wallet.id ||
    prepared.walletAddress !== input.wallet.address
  ) {
    throw new DflowCanaryError("SIGNER_NOT_READY", 409);
  }

  let inspected: InspectedDflowTransaction;
  try {
    inspected = (input.dependencies?.inspectTransaction ??
      inspectUnsignedDflowTransaction)({
      transactionBase64: prepared.transactionBase64,
      walletAddress: prepared.walletAddress,
      inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
      outputMint: input.binding.outcomeMint,
      allowedProgramIds: input.env.dflowProgramAllowlist,
    });
  } catch {
    throw new DflowCanaryError("QUOTE_REJECTED", 422);
  }
  if (
    inspected.transactionHash !== prepared.transactionHash ||
    inspected.messageHash !== prepared.messageHash ||
    inspected.recentBlockhash !== prepared.recentBlockhash ||
    inspected.inputTokenAccount !== prepared.inputTokenAccount ||
    inspected.outputTokenAccount !== prepared.outputTokenAccount ||
    inspected.writableAccountAddresses.join("\u0000") !==
      prepared.writableAccountAddresses.join("\u0000") ||
    inspected.computeUnitLimit !== prepared.computeUnitLimit ||
    inspected.priorityFeeLamports !== prepared.priorityFeeLamports ||
    inspected.programIds.join("\u0000") !== prepared.programIds.join("\u0000")
  ) {
    throw new DflowCanaryError("QUOTE_REJECTED", 422);
  }
  return Object.freeze({ order: prepared, inspected });
}

function liveQuoteConfig(env: VercelDflowCanaryEnv): DflowLiveQuoteConfig {
  return Object.freeze({
    apiKey: env.DFLOW_API_KEY,
    responsePublicKeyBase58: DFLOW_SIGNED_RESPONSE_PUBLIC_KEY,
    slippageBps: env.DFLOW_LIVE_SLIPPAGE_BPS,
    predictionMarketSlippageBps: env.DFLOW_LIVE_PREDICTION_MARKET_SLIPPAGE_BPS,
    prioritizationFeeMaxLamports: Number(env.DFLOW_MAX_PRIORITY_FEE_LAMPORTS),
    initPredictionMarketCostMaxLamports: Number(env.DFLOW_MAX_INIT_COST_LAMPORTS),
    timeoutMs: 8_000,
  });
}

function resolveBinding(
  env: VercelDflowCanaryEnv,
  bindingId: string,
  nowMs: number,
): DflowWorldCupBinding {
  try {
    return resolveCurrentDflowWorldCupBinding(
      env.dflowWorldCupBindings,
      bindingId,
      nowMs,
    );
  } catch {
    throw new DflowCanaryError("QUOTE_REJECTED", 422);
  }
}

function resultFromStarted(
  journal: BlobExecutionJournal,
  ids: ReturnType<typeof operationEventIds>,
  started: SubmitStarted,
): DflowCanaryOrderResult {
  const ackValue = eventPayload(journal, ids.ack, "DFLOW_SUBMIT_ACK");
  const unknownValue = eventPayload(journal, ids.unknown, "DFLOW_SUBMIT_UNKNOWN");
  if (ackValue !== null && unknownValue !== null) {
    throw new DflowCanaryError("JOURNAL_UNAVAILABLE", 503);
  }
  if (ackValue !== null) {
    const ack = terminalSchema.parse(ackValue);
    if (ack.operationId !== started.operationId || ack.signature !== started.signature) {
      throw new DflowCanaryError("JOURNAL_UNAVAILABLE", 503);
    }
    return publicResult(started, "submitted");
  }
  if (unknownValue !== null) {
    const unknown = terminalSchema.parse(unknownValue);
    if (
      unknown.operationId !== started.operationId ||
      unknown.signature !== started.signature
    ) {
      throw new DflowCanaryError("JOURNAL_UNAVAILABLE", 503);
    }
  }
  return publicResult(started, "unknown");
}

function publicResult(
  started: SubmitStarted,
  state: "submitted" | "unknown",
): DflowCanaryOrderResult {
  return Object.freeze({
    schemaVersion: "txbet-dflow-canary-result-v1",
    operationId: started.operationId,
    state,
    signature: started.signature,
    bindingId: started.bindingId,
    amountMicros: started.amountMicros,
    riskMicros: started.riskMicros,
  });
}

async function appendTerminal(input: {
  readonly store: BlobJournalObjectStore;
  readonly profileId: string;
  readonly eventId: string;
  readonly kind: "DFLOW_SUBMIT_ACK" | "DFLOW_SUBMIT_UNKNOWN";
  readonly schemaVersion: "txbet-dflow-submit-ack-v1" | "txbet-dflow-submit-unknown-v1";
  readonly operationId: string;
  readonly signature: string;
  readonly observedAtMs: number;
}): Promise<void> {
  await appendBlobJournalEvent({
    store: input.store,
    profileId: input.profileId,
    event: {
      id: input.eventId,
      kind: input.kind,
      occurredAtMs: input.observedAtMs,
      payload: {
        schemaVersion: input.schemaVersion,
        operationId: input.operationId,
        signature: input.signature,
        observedAtMs: input.observedAtMs,
      },
    },
  });
}

async function appendTerminalBestEffort(
  input: Parameters<typeof appendTerminal>[0],
): Promise<void> {
  try {
    await appendTerminal(input);
  } catch {
    // The submit-started claim is already durable and remains the fail-closed truth.
  }
}

function eventPayload(
  journal: BlobExecutionJournal,
  id: string,
  expectedKind: string,
): JsonValue | null {
  const event = journal.events.find((candidate) => candidate.id === id);
  if (!event) return null;
  if (event.kind !== expectedKind) {
    throw new DflowCanaryError("JOURNAL_UNAVAILABLE", 503);
  }
  return event.payload;
}

function eventPayloadRequired(
  journal: BlobExecutionJournal,
  id: string,
  expectedKind: string,
): JsonValue {
  const payload = eventPayload(journal, id, expectedKind);
  if (payload === null) throw new DflowCanaryError("JOURNAL_UNAVAILABLE", 503);
  return payload;
}

function assertSameRequest(actual: string, expected: string): void {
  if (actual !== expected) throw new DflowCanaryError("IDEMPOTENCY_CONFLICT", 409);
}

function operationEventIds(operationId: string) {
  return Object.freeze({
    prepared: `dflow:${operationId}:prepared`,
    started: `dflow:${operationId}:submit-started`,
    ack: `dflow:${operationId}:submit-ack`,
    unknown: `dflow:${operationId}:submit-unknown`,
  });
}

function checkedNow(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DflowCanaryError("CONTROL_OR_BUDGET_REJECTED", 409);
  }
  return value;
}
