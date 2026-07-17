import { EventSource, type FetchLike } from "eventsource";
import { z } from "zod";

export const DEFAULT_TXLINE_BASE_URL = "https://txline.txodds.com";

const guestSchema = z.object({ token: z.string().min(1) }).passthrough();

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function buildScoreSnapshotUrl(baseUrl: string, fixtureId: string): string {
  return `${normalizedBaseUrl(baseUrl)}/api/scores/snapshot/${encodeURIComponent(fixtureId)}`;
}

export function buildScoreStreamUrl(baseUrl: string, fixtureId: string): string {
  const url = new URL("/api/scores/stream", normalizedBaseUrl(baseUrl));
  url.searchParams.set("fixtureId", fixtureId);
  return url.toString();
}

export function buildOddsStreamUrl(baseUrl: string, fixtureId: string): string {
  const url = new URL("/api/odds/stream", normalizedBaseUrl(baseUrl));
  url.searchParams.set("fixtureId", fixtureId);
  return url.toString();
}

export interface TxLineRequestOptions {
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
}

export async function startGuestSession(
  baseUrl = DEFAULT_TXLINE_BASE_URL,
  options: TxLineRequestOptions = {},
): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${normalizedBaseUrl(baseUrl)}/auth/guest/start`, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`TxLINE guest session failed with HTTP ${response.status}`);
  return guestSchema.parse(await response.json()).token;
}

export function txLineHeaders(guestJwt: string, apiToken: string): Headers {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${guestJwt}`);
  headers.set("X-Api-Token", apiToken);
  return headers;
}

/**
 * Add TxLINE credentials without discarding EventSource-managed request headers.
 * EventSource owns headers such as Last-Event-ID when it reconnects.
 */
export function createTxLineStreamFetch(
  guestJwt: string,
  apiToken: string,
  fetcher: typeof fetch = fetch,
): FetchLike {
  return (url, init) => {
    const headers = new Headers(init.headers);
    headers.set("Accept", "text/event-stream");
    headers.set("Authorization", `Bearer ${guestJwt}`);
    headers.set("X-Api-Token", apiToken);
    return fetcher(url, { ...init, headers });
  };
}

export async function fetchScoreSnapshot(input: {
  baseUrl?: string;
  fixtureId: string;
  guestJwt: string;
  apiToken: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}): Promise<readonly unknown[]> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(
    buildScoreSnapshotUrl(input.baseUrl ?? DEFAULT_TXLINE_BASE_URL, input.fixtureId),
    {
      headers: txLineHeaders(input.guestJwt, input.apiToken),
      signal: input.signal,
    },
  );
  if (!response.ok) throw new Error(`TxLINE score snapshot failed with HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["data", "scores", "items"]) {
      if (Array.isArray(record[key])) return record[key] as readonly unknown[];
    }
  }
  throw new Error("TxLINE score snapshot returned an unsupported payload shape");
}

export function openScoreStream(input: {
  baseUrl?: string;
  fixtureId: string;
  guestJwt: string;
  apiToken: string;
  onPayload: (payload: unknown) => void;
  onOpen?: () => void;
  onError?: (error: unknown) => void;
  fetcher?: typeof fetch;
}): EventSource {
  const source = new EventSource(
    buildScoreStreamUrl(input.baseUrl ?? DEFAULT_TXLINE_BASE_URL, input.fixtureId),
    {
      fetch: createTxLineStreamFetch(input.guestJwt, input.apiToken, input.fetcher),
    },
  );
  source.onopen = () => input.onOpen?.();
  source.onmessage = (message) => {
    try {
      input.onPayload(JSON.parse(message.data));
    } catch (error) {
      input.onError?.(error);
    }
  };
  source.onerror = (error) => input.onError?.(error);
  return source;
}
