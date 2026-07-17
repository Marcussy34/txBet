import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInitialPolymarketCatalogCheckpoint,
  createPolymarketPublicClient,
  scanPolymarketCatalog,
  type PolymarketCatalogCheckpoint,
} from "@/venues/polymarket/public-client";
import {
  clobBookV1Schema,
  clobNegRiskV1Schema,
  clobTickSizeV1Schema,
  gammaMarketsKeysetPageV1Schema,
} from "@/venues/polymarket/public-schemas";

const CONDITION_ID = `0x${"ab".repeat(32)}`;
const TOKEN_A = "105267568073659068217311993901927962476298440625043565106676088842803600775810";
const TOKEN_B = "91863162118308663069733924043159186005106558783397508844234610341221325526200";
const NOW_MS = 1_784_238_770_635;

function gammaMarket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "540844",
    question: "Will Argentina win the 2026 World Cup?",
    conditionId: CONDITION_ID,
    slug: "will-argentina-win-the-2026-world-cup",
    resolutionSource: "https://www.fifa.com/",
    endDate: "2026-07-19T23:59:59Z",
    description: "Resolves Yes only if Argentina are declared champions by FIFA.",
    outcomes: '["Yes", "No"]',
    active: true,
    closed: false,
    archived: false,
    enableOrderBook: true,
    orderPriceMinTickSize: 0.001,
    clobTokenIds: JSON.stringify([TOKEN_A, TOKEN_B]),
    acceptingOrders: true,
    negRisk: false,
    updatedAt: "2026-07-17T10:00:00.123456Z",
    ...overrides,
  };
}

function gammaPage(
  markets: readonly Record<string, unknown>[],
  nextCursor?: string,
): Record<string, unknown> {
  return {
    $schema: "https://gamma-api.polymarket.com/schemas/MarketsKeysetListResponse.json",
    markets,
    ...(nextCursor === undefined ? {} : { next_cursor: nextCursor }),
  };
}

function book(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    market: CONDITION_ID,
    asset_id: TOKEN_A,
    timestamp: String(NOW_MS),
    hash: "9".repeat(40),
    bids: [{ price: "0.496", size: "72922.35" }],
    asks: [{ price: "0.497", size: "1285.1" }],
    min_order_size: "5",
    tick_size: "0.001",
    neg_risk: false,
    last_trade_price: "0.497",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientFor(
  fetchImplementation: typeof fetch,
  overrides: Partial<Parameters<typeof createPolymarketPublicClient>[0]> = {},
) {
  return createPolymarketPublicClient({
    fetchImplementation,
    clock: () => NOW_MS,
    timeoutMs: 250,
    maxBookAgeMs: 5_000,
    maxFutureSkewMs: 1_000,
    maxRateLimitRetries: 0,
    ...overrides,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("versioned official public schemas", () => {
  it("parses current Gamma, tick-size, neg-risk, and CLOB book payloads without decimal coercion", () => {
    const page = gammaMarketsKeysetPageV1Schema.parse(gammaPage([gammaMarket()], "cursor-2"));
    const tick = clobTickSizeV1Schema.parse({ minimum_tick_size: 0.001 });
    const negRisk = clobNegRiskV1Schema.parse({ neg_risk: false });
    const parsedBook = clobBookV1Schema.parse(book());

    expect(page.markets[0]).toMatchObject({
      orderPriceMinTickSize: "0.001",
      clobTokenIds: [TOKEN_A, TOKEN_B],
      outcomes: ["Yes", "No"],
    });
    expect(page.next_cursor).toBe("cursor-2");
    expect(tick.minimum_tick_size).toBe("0.001");
    expect(negRisk.neg_risk).toBe(false);
    expect(parsedBook.bids[0]).toEqual({ price: "0.496", size: "72922.35" });
  });

  it("rejects unknown tick enums, malformed authorization decimals, and invalid token IDs", () => {
    expect(() => clobTickSizeV1Schema.parse({ minimum_tick_size: 0.02 })).toThrow();
    expect(() => clobBookV1Schema.parse(book({ bids: [{ price: "4.96e-1", size: "1" }] }))).toThrow();
    expect(() =>
      gammaMarketsKeysetPageV1Schema.parse(
        gammaPage([gammaMarket({ clobTokenIds: '["0", "12"]' })]),
      ),
    ).toThrow();
  });

  it("rejects missing rule text instead of deriving settlement facts from a question", () => {
    expect(() =>
      gammaMarketsKeysetPageV1Schema.parse(
        gammaPage([gammaMarket({ description: "" })]),
      ),
    ).toThrow();
  });
});

describe("fixed-host public transport", () => {
  it("keeps cursor input inside the fixed Gamma query and marks inactive or closed rows unavailable", async () => {
    const requested: URL[] = [];
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      requested.push(new URL(input.toString()));
      return jsonResponse(
        gammaPage([
          gammaMarket({
            active: false,
            closed: true,
            question: "Argentina are already champions according to this title",
            description: "Official rule text remains independent from the display question.",
          }),
        ]),
      );
    }) as typeof fetch;

    const page = await clientFor(fetchImplementation).fetchCatalogPage(
      "https://evil.example/?closed=true&after_cursor=owned",
    );

    expect(requested).toHaveLength(1);
    expect(requested[0].origin).toBe("https://gamma-api.polymarket.com");
    expect(requested[0].pathname).toBe("/markets/keyset");
    expect(requested[0].searchParams.get("after_cursor")).toBe(
      "https://evil.example/?closed=true&after_cursor=owned",
    );
    expect(page.markets[0]).toMatchObject({
      availability: "UNAVAILABLE",
      availabilityBlockers: ["INACTIVE", "CLOSED"],
      settlement: {
        verification: "UNVERIFIED",
        ruleText: "Official rule text remains independent from the display question.",
      },
    });
  });

  it("uses redirect:error and fails closed on a redirect response", async () => {
    const fetchImplementation = vi.fn(async (_input, init) => {
      expect(init?.redirect).toBe("error");
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/markets" },
      });
    }) as typeof fetch;

    await expect(clientFor(fetchImplementation).fetchCatalogPage()).rejects.toThrow(
      /redirect/i,
    );
  });

  it("aborts a request after a bounded timeout", async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn(
      async () => await new Promise<Response>(() => undefined),
    ) as typeof fetch;
    const request = clientFor(fetchImplementation, { timeoutMs: 25 }).fetchCatalogPage();
    const assertion = expect(request).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("recovers from a bounded public 429 sequentially", async () => {
    const calls: string[] = [];
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(gammaPage([gammaMarket()]))) as typeof fetch;
    const sleep = vi.fn(async (delayMs: number) => {
      calls.push(`sleep:${delayMs}`);
    });

    const response = await clientFor(fetchImplementation, {
      maxRateLimitRetries: 1,
      sleep,
    }).fetchCatalogPage();

    expect(response.markets).toHaveLength(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["sleep:1000"]);
  });
});

describe("execution-time CLOB facts", () => {
  function executionFetch(
    overrides: {
      tick?: unknown;
      negRisk?: unknown;
      book?: unknown;
    } = {},
  ): typeof fetch {
    return vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      if (url.pathname === "/tick-size") {
        return jsonResponse(overrides.tick ?? { minimum_tick_size: 0.001 });
      }
      if (url.pathname === "/neg-risk") {
        return jsonResponse(overrides.negRisk ?? { neg_risk: false });
      }
      if (url.pathname === "/book") return jsonResponse(overrides.book ?? book());
      return jsonResponse({ error: "unexpected path" }, 404);
    }) as typeof fetch;
  }

  it("returns exact book decimals only when token, tick, negRisk, and freshness agree", async () => {
    const snapshot = await clientFor(executionFetch()).fetchExecutionMarketSnapshot(TOKEN_A);

    expect(snapshot).toMatchObject({
      schemaVersion: "polymarket-clob-market-snapshot-v1",
      tokenId: TOKEN_A,
      conditionId: CONDITION_ID,
      tickSize: "0.001",
      negRisk: false,
      sourceRevision: "9".repeat(40),
      observedAtEpochMs: String(NOW_MS),
      bids: [{ price: "0.496", size: "72922.35" }],
      asks: [{ price: "0.497", size: "1285.1" }],
    });
  });

  it("rejects tick-size and negRisk disagreement between current endpoints and the book", async () => {
    await expect(
      clientFor(executionFetch({ tick: { minimum_tick_size: 0.01 } }))
        .fetchExecutionMarketSnapshot(TOKEN_A),
    ).rejects.toThrow(/tick size mismatch/i);
    await expect(
      clientFor(executionFetch({ negRisk: { neg_risk: true } }))
        .fetchExecutionMarketSnapshot(TOKEN_A),
    ).rejects.toThrow(/negative-risk mismatch/i);
  });

  it("rejects stale books and off-tick price levels", async () => {
    await expect(
      clientFor(
        executionFetch({ book: book({ timestamp: String(NOW_MS - 5_001) }) }),
      ).fetchExecutionMarketSnapshot(TOKEN_A),
    ).rejects.toThrow(/stale/i);
    await expect(
      clientFor(
        executionFetch({ book: book({ bids: [{ price: "0.4965", size: "1" }] }) }),
      ).fetchExecutionMarketSnapshot(TOKEN_A),
    ).rejects.toThrow(/tick/i);
  });

  it("rejects token host injection before making a request", async () => {
    const fetchImplementation = executionFetch();
    await expect(
      clientFor(fetchImplementation).fetchExecutionMarketSnapshot(
        "1&redirect=https://evil.example",
      ),
    ).rejects.toThrow(/token id/i);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe("sequential keyset scan checkpoints", () => {
  it("walks later pages sequentially, dedupes revisions, and completes only after cursor exhaustion", async () => {
    const worldCup = gammaMarket({ id: "540845", updatedAt: "2026-07-17T10:01:00Z" });
    const responses = [
      gammaPage([gammaMarket()], "cursor-2"),
      gammaPage([gammaMarket(), worldCup]),
    ];
    const events: string[] = [];
    const retrievalTimes: number[] = [];
    const fetchMock = vi.fn(async () => {
      events.push(`fetch:${fetchMock.mock.calls.length}`);
      const response = responses.shift();
      if (response === undefined) return jsonResponse({ error: "no fixture" }, 500);
      return jsonResponse(response);
    });
    const fetchImplementation = fetchMock as typeof fetch;

    const final = await scanPolymarketCatalog(
      clientFor(fetchImplementation),
      {
        commitPage: async ({ markets, checkpoint, retrievedAtEpochMs }) => {
          retrievalTimes.push(retrievedAtEpochMs);
          events.push(`commit:${checkpoint.pageCount}:${markets.length}:${checkpoint.status}`);
        },
        complete: async (checkpoint) => {
          events.push(`complete:${checkpoint.status}`);
        },
      },
    );

    expect(final).toMatchObject({
      status: "COMPLETE",
      pageCount: 2,
      rowCount: 3,
      uniqueRevisionCount: 2,
      nextCursor: null,
    });
    expect(retrievalTimes).toEqual([NOW_MS, NOW_MS]);
    expect(events).toEqual([
      "fetch:1",
      "commit:1:1:SCANNING",
      "fetch:2",
      "commit:2:1:CURSOR_EXHAUSTED",
      "complete:COMPLETE",
    ]);
  });

  it("resumes from the last committed cursor after a mid-scan failure", async () => {
    let persisted: PolymarketCatalogCheckpoint | undefined;
    const firstFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(gammaPage([gammaMarket()], "cursor-2")))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503)) as typeof fetch;

    await expect(
      scanPolymarketCatalog(clientFor(firstFetch), {
        commitPage: async ({ checkpoint }) => {
          persisted = checkpoint;
        },
        complete: async () => undefined,
      }),
    ).rejects.toThrow(/503/);
    expect(persisted).toMatchObject({ status: "SCANNING", nextCursor: "cursor-2" });

    const resumedFetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      expect(url.searchParams.get("after_cursor")).toBe("cursor-2");
      return jsonResponse(gammaPage([gammaMarket()]));
    }) as typeof fetch;
    const committedCounts: number[] = [];
    const final = await scanPolymarketCatalog(
      clientFor(resumedFetch),
      {
        commitPage: async ({ markets }) => {
          committedCounts.push(markets.length);
        },
        complete: async () => undefined,
      },
      persisted,
    );

    expect(committedCounts).toEqual([0]);
    expect(final.status).toBe("COMPLETE");
    expect(resumedFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an echoed or previously requested cursor before another page commit", async () => {
    const checkpoint = {
      ...createInitialPolymarketCatalogCheckpoint(),
      nextCursor: "cursor-2",
    } satisfies PolymarketCatalogCheckpoint;
    const commitPage = vi.fn(async () => undefined);
    const fetchImplementation = vi.fn(async () =>
      jsonResponse(gammaPage([gammaMarket()], "cursor-2")),
    ) as typeof fetch;

    await expect(
      scanPolymarketCatalog(
        clientFor(fetchImplementation),
        { commitPage, complete: async () => undefined },
        checkpoint,
      ),
    ).rejects.toThrow(/cursor/i);
    expect(commitPage).not.toHaveBeenCalled();
  });

  it("finishes an already exhausted persisted checkpoint without fetching again", async () => {
    const fetchImplementation = vi.fn() as typeof fetch;
    const complete = vi.fn(async () => undefined);
    const checkpoint = {
      ...createInitialPolymarketCatalogCheckpoint(),
      status: "CURSOR_EXHAUSTED",
    } satisfies PolymarketCatalogCheckpoint;

    const final = await scanPolymarketCatalog(
      clientFor(fetchImplementation),
      { commitPage: async () => undefined, complete },
      checkpoint,
    );

    expect(final.status).toBe("COMPLETE");
    expect(complete).toHaveBeenCalledOnce();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
