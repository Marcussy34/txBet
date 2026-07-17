import {
  OrderSide,
  OrderType,
  SignatureType,
} from "@polymarket/client";
import { z } from "zod";

import type { VenueQuantity } from "@/core/live-money";

const SUPPORTED_TICK_SIZE_MICROS = new Set([
  100_000,
  10_000,
  5_000,
  2_500,
  1_000,
  100,
]);

const pinnedProductionSchema = z.object({
  name: z.literal("production"),
  chainId: z.literal(137),
  clob: z.object({
    rest: z.literal("https://clob.polymarket.com"),
    market: z.object({
      ws: z.literal("wss://ws-subscriptions-clob.polymarket.com/ws/market"),
    }),
    user: z.object({
      ws: z.literal("wss://ws-subscriptions-clob.polymarket.com/ws/user"),
    }),
  }),
  relayer: z.object({
    rest: z.literal("https://relayer-v2.polymarket.com"),
  }),
  gamma: z.object({
    rest: z.literal("https://gamma-api.polymarket.com"),
  }),
  walletDerivation: z.object({
    depositWalletFactory: z.literal(
      "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07",
    ),
  }),
  contracts: z.object({
    collateralToken: z.literal(
      "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
    ),
    conditionalTokens: z.literal(
      "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
    ),
    standardExchange: z.literal(
      "0xE111180000d2663C0091e4f400237545B87B996B",
    ),
    negRiskExchange: z.literal(
      "0xe2222d279d744050d28e00520010520000310F59",
    ),
    exchangeV3: z.literal("0xe3333700cA9d93003F00f0F71f8515005F6c00Aa"),
  }),
});

export function assertPinnedPolymarketProduction(value: unknown): void {
  const result = pinnedProductionSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Polymarket production SDK baseline drifted: ${result.error.message}`);
  }
}

function decimalFromAtomic(atomic: string, scale: number): string {
  if (!/^(0|[1-9][0-9]*)$/.test(atomic)) {
    throw new Error("Polymarket amount must be a canonical atomic integer");
  }
  if (!Number.isSafeInteger(scale) || scale < 0) {
    throw new Error("Polymarket amount scale must be a nonnegative integer");
  }
  if (scale === 0) return atomic;

  const padded = atomic.padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}

export interface ExactInventorySellInput {
  readonly oppositeTokenId: string;
  readonly quantity: VenueQuantity;
  readonly minimumPriceMicros: number;
  readonly tickSizeMicros: number;
}

export interface ExactInventorySellRequest {
  readonly tokenId: string;
  readonly side: typeof OrderSide.SELL;
  readonly shares: string;
  readonly minPrice: string;
  readonly orderType: typeof OrderType.FOK;
}

/**
 * Exact live Polymarket exposure uses pre-split complete-set inventory, then
 * FOK-sells the undesired outcome. Direct market BUY amounts are USD notional.
 */
export function createExactInventorySellRequest(
  input: ExactInventorySellInput,
): ExactInventorySellRequest {
  if (!/^[1-9][0-9]*$/.test(input.oppositeTokenId)) {
    throw new Error("Polymarket token ID must be a positive decimal integer");
  }
  if (input.quantity.scale !== 6) {
    throw new Error("Polymarket exact inventory must use six-decimal shares");
  }
  if (BigInt(input.quantity.atomic) % 10_000n !== 0n) {
    throw new Error(
      "Polymarket market-order shares must align to the SDK's two-decimal precision",
    );
  }
  if (!SUPPORTED_TICK_SIZE_MICROS.has(input.tickSizeMicros)) {
    throw new Error("Polymarket order must use a supported tick size");
  }
  if (
    !Number.isSafeInteger(input.minimumPriceMicros) ||
    input.minimumPriceMicros <= 0 ||
    input.minimumPriceMicros > 1_000_000 - input.tickSizeMicros ||
    input.minimumPriceMicros % input.tickSizeMicros !== 0
  ) {
    throw new Error(
      "Polymarket minimum price must align to the market tick below one dollar",
    );
  }

  return Object.freeze({
    tokenId: input.oppositeTokenId,
    side: OrderSide.SELL,
    shares: decimalFromAtomic(input.quantity.atomic, input.quantity.scale),
    minPrice: decimalFromAtomic(String(input.minimumPriceMicros), 6),
    orderType: OrderType.FOK,
  });
}

export interface ExactSignedInventorySellExpectation {
  readonly depositWalletAddress: string;
  readonly quantityAtomic: string;
  readonly minimumProceedsAtomic: string;
  readonly oppositeTokenId: string;
}

const signedInventorySellSchema = z.object({
  maker: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  makerAmount: z.string().regex(/^[1-9][0-9]*$/),
  signer: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  takerAmount: z.string().regex(/^[1-9][0-9]*$/),
  tokenId: z.string().regex(/^[1-9][0-9]*$/),
  side: z.literal(OrderSide.SELL),
  signatureType: z.literal(SignatureType.POLY_1271),
  orderType: z.literal(OrderType.FOK),
  // POLY_1271 wraps the raw 65-byte signature in a 317-byte ERC-7739 payload.
  signature: z.string().regex(/^0x[a-fA-F0-9]{634}$/),
});

/** Recheck the exposure-defining SDK output before the separately persisted post. */
export function assertExactSignedInventorySell(
  signedOrder: unknown,
  expected: ExactSignedInventorySellExpectation,
): void {
  const signed = signedInventorySellSchema.safeParse(signedOrder);
  if (!signed.success) {
    throw new Error(`Invalid signed Polymarket FOK sell: ${signed.error.message}`);
  }
  if (signed.data.maker.toLowerCase() !== expected.depositWalletAddress.toLowerCase()) {
    throw new Error("Signed Polymarket maker is not the deposit wallet");
  }
  if (signed.data.signer.toLowerCase() !== expected.depositWalletAddress.toLowerCase()) {
    throw new Error("Signed Polymarket order signer is not the deposit wallet");
  }
  if (signed.data.makerAmount !== expected.quantityAtomic) {
    throw new Error("Signed Polymarket maker amount does not equal exact requested shares");
  }
  if (signed.data.takerAmount !== expected.minimumProceedsAtomic) {
    throw new Error("Signed Polymarket proceeds do not equal the protected price floor");
  }
  if (signed.data.tokenId !== expected.oppositeTokenId) {
    throw new Error("Signed Polymarket token ID does not match the opposite outcome");
  }
}

export function rejectDirectFokBuy(): never {
  throw new Error(
    "Polymarket direct FOK BUY is USD-notional and therefore not exact shares",
  );
}
