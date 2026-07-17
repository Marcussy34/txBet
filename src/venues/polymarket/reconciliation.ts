import { z } from "zod";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const decimal = z.string().regex(/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/);

const acceptedResponseSchema = z.strictObject({
  ok: z.literal(true),
  orderId: z.string().trim().min(1),
  status: z.enum(["live", "matched", "delayed"]),
  makingAmount: decimal,
  takingAmount: decimal,
  transactionsHashes: z.array(z.string().regex(/^0x[a-fA-F0-9]{64}$/)),
  tradeIds: z.array(z.string().trim().min(1)),
});

const rejectedResponseSchema = z.strictObject({
  ok: z.literal(false),
  code: z.enum([
    "unmatched",
    "market_not_ready",
    "insufficient_balance_or_allowance",
    "invalid_nonce",
    "invalid_expiration",
    "post_only_would_cross",
    "fok_not_filled",
    "fak_not_filled",
    "unknown",
  ]),
  message: z.string(),
});

const responseSchema = z.discriminatedUnion("ok", [
  acceptedResponseSchema,
  rejectedResponseSchema,
]);

export interface SubmitPolymarketOrderOnceInput {
  readonly post: (signedOrder: unknown) => Promise<unknown>;
  readonly signedOrder: unknown;
  readonly signedArtifactHash: string;
  readonly submittedAt: number;
}

export type PolymarketSubmitObservation =
  | Readonly<{
      kind: "acked";
      terminal: false;
      orderId: string;
      status: "live" | "matched" | "delayed";
      makingAmount: string;
      takingAmount: string;
      tradeIds: readonly string[];
      transactionHashes: readonly string[];
    }>
  | Readonly<{
      kind: "rejected";
      retryable: false;
      code: string;
    }>
  | Readonly<{
      kind: "unknown";
      reason: "POLYMARKET_SUBMISSION_AMBIGUOUS";
      signedArtifactHash: string;
      submittedAt: number;
    }>;

function unknownSubmission(
  input: SubmitPolymarketOrderOnceInput,
): PolymarketSubmitObservation {
  return Object.freeze({
    kind: "unknown",
    reason: "POLYMARKET_SUBMISSION_AMBIGUOUS",
    signedArtifactHash: input.signedArtifactHash,
    submittedAt: input.submittedAt,
  });
}

/** Calls the already-fenced POST exactly once; every ambiguous result needs reconciliation. */
export async function submitPolymarketOrderOnce(
  input: SubmitPolymarketOrderOnceInput,
): Promise<PolymarketSubmitObservation> {
  if (!SHA256_HEX.test(input.signedArtifactHash)) {
    throw new Error("Polymarket signed artifact hash must be lowercase SHA-256 hex");
  }
  if (!Number.isSafeInteger(input.submittedAt) || input.submittedAt < 0) {
    throw new Error("Polymarket submission time must be a nonnegative safe integer");
  }

  try {
    const parsed = responseSchema.parse(await input.post(input.signedOrder));
    if (!parsed.ok) {
      return Object.freeze({
        kind: "rejected",
        retryable: false,
        code: parsed.code,
      });
    }
    return Object.freeze({
      kind: "acked",
      terminal: false,
      orderId: parsed.orderId,
      status: parsed.status,
      makingAmount: parsed.makingAmount,
      takingAmount: parsed.takingAmount,
      tradeIds: Object.freeze([...parsed.tradeIds]),
      transactionHashes: Object.freeze([...parsed.transactionsHashes]),
    });
  } catch {
    // A transport or schema failure after the call cannot prove that no order exists.
    return unknownSubmission(input);
  }
}

export interface PolymarketOrderDisposition {
  readonly terminal: boolean;
  readonly cancelable: boolean;
  readonly requiresRestConfirmation: true;
}

export function classifyPolymarketOrderState(
  status: "LIVE" | "MATCHED" | "DELAYED" | "UNMATCHED" | "CANCELED",
): PolymarketOrderDisposition {
  switch (status) {
    case "LIVE":
      return Object.freeze({
        terminal: false,
        cancelable: true,
        requiresRestConfirmation: true,
      });
    case "MATCHED":
    case "DELAYED":
      return Object.freeze({
        terminal: false,
        cancelable: false,
        requiresRestConfirmation: true,
      });
    case "UNMATCHED":
    case "CANCELED":
      return Object.freeze({
        terminal: true,
        cancelable: false,
        requiresRestConfirmation: true,
      });
  }
}

export type PolymarketTradeStatus =
  | "TRADE_STATUS_MATCHED"
  | "TRADE_STATUS_MATCHED_NOT_BROADCASTED"
  | "TRADE_STATUS_MINED"
  | "TRADE_STATUS_CONFIRMED"
  | "TRADE_STATUS_RETRYING"
  | "TRADE_STATUS_FAILED";

export interface PolymarketTradeDisposition {
  readonly terminal: boolean;
  readonly outcome: "unknown" | "confirmed" | "failed";
  readonly requiresRestAndBalanceConfirmation: true;
}

export function classifyPolymarketTradeState(
  status: PolymarketTradeStatus,
): PolymarketTradeDisposition {
  if (status === "TRADE_STATUS_CONFIRMED") {
    return Object.freeze({
      terminal: true,
      outcome: "confirmed",
      requiresRestAndBalanceConfirmation: true,
    });
  }
  if (status === "TRADE_STATUS_FAILED") {
    return Object.freeze({
      terminal: true,
      outcome: "failed",
      requiresRestAndBalanceConfirmation: true,
    });
  }
  return Object.freeze({
    terminal: false,
    outcome: "unknown",
    requiresRestAndBalanceConfirmation: true,
  });
}
