import { z } from "zod";

import {
  clobBookV1Schema,
  clobNegRiskV1Schema,
  clobTickSizeV1Schema,
  gammaMarketsKeysetPageV1Schema,
  polymarketCursorV1Schema,
  polymarketTokenIdV1Schema,
  type ClobBookV1,
  type GammaMarketV1,
} from "./public-schemas";

const GAMMA_ORIGIN = "https://gamma-api.polymarket.com";
const CLOB_ORIGIN = "https://clob.polymarket.com";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BOOK_AGE_MS = 15_000;
const DEFAULT_MAX_FUTURE_SKEW_MS = 2_000;
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_DELAY_MS = 5_000;

export type PolymarketMarketAvailabilityBlocker =
  | "INACTIVE"
  | "CLOSED"
  | "ARCHIVED"
  | "ORDER_BOOK_DISABLED"
  | "NOT_ACCEPTING_ORDERS";

export interface PolymarketCatalogMarket {
  readonly schemaVersion: "polymarket-gamma-market-v1";
  readonly contractId: string;
  readonly venueRevisionId: string;
  readonly conditionId: string;
  readonly displayQuestion: string;
  readonly slug: string;
  readonly endAt: string;
  readonly sourceUpdatedAt: string;
  readonly catalogTickSize: string;
  readonly catalogNegRisk: boolean;
  readonly outcomes: readonly Readonly<{ label: string; tokenId: string }>[];
  readonly availability: "ACTIVE" | "UNAVAILABLE";
  readonly availabilityBlockers: readonly PolymarketMarketAvailabilityBlocker[];
  readonly settlement: Readonly<{
    verification: "UNVERIFIED";
    ruleText: string;
    resolutionSource: string | null;
  }>;
}

export interface PolymarketCatalogPage {
  readonly schemaVersion: "polymarket-gamma-page-v1";
  readonly markets: readonly PolymarketCatalogMarket[];
  readonly nextCursor: string | null;
  readonly retrievedAtEpochMs: number;
}

export interface PolymarketClobMarketSnapshot {
  readonly schemaVersion: "polymarket-clob-market-snapshot-v1";
  readonly tokenId: string;
  readonly conditionId: string;
  readonly observedAtEpochMs: string;
  readonly retrievedAtEpochMs: number;
  readonly sourceRevision: string;
  readonly tickSize: string;
  readonly negRisk: boolean;
  readonly minimumOrderSize: string;
  readonly lastTradePrice: string | null;
  readonly bids: readonly Readonly<{ price: string; size: string }>[];
  readonly asks: readonly Readonly<{ price: string; size: string }>[];
}

export interface PolymarketPublicClientOptions {
  readonly fetchImplementation?: typeof fetch;
  readonly clock?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly timeoutMs?: number;
  readonly maxBookAgeMs?: number;
  readonly maxFutureSkewMs?: number;
  readonly maxRateLimitRetries?: number;
}

export interface PolymarketPublicClient {
  fetchCatalogPage(afterCursor?: string | null): Promise<PolymarketCatalogPage>;
  fetchExecutionMarketSnapshot(tokenId: string): Promise<PolymarketClobMarketSnapshot>;
}

export class PolymarketPublicTimeoutError extends Error {
  override readonly name = "PolymarketPublicTimeoutError";

  constructor() {
    super("Polymarket public request timed out");
  }
}

export class PolymarketPublicRedirectError extends Error {
  override readonly name = "PolymarketPublicRedirectError";

  constructor() {
    super("Polymarket public request returned a redirect");
  }
}

function assertBoundedInteger(value: number, label: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${label} must be an integer from 0 through ${maximum}`);
  }
}

function currentTime(clock: () => number): number {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Polymarket clock must return nonnegative epoch milliseconds");
  }
  return value;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function retryDelayMs(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter === null || !/^[0-9]+$/.test(retryAfter)) return 100;
  const milliseconds = BigInt(retryAfter) * 1_000n;
  if (milliseconds > BigInt(MAX_RATE_LIMIT_DELAY_MS)) return MAX_RATE_LIMIT_DELAY_MS;
  return parseInt(milliseconds.toString(), 10);
}

async function fetchWithTimeout(
  url: URL,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Settle the explicit timeout before aborting the transport promise.
      reject(new PolymarketPublicTimeoutError());
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchImplementation(url, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      }),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function assertNoRedirect(response: Response, expectedUrl: URL): void {
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new PolymarketPublicRedirectError();
  }
  if (response.url.length === 0) return;

  let responseUrl: URL;
  try {
    responseUrl = new URL(response.url);
  } catch {
    throw new PolymarketPublicRedirectError();
  }
  if (responseUrl.origin !== expectedUrl.origin) throw new PolymarketPublicRedirectError();
}

async function requestJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  options: Readonly<{
    fetchImplementation: typeof fetch;
    maxRateLimitRetries: number;
    sleep: (delayMs: number) => Promise<void>;
    timeoutMs: number;
  }>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchWithTimeout(
      url,
      options.fetchImplementation,
      options.timeoutMs,
    );
    assertNoRedirect(response, url);
    if (response.status === 429 && attempt < options.maxRateLimitRetries) {
      await options.sleep(retryDelayMs(response));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Polymarket public request failed with HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new Error("Polymarket public response was not valid JSON", { cause });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new Error("Polymarket public response failed its versioned schema", {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }
}

function catalogUrl(afterCursor: string | null): URL {
  if (afterCursor !== null) polymarketCursorV1Schema.parse(afterCursor);
  const url = new URL("/markets/keyset", GAMMA_ORIGIN);
  url.searchParams.set("limit", "100");
  url.searchParams.set("closed", "false");
  url.searchParams.set("decimalized", "true");
  if (afterCursor !== null) url.searchParams.set("after_cursor", afterCursor);
  return url;
}

function clobUrl(path: "/book" | "/neg-risk" | "/tick-size", tokenId: string): URL {
  polymarketTokenIdV1Schema.parse(tokenId);
  const url = new URL(path, CLOB_ORIGIN);
  url.searchParams.set("token_id", tokenId);
  return url;
}

function availabilityBlockers(
  market: GammaMarketV1,
): readonly PolymarketMarketAvailabilityBlocker[] {
  const blockers: PolymarketMarketAvailabilityBlocker[] = [];
  if (!market.active) blockers.push("INACTIVE");
  if (market.closed) blockers.push("CLOSED");
  if (market.archived) blockers.push("ARCHIVED");
  if (!market.enableOrderBook) blockers.push("ORDER_BOOK_DISABLED");
  if (!market.acceptingOrders) blockers.push("NOT_ACCEPTING_ORDERS");
  return Object.freeze(blockers);
}

function normalizeCatalogMarket(market: GammaMarketV1): PolymarketCatalogMarket {
  const blockers = availabilityBlockers(market);
  const outcomes = market.outcomes.map((label, index) =>
    Object.freeze({ label, tokenId: market.clobTokenIds[index] }),
  );
  return Object.freeze({
    schemaVersion: "polymarket-gamma-market-v1",
    contractId: market.id,
    venueRevisionId: `${market.id}:${market.updatedAt}`,
    conditionId: market.conditionId,
    displayQuestion: market.question,
    slug: market.slug,
    endAt: market.endDate,
    sourceUpdatedAt: market.updatedAt,
    catalogTickSize: market.orderPriceMinTickSize,
    catalogNegRisk: market.negRisk,
    outcomes: Object.freeze(outcomes),
    availability: blockers.length === 0 ? "ACTIVE" : "UNAVAILABLE",
    availabilityBlockers: blockers,
    // Settlement text is preserved as unverified source evidence. The display title is never parsed.
    settlement: Object.freeze({
      verification: "UNVERIFIED",
      ruleText: market.description,
      resolutionSource:
        market.resolutionSource.trim().length === 0 ? null : market.resolutionSource,
    }),
  });
}

function decimalMicros(value: string): bigint {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(value);
  if (match === null) throw new Error("Polymarket authorization decimal is not canonical");
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

function assertBookMatchesCurrentFacts(
  book: ClobBookV1,
  tokenId: string,
  tickSize: string,
  negRisk: boolean,
): void {
  if (book.asset_id !== tokenId) throw new Error("Polymarket book token ID mismatch");
  if (book.tick_size !== tickSize) throw new Error("Polymarket tick size mismatch");
  if (book.neg_risk !== negRisk) throw new Error("Polymarket negative-risk mismatch");

  const tickAtomic = decimalMicros(tickSize);
  for (const level of [...book.bids, ...book.asks]) {
    if (decimalMicros(level.price) % tickAtomic !== 0n) {
      throw new Error("Polymarket book contains an off-tick price level");
    }
  }
}

function assertFreshBook(
  timestamp: string,
  nowMs: number,
  maxBookAgeMs: number,
  maxFutureSkewMs: number,
): void {
  const observed = BigInt(timestamp);
  const now = BigInt(nowMs);
  if (observed > now + BigInt(maxFutureSkewMs)) {
    throw new Error("Polymarket book timestamp is too far in the future");
  }
  if (observed < now - BigInt(maxBookAgeMs)) {
    throw new Error("Polymarket book is stale");
  }
}

function frozenLevels(
  levels: ClobBookV1["bids"],
): readonly Readonly<{ price: string; size: string }>[] {
  return Object.freeze(levels.map((level) => Object.freeze({ ...level })));
}

export function createPolymarketPublicClient(
  options: PolymarketPublicClientOptions = {},
): PolymarketPublicClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const clock = options.clock ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBookAgeMs = options.maxBookAgeMs ?? DEFAULT_MAX_BOOK_AGE_MS;
  const maxFutureSkewMs = options.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS;
  const maxRateLimitRetries =
    options.maxRateLimitRetries ?? DEFAULT_MAX_RATE_LIMIT_RETRIES;
  assertBoundedInteger(timeoutMs, "Polymarket timeout", 30_000);
  if (timeoutMs === 0) throw new Error("Polymarket timeout must be at least one millisecond");
  assertBoundedInteger(maxBookAgeMs, "Polymarket maximum book age", 300_000);
  assertBoundedInteger(maxFutureSkewMs, "Polymarket future skew", 60_000);
  assertBoundedInteger(maxRateLimitRetries, "Polymarket rate-limit retries", 3);

  const requestOptions = Object.freeze({
    fetchImplementation,
    maxRateLimitRetries,
    sleep,
    timeoutMs,
  });

  return Object.freeze({
    async fetchCatalogPage(afterCursor: string | null = null) {
      const body = await requestJson(
        catalogUrl(afterCursor),
        gammaMarketsKeysetPageV1Schema,
        requestOptions,
      );
      return Object.freeze({
        schemaVersion: "polymarket-gamma-page-v1",
        markets: Object.freeze(body.markets.map(normalizeCatalogMarket)),
        nextCursor: body.next_cursor ?? null,
        retrievedAtEpochMs: currentTime(clock),
      });
    },

    async fetchExecutionMarketSnapshot(tokenId: string) {
      polymarketTokenIdV1Schema.parse(tokenId);
      const [tick, negRisk, book] = await Promise.all([
        requestJson(clobUrl("/tick-size", tokenId), clobTickSizeV1Schema, requestOptions),
        requestJson(clobUrl("/neg-risk", tokenId), clobNegRiskV1Schema, requestOptions),
        requestJson(clobUrl("/book", tokenId), clobBookV1Schema, requestOptions),
      ]);
      assertBookMatchesCurrentFacts(
        book,
        tokenId,
        tick.minimum_tick_size,
        negRisk.neg_risk,
      );
      const retrievedAtEpochMs = currentTime(clock);
      assertFreshBook(
        book.timestamp,
        retrievedAtEpochMs,
        maxBookAgeMs,
        maxFutureSkewMs,
      );
      return Object.freeze({
        schemaVersion: "polymarket-clob-market-snapshot-v1",
        tokenId,
        conditionId: book.market,
        observedAtEpochMs: book.timestamp,
        retrievedAtEpochMs,
        sourceRevision: book.hash,
        tickSize: tick.minimum_tick_size,
        negRisk: negRisk.neg_risk,
        minimumOrderSize: book.min_order_size,
        lastTradePrice: book.last_trade_price ?? null,
        bids: frozenLevels(book.bids),
        asks: frozenLevels(book.asks),
      });
    },
  });
}

const catalogCheckpointV1Schema = z
  .object({
    schemaVersion: z.literal("polymarket-catalog-checkpoint-v1"),
    status: z.enum(["SCANNING", "CURSOR_EXHAUSTED", "COMPLETE"]),
    nextCursor: polymarketCursorV1Schema.nullable(),
    pageCount: z.number().int().nonnegative().safe(),
    rowCount: z.number().int().nonnegative().safe(),
    uniqueRevisionCount: z.number().int().nonnegative().safe(),
    seenRevisionIds: z.array(z.string().min(1)),
    requestedCursors: z.array(polymarketCursorV1Schema),
  })
  .superRefine((checkpoint, context) => {
    if (new Set(checkpoint.seenRevisionIds).size !== checkpoint.seenRevisionIds.length) {
      context.addIssue({ code: "custom", message: "Seen revision IDs must be unique" });
    }
    if (checkpoint.uniqueRevisionCount !== checkpoint.seenRevisionIds.length) {
      context.addIssue({ code: "custom", message: "Unique revision count is inconsistent" });
    }
    if (new Set(checkpoint.requestedCursors).size !== checkpoint.requestedCursors.length) {
      context.addIssue({ code: "custom", message: "Requested cursors must be unique" });
    }
    if (checkpoint.status !== "SCANNING" && checkpoint.nextCursor !== null) {
      context.addIssue({ code: "custom", message: "An exhausted scan cannot have a cursor" });
    }
  });

export interface PolymarketCatalogCheckpoint {
  readonly schemaVersion: "polymarket-catalog-checkpoint-v1";
  readonly status: "SCANNING" | "CURSOR_EXHAUSTED" | "COMPLETE";
  readonly nextCursor: string | null;
  readonly pageCount: number;
  readonly rowCount: number;
  readonly uniqueRevisionCount: number;
  readonly seenRevisionIds: readonly string[];
  readonly requestedCursors: readonly string[];
}

export interface PolymarketCatalogPageCommit {
  readonly markets: readonly PolymarketCatalogMarket[];
  readonly rawRowCount: number;
  readonly retrievedAtEpochMs: number;
  readonly checkpoint: PolymarketCatalogCheckpoint;
}

export interface PolymarketCatalogSink {
  /** Atomically persist the page effects and its supplied restart checkpoint. */
  commitPage(commit: PolymarketCatalogPageCommit): Promise<void>;
  /** Persist COMPLETE only after a terminal page checkpoint is durable. */
  complete(checkpoint: PolymarketCatalogCheckpoint): Promise<void>;
}

function freezeCheckpoint(value: PolymarketCatalogCheckpoint): PolymarketCatalogCheckpoint {
  const parsed = catalogCheckpointV1Schema.parse(value);
  return Object.freeze({
    ...parsed,
    seenRevisionIds: Object.freeze([...parsed.seenRevisionIds]),
    requestedCursors: Object.freeze([...parsed.requestedCursors]),
  });
}

export function createInitialPolymarketCatalogCheckpoint(): PolymarketCatalogCheckpoint {
  return freezeCheckpoint({
    schemaVersion: "polymarket-catalog-checkpoint-v1",
    status: "SCANNING",
    nextCursor: null,
    pageCount: 0,
    rowCount: 0,
    uniqueRevisionCount: 0,
    seenRevisionIds: [],
    requestedCursors: [],
  });
}

async function finishCatalogScan(
  checkpoint: PolymarketCatalogCheckpoint,
  sink: PolymarketCatalogSink,
): Promise<PolymarketCatalogCheckpoint> {
  const completed = freezeCheckpoint({ ...checkpoint, status: "COMPLETE" });
  await sink.complete(completed);
  return completed;
}

/** Walk Gamma keyset pages one at a time and expose a durable restart point per page. */
export async function scanPolymarketCatalog(
  client: PolymarketPublicClient,
  sink: PolymarketCatalogSink,
  resumeFrom?: PolymarketCatalogCheckpoint,
): Promise<PolymarketCatalogCheckpoint> {
  let checkpoint = freezeCheckpoint(
    resumeFrom ?? createInitialPolymarketCatalogCheckpoint(),
  );
  if (checkpoint.status === "COMPLETE") return checkpoint;
  if (checkpoint.status === "CURSOR_EXHAUSTED") {
    return finishCatalogScan(checkpoint, sink);
  }

  for (;;) {
    const requestedCursor = checkpoint.nextCursor;
    if (
      requestedCursor !== null &&
      checkpoint.requestedCursors.includes(requestedCursor)
    ) {
      throw new Error("Polymarket catalog checkpoint would repeat a requested cursor");
    }
    const page = await client.fetchCatalogPage(requestedCursor);
    const requestedCursors =
      requestedCursor === null
        ? checkpoint.requestedCursors
        : [...checkpoint.requestedCursors, requestedCursor];
    if (
      page.nextCursor !== null &&
      (page.nextCursor === requestedCursor || requestedCursors.includes(page.nextCursor))
    ) {
      throw new Error("Polymarket catalog returned an echoed or repeated cursor");
    }

    const seen = new Set(checkpoint.seenRevisionIds);
    const newMarkets = page.markets.filter((market) => {
      if (seen.has(market.venueRevisionId)) return false;
      seen.add(market.venueRevisionId);
      return true;
    });
    const exhausted = page.nextCursor === null;
    const nextCheckpoint = freezeCheckpoint({
      schemaVersion: "polymarket-catalog-checkpoint-v1",
      status: exhausted ? "CURSOR_EXHAUSTED" : "SCANNING",
      nextCursor: page.nextCursor,
      pageCount: checkpoint.pageCount + 1,
      rowCount: checkpoint.rowCount + page.markets.length,
      uniqueRevisionCount: seen.size,
      seenRevisionIds: [...seen],
      requestedCursors,
    });
    await sink.commitPage(
      Object.freeze({
        markets: Object.freeze(newMarkets),
        rawRowCount: page.markets.length,
        retrievedAtEpochMs: page.retrievedAtEpochMs,
        checkpoint: nextCheckpoint,
      }),
    );
    checkpoint = nextCheckpoint;
    if (checkpoint.status === "CURSOR_EXHAUSTED") {
      return finishCatalogScan(checkpoint, sink);
    }
  }
}
