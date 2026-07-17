import { z } from "zod";

export const POLYMARKET_PUBLIC_SCHEMA_VERSION = "polymarket-public-v1" as const;

const MAX_UINT256 = (1n << 256n) - 1n;
const canonicalDecimalPattern = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/;
const positiveIntegerPattern = /^[1-9][0-9]*$/;

function isTokenId(value: string): boolean {
  return positiveIntegerPattern.test(value) && BigInt(value) <= MAX_UINT256;
}

function decimalMicros(value: string): bigint | null {
  const match = canonicalDecimalPattern.exec(value);
  if (match === null) return null;
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

const nonemptyString = z.string().refine(
  (value) => value.trim().length > 0,
  "Expected a nonempty string",
);

export const polymarketTokenIdV1Schema = z.string().refine(
  isTokenId,
  "Polymarket token ID must be a positive uint256 decimal integer",
);

export const polymarketConditionIdV1Schema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Expected a 32-byte condition ID");

export const polymarketCursorV1Schema = z
  .string()
  .min(1)
  .max(8_192)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Cursor contains control characters");

export const polymarketTickSizeDecimalV1Schema = z.enum([
  "0.1",
  "0.01",
  "0.005",
  "0.0025",
  "0.001",
  "0.0001",
]);

const polymarketTickSizeNumberV1Schema = z
  .union([
    z.literal(0.1),
    z.literal(0.01),
    z.literal(0.005),
    z.literal(0.0025),
    z.literal(0.001),
    z.literal(0.0001),
  ])
  .transform((value) => {
    switch (value) {
      case 0.1:
        return "0.1" as const;
      case 0.01:
        return "0.01" as const;
      case 0.005:
        return "0.005" as const;
      case 0.0025:
        return "0.0025" as const;
      case 0.001:
        return "0.001" as const;
      case 0.0001:
        return "0.0001" as const;
    }
  });

const encodedStringArrayV1Schema = z.string().transform((value, context) => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    context.addIssue({ code: "custom", message: "Expected a JSON-encoded string array" });
    return z.NEVER;
  }
  return decoded;
});

const encodedOutcomesV1Schema = encodedStringArrayV1Schema.pipe(
  z
    .tuple([nonemptyString, nonemptyString])
    .refine(([left, right]) => left !== right, "Outcome labels must be distinct"),
);

const encodedTokenIdsV1Schema = encodedStringArrayV1Schema.pipe(
  z
    .tuple([polymarketTokenIdV1Schema, polymarketTokenIdV1Schema])
    .refine(([left, right]) => left !== right, "Outcome token IDs must be distinct"),
);

/** Current official Gamma keyset market fields used by the live-lane catalog. */
export const gammaMarketV1Schema = z.object({
  id: z.string().regex(positiveIntegerPattern),
  question: nonemptyString,
  conditionId: polymarketConditionIdV1Schema,
  slug: nonemptyString,
  resolutionSource: z.string(),
  endDate: z.iso.datetime({ offset: true }),
  description: nonemptyString,
  outcomes: encodedOutcomesV1Schema,
  active: z.boolean(),
  closed: z.boolean(),
  archived: z.boolean(),
  enableOrderBook: z.boolean(),
  orderPriceMinTickSize: polymarketTickSizeNumberV1Schema,
  clobTokenIds: encodedTokenIdsV1Schema,
  acceptingOrders: z.boolean(),
  negRisk: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});

/** Current official Gamma `/markets/keyset` response. */
export const gammaMarketsKeysetPageV1Schema = z.object({
  $schema: z
    .literal("https://gamma-api.polymarket.com/schemas/MarketsKeysetListResponse.json")
    .optional(),
  markets: z.array(gammaMarketV1Schema),
  next_cursor: polymarketCursorV1Schema.optional(),
});

/** Current official CLOB `/tick-size` response. */
export const clobTickSizeV1Schema = z.object({
  minimum_tick_size: polymarketTickSizeNumberV1Schema,
});

/** Current official CLOB `/neg-risk` response. */
export const clobNegRiskV1Schema = z.object({
  neg_risk: z.boolean(),
});

const positiveBookDecimalV1Schema = z.string().refine((value) => {
  const atomic = decimalMicros(value);
  return atomic !== null && atomic > 0n;
}, "Expected a positive canonical decimal with at most six places");

const bookPriceV1Schema = z.string().refine((value) => {
  const atomic = decimalMicros(value);
  return atomic !== null && atomic > 0n && atomic < 1_000_000n;
}, "Expected a canonical price strictly between zero and one");

const lastTradePriceV1Schema = z.string().refine((value) => {
  const atomic = decimalMicros(value);
  return atomic !== null && atomic >= 0n && atomic <= 1_000_000n;
}, "Expected a canonical price from zero through one");

export const clobBookLevelV1Schema = z.object({
  price: bookPriceV1Schema,
  size: positiveBookDecimalV1Schema,
});

/** Current official CLOB `/book` response with exact wire decimals preserved. */
export const clobBookV1Schema = z.object({
  market: polymarketConditionIdV1Schema,
  asset_id: polymarketTokenIdV1Schema,
  timestamp: z.string().regex(positiveIntegerPattern),
  hash: z.string().regex(/^[a-f0-9]{40}$/),
  bids: z.array(clobBookLevelV1Schema),
  asks: z.array(clobBookLevelV1Schema),
  min_order_size: positiveBookDecimalV1Schema,
  tick_size: polymarketTickSizeDecimalV1Schema,
  neg_risk: z.boolean(),
  last_trade_price: lastTradePriceV1Schema.nullish(),
});

export type GammaMarketV1 = Readonly<z.infer<typeof gammaMarketV1Schema>>;
export type GammaMarketsKeysetPageV1 = Readonly<
  z.infer<typeof gammaMarketsKeysetPageV1Schema>
>;
export type ClobBookV1 = Readonly<z.infer<typeof clobBookV1Schema>>;
