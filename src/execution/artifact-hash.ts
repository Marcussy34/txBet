import { createHash, timingSafeEqual } from "node:crypto";

import { canonicalJson, type JsonValue } from "@/core/canonical-json";
import type { AtomicAmount } from "@/core/live-money";
import { isLiveVenueId, type LiveVenueId } from "@/contracts/venues";

import type {
  PreparedArtifact,
  SignedArtifact,
  VenueLocator,
} from "./types";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const ATOMIC_AMOUNT = /^(0|[1-9][0-9]*)$/;

export type PreparedArtifactInput = Readonly<{
  schemaVersion: "prepared-artifact-v1";
  venue: LiveVenueId;
  payload: JsonValue;
  nativeSpendAtomic: AtomicAmount;
  expiresAt: number | null;
  locatorSeed: JsonValue;
}>;

export type SignedArtifactInput = Readonly<{
  signedPayload: JsonValue;
  signerAddress: string;
  locator: VenueLocator;
}>;

function sha256(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function validTimestamp(value: number | null, label: string): void {
  if (value === null) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer timestamp or null`);
  }
}

function freezeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeJson(entry)));
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeJson(entry)]),
      ),
    );
  }
  return value;
}

function normalizeJson(value: JsonValue): JsonValue {
  // Parsing canonical JSON creates an immutable data-only copy of caller input.
  return freezeJson(JSON.parse(canonicalJson(value)) as JsonValue);
}

function preparedHashMaterial(
  input: PreparedArtifactInput,
): JsonValue {
  return {
    hashDomain: "txbet:prepared-artifact:v1",
    schemaVersion: input.schemaVersion,
    venue: input.venue,
    payload: input.payload,
    nativeSpendAtomic: input.nativeSpendAtomic,
    expiresAt: input.expiresAt,
    locatorSeed: input.locatorSeed,
  };
}

function validatePreparedInput(input: PreparedArtifactInput): void {
  if (input.schemaVersion !== "prepared-artifact-v1") {
    throw new Error("Prepared artifact schema version is unsupported");
  }
  if (!isLiveVenueId(input.venue)) {
    throw new Error("Prepared artifact venue is unsupported");
  }
  if (!ATOMIC_AMOUNT.test(input.nativeSpendAtomic)) {
    throw new Error("Native spend must be a canonical nonnegative atomic integer");
  }
  validTimestamp(input.expiresAt, "Prepared artifact expiresAt");
  canonicalJson(input.payload);
  canonicalJson(input.locatorSeed);
}

function normalizeLocator(
  locator: VenueLocator,
  expectedVenue: LiveVenueId,
): VenueLocator {
  if (locator.schemaVersion !== "venue-locator-v1") {
    throw new Error("Venue locator schema version is unsupported");
  }
  if (locator.venue !== expectedVenue || !isLiveVenueId(locator.venue)) {
    throw new Error("Venue locator does not match the prepared artifact venue");
  }
  if (locator.primaryId.trim().length === 0) {
    throw new Error("Venue locator primary ID is required");
  }
  for (const [label, value] of [
    ["client ID", locator.clientId],
    ["transaction signature", locator.transactionSignature],
  ] as const) {
    if (value !== null && value.trim().length === 0) {
      throw new Error(`Venue locator ${label} cannot be empty`);
    }
  }
  validTimestamp(locator.createdAt, "Venue locator creation time");
  validTimestamp(locator.expiresAt, "Venue locator expiry");
  if (locator.expiresAt !== null && locator.createdAt > locator.expiresAt) {
    throw new Error("Venue locator cannot be created after it expires");
  }
  if (!SHA256_HEX.test(locator.evidenceHash)) {
    throw new Error("Venue locator evidence hash must be lowercase SHA-256 hex");
  }

  return Object.freeze({ ...locator });
}

function hashesEqual(left: string, right: string): boolean {
  if (!SHA256_HEX.test(left) || !SHA256_HEX.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function createPreparedArtifact(
  input: PreparedArtifactInput,
): PreparedArtifact {
  validatePreparedInput(input);
  const normalized: PreparedArtifactInput = Object.freeze({
    ...input,
    payload: normalizeJson(input.payload),
    locatorSeed: normalizeJson(input.locatorSeed),
  });

  return Object.freeze({
    ...normalized,
    artifactHash: sha256(preparedHashMaterial(normalized)),
  });
}

export function verifyPreparedArtifact(artifact: PreparedArtifact): boolean {
  try {
    const recreated = createPreparedArtifact({
      schemaVersion: artifact.schemaVersion,
      venue: artifact.venue,
      payload: artifact.payload,
      nativeSpendAtomic: artifact.nativeSpendAtomic,
      expiresAt: artifact.expiresAt,
      locatorSeed: artifact.locatorSeed,
    });
    return hashesEqual(artifact.artifactHash, recreated.artifactHash);
  } catch {
    return false;
  }
}

export function createSignedArtifact(
  prepared: PreparedArtifact,
  input: SignedArtifactInput,
): SignedArtifact {
  if (!verifyPreparedArtifact(prepared)) {
    throw new Error("Cannot sign an invalid prepared artifact");
  }
  const signerAddress = input.signerAddress.trim();
  if (signerAddress.length === 0) throw new Error("Signer address is required");
  const signedPayload = normalizeJson(input.signedPayload);
  const locator = normalizeLocator(input.locator, prepared.venue);
  const signedArtifactHash = sha256({
    hashDomain: "txbet:signed-artifact:v1",
    artifactHash: prepared.artifactHash,
    signedPayload,
    signerAddress,
    locator: {
      schemaVersion: locator.schemaVersion,
      venue: locator.venue,
      primaryId: locator.primaryId,
      clientId: locator.clientId,
      transactionSignature: locator.transactionSignature,
      createdAt: locator.createdAt,
      expiresAt: locator.expiresAt,
      evidenceHash: locator.evidenceHash,
    },
  });

  return Object.freeze({
    ...prepared,
    signedPayload,
    signerAddress,
    signedArtifactHash,
    locator,
  });
}

export function verifySignedArtifact(artifact: SignedArtifact): boolean {
  try {
    if (!verifyPreparedArtifact(artifact)) return false;
    const recreated = createSignedArtifact(artifact, {
      signedPayload: artifact.signedPayload,
      signerAddress: artifact.signerAddress,
      locator: artifact.locator,
    });
    return hashesEqual(artifact.signedArtifactHash, recreated.signedArtifactHash);
  } catch {
    return false;
  }
}
