import { z } from "zod";

import { sha256Canonical } from "@/core/canonical-json";
import type { ExecutionCostObservation } from "@/execution/types";

import {
  createPolymarketL2Headers,
  type PolymarketClobCredentials,
  type PolymarketL2Headers,
} from "./hmac";

const POLYMARKET_CLOB_HOST = "https://clob.polymarket.com";
const CANCELLATION_PATH = "/order";
const CANCELLATION_CONTENT_TYPE = "application/json";
const MAX_AUTH_AGE_MS = 30_000;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const ORDER_ID = /^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HMAC_SIGNATURE = /^[A-Za-z0-9_-]{43}=$/;

export interface PreparePolymarketCancellationInput {
  readonly orderId: string;
  readonly originalOrderIntentHash: string;
  readonly originalSignedArtifactHash: string;
  readonly originalSubmissionKey: string;
  readonly venueAccountRevision: string;
  readonly preparedAtMs: number;
  readonly expiresAtMs: number;
}

interface PolymarketCancellationArtifactPayload
  extends PreparePolymarketCancellationInput {
  readonly schemaVersion: "polymarket-cancellation-v1";
  readonly host: typeof POLYMARKET_CLOB_HOST;
  readonly method: "DELETE";
  readonly requestPath: typeof CANCELLATION_PATH;
  readonly body: string;
}

export interface PolymarketCancellationArtifact
  extends PolymarketCancellationArtifactPayload {
  readonly artifactHash: string;
}

function assertCancellationInput(
  input: PreparePolymarketCancellationInput,
): void {
  if (!ORDER_ID.test(input.orderId)) {
    throw new Error("Polymarket cancellation order ID is invalid");
  }
  if (
    !SHA256_HEX.test(input.originalOrderIntentHash) ||
    !SHA256_HEX.test(input.originalSignedArtifactHash)
  ) {
    throw new Error("Polymarket cancellation binding hash is invalid");
  }
  if (
    input.originalSubmissionKey.length === 0 ||
    input.venueAccountRevision.length === 0
  ) {
    throw new Error("Polymarket cancellation binding is incomplete");
  }
  if (
    !Number.isSafeInteger(input.preparedAtMs) ||
    input.preparedAtMs < 0 ||
    !Number.isSafeInteger(input.expiresAtMs) ||
    input.expiresAtMs <= input.preparedAtMs
  ) {
    throw new Error("Polymarket cancellation validity window is invalid");
  }
}

function artifactPayload(
  input: PreparePolymarketCancellationInput,
): PolymarketCancellationArtifactPayload {
  return {
    schemaVersion: "polymarket-cancellation-v1",
    host: POLYMARKET_CLOB_HOST,
    method: "DELETE",
    requestPath: CANCELLATION_PATH,
    body: JSON.stringify({ orderID: input.orderId }),
    ...input,
  };
}

export function preparePolymarketCancellation(
  input: PreparePolymarketCancellationInput,
): PolymarketCancellationArtifact {
  assertCancellationInput(input);
  const payload = artifactPayload(input);
  const canonicalPayload = {
    schemaVersion: payload.schemaVersion,
    host: payload.host,
    method: payload.method,
    requestPath: payload.requestPath,
    body: payload.body,
    orderId: payload.orderId,
    originalOrderIntentHash: payload.originalOrderIntentHash,
    originalSignedArtifactHash: payload.originalSignedArtifactHash,
    originalSubmissionKey: payload.originalSubmissionKey,
    venueAccountRevision: payload.venueAccountRevision,
    preparedAtMs: payload.preparedAtMs,
    expiresAtMs: payload.expiresAtMs,
  };
  return Object.freeze({
    ...payload,
    artifactHash: sha256Canonical(canonicalPayload),
  });
}

function validateCancellationArtifact(
  artifact: PolymarketCancellationArtifact,
): void {
  const expected = preparePolymarketCancellation({
    orderId: artifact.orderId,
    originalOrderIntentHash: artifact.originalOrderIntentHash,
    originalSignedArtifactHash: artifact.originalSignedArtifactHash,
    originalSubmissionKey: artifact.originalSubmissionKey,
    venueAccountRevision: artifact.venueAccountRevision,
    preparedAtMs: artifact.preparedAtMs,
    expiresAtMs: artifact.expiresAtMs,
  });
  if (
    artifact.schemaVersion !== expected.schemaVersion ||
    artifact.host !== expected.host ||
    artifact.method !== expected.method ||
    artifact.requestPath !== expected.requestPath ||
    artifact.body !== expected.body ||
    artifact.artifactHash !== expected.artifactHash
  ) {
    throw new Error("Polymarket cancellation artifact hash or payload drifted");
  }
}

export async function createPolymarketCancellationHeaders(input: {
  readonly artifact: PolymarketCancellationArtifact;
  readonly address: string;
  readonly credentials: PolymarketClobCredentials;
  readonly timestamp: number;
}): Promise<PolymarketL2Headers> {
  validateCancellationArtifact(input.artifact);
  return createPolymarketL2Headers({
    address: input.address,
    credentials: input.credentials,
    timestamp: input.timestamp,
    method: input.artifact.method,
    requestPath: input.artifact.requestPath,
    body: input.artifact.body,
  });
}

export interface PolymarketCancellationRequestHeaders
  extends PolymarketL2Headers {
  readonly "Content-Type": typeof CANCELLATION_CONTENT_TYPE;
}

interface PolymarketCancellationRequestArtifactPayload {
  readonly schemaVersion: "polymarket-cancellation-request-v1";
  readonly cancellationArtifactHash: string;
  readonly url: `${typeof POLYMARKET_CLOB_HOST}${typeof CANCELLATION_PATH}`;
  readonly method: "DELETE";
  readonly body: string;
  readonly headers: PolymarketCancellationRequestHeaders;
  readonly authTimestamp: number;
}

export interface PolymarketCancellationRequestArtifact
  extends PolymarketCancellationRequestArtifactPayload {
  readonly requestArtifactHash: string;
}

function cancellationRequestPayload(
  artifact: PolymarketCancellationArtifact,
  headers: PolymarketCancellationRequestHeaders,
  authTimestamp: number,
): PolymarketCancellationRequestArtifactPayload {
  return {
    schemaVersion: "polymarket-cancellation-request-v1",
    cancellationArtifactHash: artifact.artifactHash,
    url: `${artifact.host}${artifact.requestPath}`,
    method: artifact.method,
    body: artifact.body,
    headers,
    authTimestamp,
  };
}

function hashCancellationRequest(
  payload: PolymarketCancellationRequestArtifactPayload,
): string {
  return sha256Canonical({
    schemaVersion: payload.schemaVersion,
    cancellationArtifactHash: payload.cancellationArtifactHash,
    url: payload.url,
    method: payload.method,
    body: payload.body,
    headers: {
      POLY_ADDRESS: payload.headers.POLY_ADDRESS,
      POLY_SIGNATURE: payload.headers.POLY_SIGNATURE,
      POLY_TIMESTAMP: payload.headers.POLY_TIMESTAMP,
      POLY_API_KEY: payload.headers.POLY_API_KEY,
      POLY_PASSPHRASE: payload.headers.POLY_PASSPHRASE,
      "Content-Type": payload.headers["Content-Type"],
    },
    authTimestamp: payload.authTimestamp,
  });
}

function assertExactCancellationRequestHeaders(
  headers: PolymarketCancellationRequestHeaders,
  authTimestamp: number,
): void {
  const expectedKeys = [
    "Content-Type",
    "POLY_ADDRESS",
    "POLY_API_KEY",
    "POLY_PASSPHRASE",
    "POLY_SIGNATURE",
    "POLY_TIMESTAMP",
  ].sort();
  const keys = Reflect.ownKeys(headers);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    (keys as string[]).sort().some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error("Polymarket authenticated request headers drifted");
  }
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(headers, key);
    if (
      !descriptor?.enumerable ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      throw new Error("Polymarket authenticated request headers drifted");
    }
  }
  if (
    headers["Content-Type"] !== CANCELLATION_CONTENT_TYPE ||
    !ADDRESS.test(headers.POLY_ADDRESS) ||
    !HMAC_SIGNATURE.test(headers.POLY_SIGNATURE) ||
    headers.POLY_TIMESTAMP !== String(authTimestamp) ||
    headers.POLY_API_KEY.length === 0 ||
    headers.POLY_API_KEY.length > 256 ||
    headers.POLY_PASSPHRASE.length === 0 ||
    headers.POLY_PASSPHRASE.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(
      `${headers.POLY_API_KEY}${headers.POLY_PASSPHRASE}`,
    )
  ) {
    throw new Error("Polymarket authenticated request headers drifted");
  }
}

function validateCancellationRequestArtifact(
  artifact: PolymarketCancellationArtifact,
  request: PolymarketCancellationRequestArtifact,
): void {
  assertExactCancellationRequestHeaders(request.headers, request.authTimestamp);
  const expected = cancellationRequestPayload(
    artifact,
    request.headers,
    request.authTimestamp,
  );
  if (
    request.schemaVersion !== expected.schemaVersion ||
    request.cancellationArtifactHash !== expected.cancellationArtifactHash ||
    request.url !== expected.url ||
    request.method !== expected.method ||
    request.body !== expected.body ||
    request.requestArtifactHash !== hashCancellationRequest(expected)
  ) {
    throw new Error("Polymarket authenticated request artifact drifted");
  }
}

/** Creates the exact authenticated HTTP request that must later be sent unchanged. */
export async function createPolymarketCancellationRequestArtifact(input: {
  readonly artifact: PolymarketCancellationArtifact;
  readonly address: string;
  readonly credentials: PolymarketClobCredentials;
  readonly timestamp: number;
}): Promise<PolymarketCancellationRequestArtifact> {
  const l2Headers = await createPolymarketCancellationHeaders(input);
  const headers = Object.freeze({
    ...l2Headers,
    "Content-Type": CANCELLATION_CONTENT_TYPE,
  });
  const payload = cancellationRequestPayload(
    input.artifact,
    headers,
    input.timestamp,
  );
  return Object.freeze({
    ...payload,
    requestArtifactHash: hashCancellationRequest(payload),
  });
}

const cancellationResponseSchema = z.strictObject({
  canceled: z.array(z.string()),
  not_canceled: z.record(z.string(), z.string()),
});

export type PolymarketCancellationObservation =
  | Readonly<{
      kind: "acked";
      terminal: false;
      orderId: string;
      requiresAuthoritativeReconciliation: true;
    }>
  | Readonly<{
      kind: "unknown";
      terminal: false;
      orderId: string;
      artifactHash: string;
      reason: "POLYMARKET_CANCELLATION_AMBIGUOUS";
      requiresAuthoritativeReconciliation: true;
    }>;

export interface SubmitPolymarketCancellationOnceInput {
  readonly artifact: PolymarketCancellationArtifact;
  readonly authenticatedRequest: PolymarketCancellationRequestArtifact;
  readonly nowMs: number;
  readonly claimSubmitStarted: (marker: Readonly<{
    cancellationArtifactHash: string;
    requestArtifactHash: string;
    orderId: string;
    authTimestamp: number;
    submittedAtMs: number;
    originalSubmissionKey: string;
  }>) => Promise<"claimed" | "already_started">;
  readonly send: (request: Readonly<{
    requestArtifactHash: string;
    authTimestamp: number;
    url: string;
    method: "DELETE";
    body: string;
    headers: PolymarketCancellationRequestHeaders;
  }>) => Promise<unknown>;
}

function unknownCancellation(
  artifact: PolymarketCancellationArtifact,
): PolymarketCancellationObservation {
  return Object.freeze({
    kind: "unknown",
    terminal: false,
    orderId: artifact.orderId,
    artifactHash: artifact.artifactHash,
    reason: "POLYMARKET_CANCELLATION_AMBIGUOUS",
    requiresAuthoritativeReconciliation: true,
  });
}

/** Performs one fenced DELETE. Any ambiguity is reconciled and never retried blindly. */
export async function submitPolymarketCancellationOnce(
  input: SubmitPolymarketCancellationOnceInput,
): Promise<PolymarketCancellationObservation> {
  validateCancellationArtifact(input.artifact);
  validateCancellationRequestArtifact(
    input.artifact,
    input.authenticatedRequest,
  );
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
    throw new Error("Polymarket cancellation submission time is invalid");
  }
  if (input.nowMs < input.artifact.preparedAtMs) {
    throw new Error("Polymarket cancellation submission time is before preparation");
  }
  if (input.nowMs >= input.artifact.expiresAtMs) {
    throw new Error("Polymarket cancellation artifact expired");
  }
  const authTimestampMs = input.authenticatedRequest.authTimestamp * 1_000;
  if (
    !Number.isSafeInteger(authTimestampMs) ||
    authTimestampMs > input.nowMs ||
    input.nowMs - authTimestampMs > MAX_AUTH_AGE_MS ||
    authTimestampMs < input.artifact.preparedAtMs - 999 ||
    authTimestampMs >= input.artifact.expiresAtMs
  ) {
    throw new Error("Polymarket cancellation authentication timestamp is invalid");
  }

  let claim: "claimed" | "already_started";
  try {
    // The store must atomically insert this marker or report the prior insert.
    claim = await input.claimSubmitStarted(
      Object.freeze({
        cancellationArtifactHash: input.artifact.artifactHash,
        requestArtifactHash:
          input.authenticatedRequest.requestArtifactHash,
        orderId: input.artifact.orderId,
        authTimestamp: input.authenticatedRequest.authTimestamp,
        submittedAtMs: input.nowMs,
        originalSubmissionKey: input.artifact.originalSubmissionKey,
      }),
    );
  } catch {
    return unknownCancellation(input.artifact);
  }
  if (claim !== "claimed") {
    // A prior marker means a prior worker may already have sent this DELETE.
    return unknownCancellation(input.artifact);
  }

  try {
    const response = cancellationResponseSchema.parse(
      await input.send(
        Object.freeze({
          requestArtifactHash:
            input.authenticatedRequest.requestArtifactHash,
          authTimestamp: input.authenticatedRequest.authTimestamp,
          url: input.authenticatedRequest.url,
          method: input.authenticatedRequest.method,
          body: input.authenticatedRequest.body,
          headers: input.authenticatedRequest.headers,
        }),
      ),
    );
    if (
      response.canceled.length === 1 &&
      response.canceled[0] === input.artifact.orderId &&
      response.not_canceled[input.artifact.orderId] === undefined
    ) {
      // The ACK proves only that cancellation was accepted, never that no fill raced it.
      return Object.freeze({
        kind: "acked",
        terminal: false,
        orderId: input.artifact.orderId,
        requiresAuthoritativeReconciliation: true,
      });
    }
    return unknownCancellation(input.artifact);
  } catch {
    return unknownCancellation(input.artifact);
  }
}

export interface AuthoritativeCancellationEvidence {
  readonly orderId: string;
  readonly status: "CANCELED" | "UNMATCHED" | "LIVE" | "MATCHED" | "UNKNOWN";
  readonly terminal: boolean;
  readonly observedAtMs: number;
  readonly finalityRevision: string;
  readonly evidenceHash: string;
}

/** CLOB cancellation is an off-chain request, so final REST proof establishes zero cost. */
export function proveFinalZeroCancellationCost(
  evidence: AuthoritativeCancellationEvidence,
): ExecutionCostObservation {
  if (!ORDER_ID.test(evidence.orderId)) {
    throw new Error("Polymarket cancellation evidence order ID is invalid");
  }
  if (
    !evidence.terminal ||
    (evidence.status !== "CANCELED" && evidence.status !== "UNMATCHED")
  ) {
    throw new Error("Polymarket cancellation is not authoritatively terminal");
  }
  if (
    !Number.isSafeInteger(evidence.observedAtMs) ||
    evidence.observedAtMs < 0 ||
    evidence.finalityRevision.length === 0 ||
    !SHA256_HEX.test(evidence.evidenceHash)
  ) {
    throw new Error("Polymarket cancellation final evidence is invalid");
  }
  return Object.freeze({
    kind: "final",
    networkCostMicros: 0,
    setupCostMicros: 0,
    totalCostMicros: 0,
    chargedAssetId: null,
    chargedAtomic: null,
    valuationPolicyVersion: null,
    receiptId: null,
    finalityRevision: evidence.finalityRevision,
    evidenceHash: evidence.evidenceHash,
  });
}
