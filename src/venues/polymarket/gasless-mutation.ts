import { createHash } from "node:crypto";

const SDK_VERSION = "0.1.0-beta.16" as const;
const SDK_GASLESS_SOURCE_SHA256 =
  "7f2e78c855c184154e42a6096ab1cd9bef89183626ec1f393492a6b168fcb46c" as const;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const EVM_SIGNATURE = /^0x[a-fA-F0-9]{130}$/;
const TRANSACTION_HASH = /^0x[a-fA-F0-9]{64}$/;
const HEX_BYTES = /^0x(?:[a-fA-F0-9]{2})+$/;

export type PolymarketGaslessSignRequest =
  | Readonly<{
      kind: "signGaslessTypedData";
      payload: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{
      kind: "signGaslessMessage";
      payload: string;
    }>;

export interface PolymarketGaslessWorkflowBoundary {
  next(...args: [] | [string]): Promise<Readonly<{ done?: boolean; value: unknown }>>;
}

interface OperationMarker {
  readonly operationId: string;
}

export interface PolymarketGaslessMutationJournal {
  /** This must be an atomic insert-or-reject operation in durable storage. */
  claimOperation(
    marker: OperationMarker,
  ): Promise<"claimed" | "already_claimed">;
  persistPrepareStarted(
    marker: OperationMarker &
      Readonly<{
        sdkVersion: typeof SDK_VERSION;
        sdkGaslessSourceSha256: typeof SDK_GASLESS_SOURCE_SHA256;
      }>,
  ): Promise<void>;
  persistPrepared(marker: OperationMarker): Promise<void>;
  persistSignRequested(
    marker: OperationMarker & Readonly<{ request: PolymarketGaslessSignRequest }>,
  ): Promise<void>;
  persistSigned(
    marker: OperationMarker & Readonly<{ signatureSha256: string }>,
  ): Promise<void>;
  persistSubmitStarted(
    marker: OperationMarker & Readonly<{ signatureSha256: string }>,
  ): Promise<void>;
  persistAcknowledged(
    marker: OperationMarker &
      Readonly<{
        transactionHash: string | null;
        transactionId: string | null;
      }>,
  ): Promise<void>;
  persistUnknown(
    marker: OperationMarker &
      Readonly<{
        phase: "prepare" | "sign" | "submit";
        reason: "POLYMARKET_GASLESS_MUTATION_AMBIGUOUS";
      }>,
  ): Promise<void>;
}

export interface DrivePolymarketGaslessMutationOnceInput {
  readonly operationId: string;
  readonly signerAddress: string;
  readonly journal: PolymarketGaslessMutationJournal;
  /** The callback may prepare an SDK generator, but must not submit a mutation. */
  readonly prepareWorkflow: () => Promise<PolymarketGaslessWorkflowBoundary>;
  readonly sign: (request: PolymarketGaslessSignRequest) => Promise<string>;
}

export type PolymarketGaslessMutationResult =
  | Readonly<{
      kind: "acked";
      terminal: false;
      operationId: string;
      transactionHash: string | null;
      transactionId: string | null;
    }>
  | Readonly<{
      kind: "unknown";
      retryable: false;
      operationId: string;
      reason: "POLYMARKET_GASLESS_MUTATION_AMBIGUOUS";
    }>;

function validOperationId(value: string): boolean {
  return value.length > 0 && value.length <= 200 && value === value.trim();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, key), seen);
  }
  return Object.freeze(value);
}

function asSignRequest(value: unknown): PolymarketGaslessSignRequest | null {
  if (!isRecord(value)) return null;
  const candidate = value;
  if (
    candidate.kind === "signGaslessTypedData" &&
    isRecord(candidate.payload)
  ) {
    return deepFreeze({
      kind: candidate.kind,
      payload: structuredClone(candidate.payload),
    });
  }
  if (
    candidate.kind === "signGaslessMessage" &&
    typeof candidate.payload === "string" &&
    HEX_BYTES.test(candidate.payload)
  ) {
    return Object.freeze({ kind: candidate.kind, payload: candidate.payload });
  }
  return null;
}

function isRequestAddress(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return entries.length === 1 && entries[0]?.[0] === "kind" && entries[0][1] === "requestAddress";
}

function asLocator(
  value: unknown,
): Readonly<{ transactionHash: string | null; transactionId: string | null }> | null {
  if (!isRecord(value)) return null;
  const candidate = value;
  const transactionHash = candidate.transactionHash;
  const transactionId = candidate.transactionId;
  const validHash =
    transactionHash === null ||
    (typeof transactionHash === "string" && TRANSACTION_HASH.test(transactionHash));
  const validId =
    transactionId === null ||
    (typeof transactionId === "string" && transactionId.trim().length > 0);
  if (!validHash || !validId || (transactionHash === null && transactionId === null)) {
    return null;
  }
  return Object.freeze({ transactionHash, transactionId });
}

function unknownResult(operationId: string): PolymarketGaslessMutationResult {
  return Object.freeze({
    kind: "unknown",
    retryable: false,
    operationId,
    reason: "POLYMARKET_GASLESS_MUTATION_AMBIGUOUS",
  });
}

async function persistUnknown(
  input: DrivePolymarketGaslessMutationOnceInput,
  phase: "prepare" | "sign" | "submit",
): Promise<PolymarketGaslessMutationResult> {
  await input.journal.persistUnknown({
    operationId: input.operationId,
    phase,
    reason: "POLYMARKET_GASLESS_MUTATION_AMBIGUOUS",
  });
  return unknownResult(input.operationId);
}

/**
 * Drives exactly one signature continuation of the pinned SDK generator.
 * A later yield means its internal retry loop is asking for a second signature;
 * this boundary abandons that generator and permanently returns UNKNOWN.
 */
export async function drivePolymarketGaslessMutationOnce(
  input: DrivePolymarketGaslessMutationOnceInput,
): Promise<PolymarketGaslessMutationResult> {
  if (!validOperationId(input.operationId)) {
    throw new Error("Polymarket gasless operation ID must be a trimmed nonempty string");
  }
  if (!EVM_ADDRESS.test(input.signerAddress)) {
    throw new Error("Polymarket gasless signer must be a valid EVM address");
  }

  const claim = await input.journal.claimOperation({
    operationId: input.operationId,
  });
  if (claim !== "claimed") return unknownResult(input.operationId);

  await input.journal.persistPrepareStarted({
    operationId: input.operationId,
    sdkVersion: SDK_VERSION,
    sdkGaslessSourceSha256: SDK_GASLESS_SOURCE_SHA256,
  });

  let workflow: PolymarketGaslessWorkflowBoundary;
  try {
    workflow = await input.prepareWorkflow();
  } catch {
    return persistUnknown(input, "prepare");
  }
  await input.journal.persistPrepared({ operationId: input.operationId });

  let addressStep: Readonly<{ done?: boolean; value: unknown }>;
  try {
    addressStep = await workflow.next();
  } catch {
    return persistUnknown(input, "prepare");
  }
  if (addressStep.done === true || !isRequestAddress(addressStep.value)) {
    return persistUnknown(input, "prepare");
  }

  let signStep: Readonly<{ done?: boolean; value: unknown }>;
  try {
    signStep = await workflow.next(input.signerAddress);
  } catch {
    return persistUnknown(input, "prepare");
  }
  let signRequest: PolymarketGaslessSignRequest | null;
  try {
    signRequest = signStep.done === true ? null : asSignRequest(signStep.value);
  } catch {
    return persistUnknown(input, "sign");
  }
  if (signRequest === null) return persistUnknown(input, "sign");

  await input.journal.persistSignRequested({
    operationId: input.operationId,
    request: signRequest,
  });

  let signature: string;
  try {
    signature = await input.sign(signRequest);
  } catch {
    return persistUnknown(input, "sign");
  }
  if (!EVM_SIGNATURE.test(signature)) return persistUnknown(input, "sign");
  const signatureSha256 = createHash("sha256").update(signature).digest("hex");
  await input.journal.persistSigned({
    operationId: input.operationId,
    signatureSha256,
  });

  // The next generator continuation performs the hidden SDK /submit call.
  await input.journal.persistSubmitStarted({
    operationId: input.operationId,
    signatureSha256,
  });

  let submittedStep: Readonly<{ done?: boolean; value: unknown }>;
  try {
    submittedStep = await workflow.next(signature);
  } catch {
    return persistUnknown(input, "submit");
  }
  // A second yield is the SDK's internal retry boundary. Never resume it.
  if (submittedStep.done !== true) return persistUnknown(input, "submit");

  const locator = asLocator(submittedStep.value);
  if (locator === null) return persistUnknown(input, "submit");
  try {
    await input.journal.persistAcknowledged({
      operationId: input.operationId,
      ...locator,
    });
  } catch {
    return persistUnknown(input, "submit");
  }

  return Object.freeze({
    kind: "acked",
    terminal: false,
    operationId: input.operationId,
    ...locator,
  });
}
