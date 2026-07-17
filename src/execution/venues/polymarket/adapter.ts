import { OrderSide, OrderType, SignatureType } from "@polymarket/client";
import { z } from "zod";

import {
  sha256Canonical,
  type JsonValue,
} from "@/core/canonical-json";
import {
  equalAtomicAcrossScales,
  equalExactShares,
} from "@/core/live-money";
import type {
  ArtifactExecutionContext,
  BalanceObservation,
  LiveOrderIntent,
  LiveVenueAdapter,
  OrderExecutionContext,
  OrderReconcileClaim,
  PositionObservation,
  PreparedArtifact,
  ReconcileObservation,
  SignedArtifact,
  SubmitObservation,
  VenueReadContext,
} from "@/execution/types";
import {
  createPreparedArtifact,
  createSignedArtifact,
  verifyPreparedArtifact,
  verifySignedArtifact,
} from "@/execution/artifact-hash";
import { deriveSubmissionKey } from "@/execution/idempotency";
import { createLiveOrderIntent } from "@/execution/order-intent";
import {
  beginExactInventorySellSigning,
  completeExactInventorySellSigning,
  type ExactInventorySellTypedEvidence,
  type ExactInventorySellWorkflowExpectation,
  type PolymarketOrderWorkflowBoundary,
} from "@/venues/polymarket/order-workflow";
import { submitPolymarketOrderOnce } from "@/venues/polymarket/reconciliation";
import {
  assertExactSignedInventorySell,
  createExactInventorySellRequest,
  type ExactInventorySellRequest,
} from "@/venues/polymarket/sdk-contract";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

const marketBindingSchema = z.strictObject({
  schemaVersion: z.literal("polymarket-live-market-binding-v1"),
  contractVersionId: z.string().trim().min(1),
  settlementSpecVersionId: z.string().trim().min(1),
  oppositeTokenId: z.string().regex(/^[1-9][0-9]*$/),
  exchangeAddress: address,
  depositWalletAddress: address,
  tickSizeMicros: z.number().int().positive().safe(),
  venueAccountRevision: z.string().trim().min(1),
  evidenceHash: sha256,
});

const typedEvidenceSchema = z.strictObject({
  schemaVersion: z.literal("polymarket-typed-inventory-sell-v1"),
  chainId: z.literal(137),
  exchangeAddress: address,
  maker: address,
  signer: address,
  tokenId: z.string().regex(/^[1-9][0-9]*$/),
  makerAmount: z.string().regex(/^[1-9][0-9]*$/),
  takerAmount: z.string().regex(/^[1-9][0-9]*$/),
  side: z.literal(OrderSide.SELL),
  signatureType: z.literal(SignatureType.POLY_1271),
  salt: z.string().regex(/^(0|[1-9][0-9]*)$/),
  timestamp: z.string().regex(/^(0|[1-9][0-9]*)$/),
  expiration: z.literal(0),
  metadata: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  builder: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  outerDomainName: z.literal("DepositWallet"),
  outerDomainVersion: z.literal("1"),
  outerDomainSalt: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const intentBindingSchema = z.strictObject({
  contractVersionId: z.string().trim().min(1),
  settlementSpecVersionId: z.string().trim().min(1),
  desiredOutcome: z.enum(["YES", "NO"]),
  orderOutcome: z.enum(["YES", "NO"]),
  inventoryLotId: z.string().trim().min(1),
  inventoryLotVersion: z.number().int().positive().safe(),
  inventoryReservationFence: z.number().int().positive().safe(),
  inventoryEvidenceHash: sha256,
  quantityAtomic: z.string().regex(/^[1-9][0-9]*$/),
  quantityScale: z.literal(6),
  quantityEvidenceHash: sha256,
  netOutcomeBoundsHash: sha256,
  feeScheduleVersion: z.string().trim().min(1),
  minimumPriceMicros: z.number().int().positive().safe(),
  minimumProceedsAtomic: z.string().regex(/^[1-9][0-9]*$/),
  maxSpendMicros: z.number().int().nonnegative().safe(),
  expiresAt: z.number().int().nonnegative().safe(),
});

const requestSchema = z.strictObject({
  tokenId: z.string().regex(/^[1-9][0-9]*$/),
  side: z.literal(OrderSide.SELL),
  shares: z.string().regex(/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/),
  minPrice: z.string().regex(/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/),
  orderType: z.literal(OrderType.FOK),
});

const preparedPayloadSchema = z.strictObject({
  schemaVersion: z.literal("polymarket-prepared-exact-inventory-sell-v1"),
  market: marketBindingSchema,
  intent: intentBindingSchema,
  request: requestSchema,
  typedEvidence: typedEvidenceSchema,
});

const locatorSeedSchema = z.strictObject({
  schemaVersion: z.literal("polymarket-locator-seed-v1"),
  attemptKey: z.string().trim().min(1),
  venueAccountRevision: z.string().trim().min(1),
});

type PreparedPayload = Readonly<z.infer<typeof preparedPayloadSchema>>;
type IntentBinding = Readonly<z.infer<typeof intentBindingSchema>>;

export type PolymarketLiveMarketBinding = Readonly<
  z.infer<typeof marketBindingSchema>
>;

export interface PolymarketMarketBindingRequest {
  readonly contractVersionId: string;
  readonly settlementSpecVersionId: string;
  readonly desiredOutcome: "YES" | "NO";
  readonly orderOutcome: "YES" | "NO";
}

export type PolymarketReadinessPhase =
  | "prepare"
  | "validate"
  | "sign"
  | "simulate"
  | "submit";

export interface PolymarketReadinessRequest {
  readonly phase: PolymarketReadinessPhase;
  readonly context: OrderExecutionContext;
  readonly market: PolymarketLiveMarketBinding;
  readonly intent: IntentBinding;
}

export interface PolymarketLiveAdapterBoundary {
  resolveMarket(
    context: OrderExecutionContext,
    request: PolymarketMarketBindingRequest,
  ): Promise<PolymarketLiveMarketBinding>;
  assertReady(request: PolymarketReadinessRequest): Promise<void>;
  prepareMarketOrder(
    context: OrderExecutionContext,
    request: ExactInventorySellRequest,
  ): Promise<PolymarketOrderWorkflowBoundary>;
  signTypedData(
    context: OrderExecutionContext,
    payload: unknown,
  ): Promise<string>;
  postOrder(
    context: ArtifactExecutionContext<OrderExecutionContext>,
    signedOrder: unknown,
  ): Promise<unknown>;
  reconcile(
    context: OrderExecutionContext,
    claim: OrderReconcileClaim,
  ): Promise<ReconcileObservation>;
  balances(context: VenueReadContext): Promise<readonly BalanceObservation[]>;
  positions(context: VenueReadContext): Promise<readonly PositionObservation[]>;
}

interface PendingWorkflow {
  readonly workflow: PolymarketOrderWorkflowBoundary;
  readonly typedPayload: unknown;
  readonly evidence: ExactInventorySellTypedEvidence;
  readonly expected: ExactInventorySellWorkflowExpectation;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function asJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Polymarket evidence numbers must be safe integers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(asJsonValue));
  }
  if (typeof value !== "object") {
    throw new Error("Polymarket evidence must be canonical JSON");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Polymarket evidence must use plain objects");
  }
  const result: Record<string, JsonValue> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new Error("Polymarket evidence cannot contain symbol keys");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error("Polymarket evidence must use enumerable data properties");
    }
    result[key] = asJsonValue(descriptor.value);
  }
  return Object.freeze(result);
}

function marketRequest(intent: IntentBinding): PolymarketMarketBindingRequest {
  return Object.freeze({
    contractVersionId: intent.contractVersionId,
    settlementSpecVersionId: intent.settlementSpecVersionId,
    desiredOutcome: intent.desiredOutcome,
    orderOutcome: intent.orderOutcome,
  });
}

function assertContext(
  context: OrderExecutionContext,
  expiresAt: number,
): void {
  if (
    context.wallet.chain !== "evm" ||
    context.wallet.network !== "polygon" ||
    context.wallet.funderAddress === null ||
    !address.safeParse(context.wallet.address).success ||
    !address.safeParse(context.wallet.funderAddress).success
  ) {
    throw new Error("Polymarket execution requires the bound Polygon deposit wallet");
  }
  if (!Number.isSafeInteger(context.nowMs) || context.nowMs < 0) {
    throw new Error("Polymarket execution time is invalid");
  }
  if (expiresAt <= context.nowMs) {
    throw new Error("Polymarket execution intent has expired");
  }
}

function assertExactIntent(intent: LiveOrderIntent): asserts intent is LiveOrderIntent & {
  readonly acquisitionPath: Extract<
    LiveOrderIntent["acquisitionPath"],
    { readonly kind: "complete-set-sell-complement" }
  >;
} {
  if (intent.acquisitionPath.kind !== "complete-set-sell-complement") {
    throw new Error("Polymarket live execution requires exact inventory");
  }
  const complement = intent.desiredOutcome === "YES" ? "NO" : "YES";
  if (
    intent.acquisitionPath.orderSide !== "SELL" ||
    intent.acquisitionPath.orderOutcome !== complement
  ) {
    throw new Error("Polymarket inventory order must sell the complementary outcome");
  }
  const gross = intent.grossVenueQuantity;
  for (const quantity of [
    intent.minimumNetVenueQuantity,
    intent.maximumNetVenueQuantity,
  ]) {
    if (
      !equalAtomicAcrossScales(
        gross.atomic,
        gross.scale,
        quantity.atomic,
        quantity.scale,
      ) ||
      !equalExactShares(gross.exactShares, quantity.exactShares)
    ) {
      throw new Error("Polymarket live execution requires one exact outcome quantity");
    }
  }
  if (!equalExactShares(gross.exactShares, intent.exactNetShares)) {
    throw new Error("Polymarket exact shares differ from the venue quantity");
  }
}

function minimumProceedsAtomic(intent: LiveOrderIntent): string {
  const product = BigInt(intent.grossVenueQuantity.atomic) *
    BigInt(intent.limitPriceMicros);
  if (product % 1_000_000n !== 0n) {
    throw new Error("Polymarket proceeds floor is not exactly representable");
  }
  const proceeds = product / 1_000_000n;
  if (proceeds <= 0n) throw new Error("Polymarket proceeds floor must be positive");
  return proceeds.toString();
}

function canonicalOrderIntent(input: LiveOrderIntent): LiveOrderIntent {
  const canonical = createLiveOrderIntent(input);
  if (
    sha256Canonical(asJsonValue(canonical)) !==
    sha256Canonical(asJsonValue(input))
  ) {
    throw new Error("Polymarket live order intent must be exactly canonical");
  }
  return canonical;
}

function buildIntentBinding(input: LiveOrderIntent): IntentBinding {
  const intent = canonicalOrderIntent(input);
  assertExactIntent(intent);
  return Object.freeze(intentBindingSchema.parse({
    contractVersionId: intent.contractVersionId,
    settlementSpecVersionId: intent.settlementSpecVersionId,
    desiredOutcome: intent.desiredOutcome,
    orderOutcome: intent.acquisitionPath.orderOutcome,
    inventoryLotId: intent.acquisitionPath.inventoryLotId,
    inventoryLotVersion: intent.acquisitionPath.inventoryLotVersion,
    inventoryReservationFence: intent.acquisitionPath.inventoryReservationFence,
    inventoryEvidenceHash: intent.acquisitionPath.inventoryEvidenceHash,
    quantityAtomic: intent.grossVenueQuantity.atomic,
    quantityScale: intent.grossVenueQuantity.scale,
    quantityEvidenceHash: intent.grossVenueQuantity.conversionEvidenceHash,
    netOutcomeBoundsHash: intent.netOutcomeBoundsHash,
    feeScheduleVersion: intent.feeScheduleVersion,
    minimumPriceMicros: intent.limitPriceMicros,
    minimumProceedsAtomic: minimumProceedsAtomic(intent),
    maxSpendMicros: intent.maxSpendMicros,
    expiresAt: intent.expiresAt,
  }));
}

function assertMarketMatches(
  context: OrderExecutionContext,
  intent: IntentBinding,
  value: unknown,
): PolymarketLiveMarketBinding {
  const market = Object.freeze(marketBindingSchema.parse(value));
  if (
    market.contractVersionId !== intent.contractVersionId ||
    market.settlementSpecVersionId !== intent.settlementSpecVersionId
  ) {
    throw new Error("Polymarket market binding does not match the execution intent");
  }
  if (
    context.wallet.funderAddress === null ||
    !sameAddress(market.depositWalletAddress, context.wallet.funderAddress)
  ) {
    throw new Error("Polymarket market binding does not match the deposit wallet");
  }
  return market;
}

function expectedSigning(
  market: PolymarketLiveMarketBinding,
  intent: IntentBinding,
): ExactInventorySellWorkflowExpectation {
  return Object.freeze({
    depositWalletAddress: market.depositWalletAddress,
    exchangeAddress: market.exchangeAddress,
    quantityAtomic: intent.quantityAtomic,
    minimumProceedsAtomic: intent.minimumProceedsAtomic,
    oppositeTokenId: market.oppositeTokenId,
  });
}

function parsePrepared(
  artifact: PreparedArtifact,
  expectedAttemptKey: string,
): PreparedPayload {
  if (
    artifact.schemaVersion !== "prepared-artifact-v1" ||
    artifact.venue !== "polymarket" ||
    artifact.nativeSpendAtomic !== "0" ||
    !verifyPreparedArtifact(artifact)
  ) {
    throw new Error("Invalid Polymarket prepared artifact");
  }
  const payload = Object.freeze(preparedPayloadSchema.parse(artifact.payload));
  const locatorSeed = locatorSeedSchema.parse(artifact.locatorSeed);
  if (
    artifact.expiresAt !== payload.intent.expiresAt ||
    locatorSeed.attemptKey !== expectedAttemptKey ||
    locatorSeed.venueAccountRevision !== payload.market.venueAccountRevision ||
    expectedAttemptKey.trim().length === 0
  ) {
    throw new Error("Polymarket prepared artifact hash or attempt binding changed");
  }
  return payload;
}

async function assertCurrentReadiness(input: {
  readonly boundary: PolymarketLiveAdapterBoundary;
  readonly phase: PolymarketReadinessPhase;
  readonly context: OrderExecutionContext;
  readonly payload: PreparedPayload;
}): Promise<void> {
  assertContext(input.context, input.payload.intent.expiresAt);
  const current = assertMarketMatches(
    input.context,
    input.payload.intent,
    await input.boundary.resolveMarket(
      input.context,
      marketRequest(input.payload.intent),
    ),
  );
  if (
    sha256Canonical(asJsonValue(current)) !==
    sha256Canonical(asJsonValue(input.payload.market))
  ) {
    throw new Error("Polymarket market binding changed after preparation");
  }
  await input.boundary.assertReady({
    phase: input.phase,
    context: input.context,
    market: current,
    intent: input.payload.intent,
  });
}

function assertIntentBinding(
  payload: PreparedPayload,
  intent: LiveOrderIntent,
): void {
  const current = buildIntentBinding(intent);
  if (
    sha256Canonical(asJsonValue(current)) !==
    sha256Canonical(asJsonValue(payload.intent))
  ) {
    throw new Error("Polymarket prepared artifact does not match the current intent");
  }
}

function baseContext(
  context: ArtifactExecutionContext<OrderExecutionContext>,
): OrderExecutionContext {
  if (context.operationKind === "entry") {
    return Object.freeze({
      profileId: context.profileId,
      wallet: context.wallet,
      nowMs: context.nowMs,
      signal: context.signal,
      operationKind: context.operationKind,
      operationAttemptId: context.operationAttemptId,
      attemptKey: context.attemptKey,
      subject: context.subject,
    });
  }
  return Object.freeze({
    profileId: context.profileId,
    wallet: context.wallet,
    nowMs: context.nowMs,
    signal: context.signal,
    operationKind: context.operationKind,
    operationAttemptId: context.operationAttemptId,
    attemptKey: context.attemptKey,
    subject: context.subject,
  });
}

function assertSubmissionKey(
  context: ArtifactExecutionContext<OrderExecutionContext>,
  artifactHash: string,
): void {
  const expected = deriveSubmissionKey(context.attemptKey, artifactHash);
  if (context.submissionKey !== expected) {
    throw new Error("Polymarket submission key is not bound to this attempt and artifact");
  }
}

function validateSignedArtifact(
  context: ArtifactExecutionContext<OrderExecutionContext>,
  artifact: SignedArtifact,
): PreparedPayload {
  if (context.artifactHash !== artifact.artifactHash) {
    throw new Error("Polymarket signed artifact locator is invalid");
  }
  assertSubmissionKey(context, artifact.artifactHash);
  if (
    artifact.locator.venue !== "polymarket" ||
    artifact.locator.primaryId !== `pending:${context.submissionKey}` ||
    artifact.locator.clientId !== context.submissionKey
  ) {
    throw new Error("Polymarket signed artifact locator is invalid");
  }
  const payload = parsePrepared(artifact, context.attemptKey);
  const expected = expectedSigning(payload.market, payload.intent);
  assertExactSignedInventorySell(artifact.signedPayload, expected);
  if (!sameAddress(artifact.signerAddress, payload.market.depositWalletAddress)) {
    throw new Error("Polymarket signed artifact signer is invalid");
  }
  if (
    artifact.locator.evidenceHash !== artifact.artifactHash ||
    !verifySignedArtifact(artifact)
  ) {
    throw new Error("Polymarket signed artifact hash changed");
  }
  return payload;
}

function submitEvidence(value: unknown): JsonValue {
  const normalized = asJsonValue(value);
  if (
    normalized === null ||
    typeof normalized !== "object" ||
    Array.isArray(normalized)
  ) {
    throw new Error("Polymarket submit evidence must be an object");
  }
  return Object.freeze({
    schemaVersion: "polymarket-submit-observation-v1",
    ...normalized,
  });
}

/** Exact-inventory Polymarket mutation boundary; no direct BUY path exists. */
export function createPolymarketLiveAdapter(
  boundary: PolymarketLiveAdapterBoundary,
): LiveVenueAdapter {
  const pending = new Map<string, PendingWorkflow>();

  const adapter: LiveVenueAdapter = {
    id: "polymarket",

    async prepare(context, intent) {
      assertContext(context, intent.expiresAt);
      const intentBinding = buildIntentBinding(intent);
      const market = assertMarketMatches(
        context,
        intentBinding,
        await boundary.resolveMarket(context, marketRequest(intentBinding)),
      );
      await boundary.assertReady({
        phase: "prepare",
        context,
        market,
        intent: intentBinding,
      });
      const request = createExactInventorySellRequest({
        oppositeTokenId: market.oppositeTokenId,
        quantity: intent.grossVenueQuantity,
        minimumPriceMicros: intent.limitPriceMicros,
        tickSizeMicros: market.tickSizeMicros,
      });
      const workflow = await boundary.prepareMarketOrder(context, request);
      const expected = expectedSigning(market, intentBinding);
      const signing = await beginExactInventorySellSigning({ workflow, expected });
      const payload = Object.freeze(preparedPayloadSchema.parse({
        schemaVersion: "polymarket-prepared-exact-inventory-sell-v1",
        market,
        intent: intentBinding,
        request,
        typedEvidence: signing.evidence,
      }));
      const locatorSeed = Object.freeze({
        schemaVersion: "polymarket-locator-seed-v1",
        attemptKey: context.attemptKey,
        venueAccountRevision: market.venueAccountRevision,
      });
      const jsonPayload = asJsonValue(payload);
      const jsonLocatorSeed = asJsonValue(locatorSeed);
      const prepared = createPreparedArtifact({
        schemaVersion: "prepared-artifact-v1",
        venue: "polymarket",
        payload: jsonPayload,
        nativeSpendAtomic: "0",
        expiresAt: intent.expiresAt,
        locatorSeed: jsonLocatorSeed,
      });
      pending.set(prepared.artifactHash, Object.freeze({
        workflow,
        typedPayload: signing.typedPayload,
        evidence: signing.evidence,
        expected,
      }));
      return prepared;
    },

    async validate(context, intent, artifact) {
      const payload = parsePrepared(artifact, context.attemptKey);
      assertIntentBinding(payload, intent);
      await assertCurrentReadiness({
        boundary,
        phase: "validate",
        context,
        payload,
      });
    },

    async sign(context, intent, artifact) {
      if (context.artifactHash !== artifact.artifactHash) {
        throw new Error("Polymarket signing context has the wrong artifact hash");
      }
      assertSubmissionKey(context, artifact.artifactHash);
      const payload = parsePrepared(artifact, context.attemptKey);
      assertIntentBinding(payload, intent);
      await assertCurrentReadiness({
        boundary,
        phase: "sign",
        context: baseContext(context),
        payload,
      });
      const workflow = pending.get(artifact.artifactHash);
      if (workflow === undefined) {
        throw new Error("Polymarket prepared workflow is unavailable; prepare again");
      }
      if (
        sha256Canonical(asJsonValue(workflow.evidence)) !==
        sha256Canonical(asJsonValue(payload.typedEvidence))
      ) {
        throw new Error("Polymarket pending workflow differs from persisted evidence");
      }
      const rawSignature = await boundary.signTypedData(
        baseContext(context),
        workflow.typedPayload,
      );
      const signedOrder = await completeExactInventorySellSigning({
        expected: workflow.expected,
        workflow: workflow.workflow,
        evidence: workflow.evidence,
        rawSignature,
      });
      pending.delete(artifact.artifactHash);
      const signedPayload = asJsonValue(signedOrder);
      const signerAddress = payload.market.depositWalletAddress;
      return createSignedArtifact(artifact, {
        signedPayload,
        signerAddress,
        locator: Object.freeze({
          schemaVersion: "venue-locator-v1",
          venue: "polymarket",
          primaryId: `pending:${context.submissionKey}`,
          clientId: context.submissionKey,
          transactionSignature: null,
          createdAt: context.nowMs,
          expiresAt: artifact.expiresAt,
          evidenceHash: artifact.artifactHash,
        }),
      });
    },

    async simulate(context, artifact) {
      const payload = validateSignedArtifact(context, artifact);
      await assertCurrentReadiness({
        boundary,
        phase: "simulate",
        context: baseContext(context),
        payload,
      });
    },

    async submitOnce(context, artifact): Promise<SubmitObservation> {
      const payload = validateSignedArtifact(context, artifact);
      await assertCurrentReadiness({
        boundary,
        phase: "submit",
        context: baseContext(context),
        payload,
      });
      const result = await submitPolymarketOrderOnce({
        post: (signedOrder) => boundary.postOrder(context, signedOrder),
        signedOrder: artifact.signedPayload,
        signedArtifactHash: artifact.signedArtifactHash,
        submittedAt: context.nowMs,
      });
      if (result.kind === "acked") {
        const evidence = submitEvidence(asJsonValue({
          kind: result.kind,
          status: result.status,
          makingAmount: result.makingAmount,
          takingAmount: result.takingAmount,
          tradeIds: result.tradeIds,
          transactionHashes: result.transactionHashes,
        }));
        return Object.freeze({
          kind: "acked",
          locator: Object.freeze({
            schemaVersion: "venue-locator-v1",
            venue: "polymarket",
            primaryId: result.orderId,
            clientId: context.submissionKey,
            transactionSignature: null,
            createdAt: context.nowMs,
            expiresAt: null,
            evidenceHash: sha256Canonical(evidence),
          }),
          evidence,
        });
      }
      if (result.kind === "rejected") {
        return Object.freeze({
          kind: "rejected",
          code: result.code,
          retryable: false,
          evidence: submitEvidence(asJsonValue({
            kind: result.kind,
            code: result.code,
          })),
        });
      }
      return Object.freeze({
        kind: "unknown",
        locator: null,
        reason: result.reason,
        evidence: submitEvidence(asJsonValue({
          kind: result.kind,
          reason: result.reason,
          signedArtifactHash: result.signedArtifactHash,
          submittedAt: result.submittedAt,
        })),
      });
    },

    reconcile(context, claim) {
      return boundary.reconcile(context, claim);
    },

    balances(context) {
      return boundary.balances(context);
    },

    positions(context) {
      return boundary.positions(context);
    },
  };
  return Object.freeze(adapter);
}
