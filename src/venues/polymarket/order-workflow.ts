import { OrderSide, SignatureType } from "@polymarket/client";
import { z } from "zod";

import type { JsonValue } from "@/core/canonical-json";

import {
  assertExactSignedInventorySell,
  type ExactSignedInventorySellExpectation,
} from "./sdk-contract";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const zeroBytes32 = z.literal(`0x${"00".repeat(32)}`);
const nonnegativeBigint = z.bigint().nonnegative();

const typedDataSchema = z.strictObject({
  domain: z.strictObject({
    chainId: z.literal(137),
    name: z.literal("Polymarket CTF Exchange"),
    verifyingContract: address,
    version: z.literal("2"),
  }),
  message: z.strictObject({
    chainId: z.literal(137),
    contents: z.strictObject({
      builder: zeroBytes32,
      maker: address,
      makerAmount: nonnegativeBigint,
      metadata: zeroBytes32,
      salt: nonnegativeBigint,
      side: z.literal(1),
      signatureType: z.literal(SignatureType.POLY_1271),
      signer: address,
      takerAmount: nonnegativeBigint,
      timestamp: nonnegativeBigint,
      tokenId: nonnegativeBigint,
    }),
    name: z.literal("DepositWallet"),
    salt: zeroBytes32,
    verifyingContract: address,
    version: z.literal("1"),
  }),
  primaryType: z.literal("TypedDataSign"),
  types: z.unknown(),
});

const exactTypes: JsonValue = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
    { name: "timestamp", type: "uint256" },
    { name: "metadata", type: "bytes32" },
    { name: "builder", type: "bytes32" },
  ],
  TypedDataSign: [
    { name: "contents", type: "Order" },
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "salt", type: "bytes32" },
  ],
};

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function exactJsonEqual(left: unknown, right: JsonValue): boolean {
  try {
    const normalize = (value: unknown): string => {
      if (value === null || typeof value !== "object") return JSON.stringify(value);
      if (Array.isArray(value)) return `[${value.map(normalize).join(",")}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entry]) => `${JSON.stringify(key)}:${normalize(entry)}`);
      return `{${entries.join(",")}}`;
    };
    return normalize(left) === normalize(right);
  } catch {
    return false;
  }
}

export interface ExactInventorySellWorkflowExpectation
  extends ExactSignedInventorySellExpectation {
  readonly exchangeAddress: string;
}

export interface ExactInventorySellTypedEvidence {
  readonly schemaVersion: "polymarket-typed-inventory-sell-v1";
  readonly chainId: 137;
  readonly exchangeAddress: string;
  readonly maker: string;
  readonly signer: string;
  readonly tokenId: string;
  readonly makerAmount: string;
  readonly takerAmount: string;
  readonly side: typeof OrderSide.SELL;
  readonly signatureType: typeof SignatureType.POLY_1271;
  readonly salt: string;
  readonly timestamp: string;
  readonly expiration: 0;
  readonly metadata: string;
  readonly builder: string;
  readonly outerDomainName: "DepositWallet";
  readonly outerDomainVersion: "1";
  readonly outerDomainSalt: string;
}

export function extractExactInventorySellTypedData(
  value: unknown,
  expected: ExactInventorySellWorkflowExpectation,
): ExactInventorySellTypedEvidence {
  const result = typedDataSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid Polymarket typed sell payload: ${result.error.message}`);
  }
  const payload = result.data;
  const order = payload.message.contents;
  if (!exactJsonEqual(payload.types, exactTypes)) {
    throw new Error("Polymarket typed sell structure does not match the pinned SDK");
  }
  if (!sameAddress(payload.domain.verifyingContract, expected.exchangeAddress)) {
    throw new Error("Polymarket typed sell exchange does not match current market evidence");
  }
  if (
    !sameAddress(order.maker, expected.depositWalletAddress) ||
    !sameAddress(order.signer, expected.depositWalletAddress) ||
    !sameAddress(payload.message.verifyingContract, expected.depositWalletAddress)
  ) {
    throw new Error("Polymarket typed sell is not bound to the deposit wallet");
  }
  if (order.makerAmount.toString() !== expected.quantityAtomic) {
    throw new Error("Polymarket typed sell shares differ from the exact intent");
  }
  if (order.takerAmount.toString() !== expected.minimumProceedsAtomic) {
    throw new Error("Polymarket typed sell proceeds differ from the protected floor");
  }
  if (order.tokenId.toString() !== expected.oppositeTokenId) {
    throw new Error("Polymarket typed sell token differs from the opposite outcome");
  }

  return Object.freeze({
    schemaVersion: "polymarket-typed-inventory-sell-v1",
    chainId: 137,
    exchangeAddress: payload.domain.verifyingContract,
    maker: order.maker,
    signer: order.signer,
    tokenId: order.tokenId.toString(),
    makerAmount: order.makerAmount.toString(),
    takerAmount: order.takerAmount.toString(),
    side: OrderSide.SELL,
    signatureType: SignatureType.POLY_1271,
    salt: order.salt.toString(),
    timestamp: order.timestamp.toString(),
    expiration: 0,
    metadata: order.metadata,
    builder: order.builder,
    outerDomainName: payload.message.name,
    outerDomainVersion: payload.message.version,
    outerDomainSalt: payload.message.salt,
  });
}

const signedMatchSchema = z.object({
  builder: bytes32,
  expiration: z.literal(0),
  maker: address,
  makerAmount: z.string(),
  metadata: bytes32,
  salt: z.string(),
  side: z.literal(OrderSide.SELL),
  signatureType: z.literal(SignatureType.POLY_1271),
  signer: address,
  takerAmount: z.string(),
  timestamp: z.string(),
  tokenId: z.string(),
});

function assertSignedMatchesTypedEvidence(
  value: unknown,
  expected: ExactInventorySellWorkflowExpectation,
  evidence: ExactInventorySellTypedEvidence,
): void {
  assertExactSignedInventorySell(value, expected);
  const result = signedMatchSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid signed Polymarket order: ${result.error.message}`);
  }
  const signed = result.data;
  const exactFieldsMatch =
    sameAddress(signed.maker, evidence.maker) &&
    sameAddress(signed.signer, evidence.signer) &&
    signed.makerAmount === evidence.makerAmount &&
    signed.takerAmount === evidence.takerAmount &&
    signed.tokenId === evidence.tokenId &&
    signed.salt === evidence.salt &&
    signed.timestamp === evidence.timestamp &&
    signed.expiration === evidence.expiration &&
    signed.metadata.toLowerCase() === evidence.metadata.toLowerCase() &&
    signed.builder.toLowerCase() === evidence.builder.toLowerCase();
  if (!exactFieldsMatch) {
    throw new Error("Signed Polymarket order differs from the persisted typed payload");
  }
}

interface WorkflowResult {
  readonly done?: boolean;
  readonly value: unknown;
}

export interface PolymarketOrderWorkflowBoundary {
  next(...args: [] | [string]): Promise<WorkflowResult>;
}

export interface BeginExactInventorySellSigningInput {
  readonly expected: ExactInventorySellWorkflowExpectation;
  readonly workflow: PolymarketOrderWorkflowBoundary;
}

export interface PendingExactInventorySellSigning {
  readonly typedPayload: unknown;
  readonly evidence: ExactInventorySellTypedEvidence;
}

/** Advances only to the SDK signing boundary so evidence can be durably persisted first. */
export async function beginExactInventorySellSigning(
  input: BeginExactInventorySellSigningInput,
): Promise<PendingExactInventorySellSigning> {
  const preparedStep = await input.workflow.next();
  if (preparedStep.done === true) {
    throw new Error("Polymarket order workflow ended before its signing boundary");
  }
  const signRequest = z
    .strictObject({ kind: z.literal("signOrder"), payload: z.unknown() })
    .parse(preparedStep.value);
  return Object.freeze({
    typedPayload: signRequest.payload,
    evidence: extractExactInventorySellTypedData(
      signRequest.payload,
      input.expected,
    ),
  });
}

export interface CompleteExactInventorySellSigningInput {
  readonly expected: ExactInventorySellWorkflowExpectation;
  readonly workflow: PolymarketOrderWorkflowBoundary;
  readonly evidence: ExactInventorySellTypedEvidence;
  readonly rawSignature: string;
}

/** Resumes the same SDK workflow and proves its wrapped order matches persisted evidence. */
export async function completeExactInventorySellSigning(
  input: CompleteExactInventorySellSigningInput,
): Promise<unknown> {
  if (!/^0x[a-fA-F0-9]{130}$/.test(input.rawSignature)) {
    throw new Error("Polymarket owner signature must be exactly 65 bytes");
  }
  const signedStep = await input.workflow.next(input.rawSignature);
  if (signedStep.done !== true) {
    throw new Error("Polymarket order workflow yielded an unexpected second mutation");
  }
  assertSignedMatchesTypedEvidence(
    signedStep.value,
    input.expected,
    input.evidence,
  );
  return signedStep.value;
}

export interface DriveExactInventorySellSigningInput {
  readonly expected: ExactInventorySellWorkflowExpectation;
  readonly workflow: PolymarketOrderWorkflowBoundary;
  readonly persistPrepared: (
    evidence: ExactInventorySellTypedEvidence,
  ) => Promise<void>;
  readonly signTypedData: (payload: unknown) => Promise<string>;
  readonly persistSigned: (
    signedOrder: unknown,
    evidence: ExactInventorySellTypedEvidence,
  ) => Promise<void>;
}

/** Manually drives the SDK generator so durable evidence exists before each mutation. */
export async function driveExactInventorySellSigning(
  input: DriveExactInventorySellSigningInput,
): Promise<unknown> {
  const prepared = await beginExactInventorySellSigning(input);

  await input.persistPrepared(prepared.evidence);
  const rawSignature = await input.signTypedData(prepared.typedPayload);
  const signedOrder = await completeExactInventorySellSigning({
    expected: input.expected,
    workflow: input.workflow,
    evidence: prepared.evidence,
    rawSignature,
  });
  await input.persistSigned(signedOrder, prepared.evidence);
  return signedOrder;
}
