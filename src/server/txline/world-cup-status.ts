import {
  fetchScoreSnapshot,
  startGuestSession,
} from "@/lib/txline/client";

const TXLINE_MAINNET_HOST = "https://txline.txodds.com" as const;
const INT32_MAX = 2_147_483_647;
export const TXLINE_WORLD_CUP_OBSERVATION_MAX_AGE_MS = 30_000;
export const TXLINE_WORLD_CUP_REQUEST_TIMEOUT_MS = 4_000;
export const TXLINE_WORLD_CUP_STATUS_CACHE_TTL_MS = 1_000;

type EnvSource = Readonly<Record<string, string | undefined>>;

export interface TxLineWorldCupDependencies {
  readonly startGuestSession: typeof startGuestSession;
  readonly fetchScoreSnapshot: typeof fetchScoreSnapshot;
}

export type WorldCupStatus = Readonly<
  | {
      status: "unconfigured";
      provenance: "deterministic-replay";
      verification: "REPLAY_NOT_LIVE";
      reason: "TXLINE_MVP_NOT_CONFIGURED";
    }
  | {
      status: "unavailable";
      provenance: "txline-mainnet-rest";
      verification: "LIVE_UNVERIFIED";
      reason:
        | "INVALID_TXLINE_MVP_CONFIGURATION"
        | "NO_VALID_TXLINE_OBSERVATION"
        | "TXLINE_READ_FAILED";
    }
  | {
      status: "live";
      provenance: "txline-mainnet-rest";
      verification: "LIVE_UNVERIFIED";
      fixtureId: string;
      competitionId: string;
      action: string;
      gameState: string;
      observedAtMs: number;
      sequence: number;
      confirmed: true;
      ageMs: number;
    }
>;

interface ConfiguredTxLine {
  readonly baseUrl: typeof TXLINE_MAINNET_HOST;
  readonly apiToken: string;
  readonly fixtureId: string;
}

const defaults: TxLineWorldCupDependencies = {
  startGuestSession,
  fetchScoreSnapshot,
};

function unavailable(
  reason: Extract<WorldCupStatus, { status: "unavailable" }>["reason"],
): WorldCupStatus {
  return Object.freeze({
    status: "unavailable",
    provenance: "txline-mainnet-rest",
    verification: "LIVE_UNVERIFIED",
    reason,
  });
}

function canonicalInt32(value: unknown): string | null {
  const text =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed <= INT32_MAX ? text : null;
}

function configuration(source: EnvSource): ConfiguredTxLine | null | "invalid" {
  const token = source.TXLINE_API_TOKEN;
  const fixture = source.TXLINE_FIXTURE_ID;
  if (
    (token === undefined || token.length === 0) &&
    (fixture === undefined || fixture.length === 0)
  ) {
    return null;
  }
  const baseUrl = source.TXLINE_BASE_URL ?? TXLINE_MAINNET_HOST;
  const fixtureId = canonicalInt32(fixture);
  if (
    baseUrl !== TXLINE_MAINNET_HOST ||
    typeof token !== "string" ||
    token.trim().length === 0 ||
    token.length > 4_096 ||
    fixtureId === null
  ) {
    return "invalid";
  }
  return Object.freeze({ baseUrl, apiToken: token, fixtureId });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (
    text.length === 0 ||
    text.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(text)
  ) {
    return null;
  }
  return text;
}

function readClock(clock: () => number): number {
  const value = clock();
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid TxLINE status clock");
  }
  return value;
}

interface Observation {
  readonly fixtureId: string;
  readonly competitionId: string;
  readonly action: string;
  readonly gameState: string;
  readonly observedAtMs: number;
  readonly sequence: number;
  readonly confirmed: true;
}

function observation(
  value: unknown,
  expectedFixtureId: string,
  nowMs: number,
): Observation | null {
  if (!isRecord(value)) return null;
  const fixtureId = canonicalInt32(value.fixtureId);
  const competitionId = canonicalInt32(value.competitionId);
  const action = boundedText(value.action);
  const gameState = boundedText(value.gameState);
  if (
    fixtureId !== expectedFixtureId ||
    competitionId === null ||
    action === null ||
    gameState === null ||
    typeof value.ts !== "number" ||
    !Number.isSafeInteger(value.ts) ||
    value.ts < 0 ||
    value.ts < nowMs - TXLINE_WORLD_CUP_OBSERVATION_MAX_AGE_MS ||
    value.ts > nowMs ||
    typeof value.seq !== "number" ||
    !Number.isSafeInteger(value.seq) ||
    value.seq < 0 ||
    value.confirmed !== true
  ) {
    return null;
  }
  return Object.freeze({
    fixtureId,
    competitionId,
    action,
    gameState,
    observedAtMs: value.ts,
    sequence: value.seq,
    confirmed: value.confirmed,
  });
}

export async function readWorldCupStatus(input: {
  readonly source?: EnvSource;
  readonly nowMs?: number;
  readonly clock?: () => number;
  readonly dependencies?: TxLineWorldCupDependencies;
  readonly requestTimeoutMs?: number;
} = {}): Promise<WorldCupStatus> {
  const source = input.source ?? process.env;
  const fixedNowMs = input.nowMs;
  const clock =
    input.clock ?? (fixedNowMs === undefined ? Date.now : () => fixedNowMs);
  let requestNowMs: number;
  try {
    requestNowMs = readClock(clock);
  } catch {
    return unavailable("INVALID_TXLINE_MVP_CONFIGURATION");
  }
  const requestTimeoutMs =
    input.requestTimeoutMs ?? TXLINE_WORLD_CUP_REQUEST_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs <= 0 ||
    requestTimeoutMs > TXLINE_WORLD_CUP_REQUEST_TIMEOUT_MS
  ) {
    return unavailable("INVALID_TXLINE_MVP_CONFIGURATION");
  }

  let config: ConfiguredTxLine | null | "invalid";
  try {
    config = configuration(source);
  } catch {
    return unavailable("INVALID_TXLINE_MVP_CONFIGURATION");
  }
  if (config === null) {
    return Object.freeze({
      status: "unconfigured",
      provenance: "deterministic-replay",
      verification: "REPLAY_NOT_LIVE",
      reason: "TXLINE_MVP_NOT_CONFIGURED",
    });
  }
  if (config === "invalid") {
    return unavailable("INVALID_TXLINE_MVP_CONFIGURATION");
  }

  const dependencies = input.dependencies ?? defaults;
  try {
    // One deadline covers guest auth, snapshot headers, and body consumption.
    const signal = AbortSignal.timeout(requestTimeoutMs);
    const guestJwt = await dependencies.startGuestSession(config.baseUrl, {
      signal,
    });
    const rows = await dependencies.fetchScoreSnapshot({
      baseUrl: config.baseUrl,
      fixtureId: config.fixtureId,
      guestJwt,
      apiToken: config.apiToken,
      signal,
    });
    let decisionNowMs: number;
    try {
      decisionNowMs = readClock(clock);
    } catch {
      return unavailable("NO_VALID_TXLINE_OBSERVATION");
    }
    if (decisionNowMs < requestNowMs) {
      return unavailable("NO_VALID_TXLINE_OBSERVATION");
    }
    const observations = rows
      .map((row) => observation(row, config.fixtureId, decisionNowMs))
      .filter((row): row is Observation => row !== null)
      .sort(
        (left, right) =>
          right.observedAtMs - left.observedAtMs ||
          right.sequence - left.sequence,
      );
    const latest = observations[0];
    if (latest === undefined) return unavailable("NO_VALID_TXLINE_OBSERVATION");

    return Object.freeze({
      status: "live",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      ...latest,
      ageMs: decisionNowMs - latest.observedAtMs,
    });
  } catch {
    // Upstream exceptions can contain request headers, so never surface them.
    return unavailable("TXLINE_READ_FAILED");
  }
}

type WorldCupStatusReader = () => Promise<WorldCupStatus>;

/** Coalesces public reads and never retains live data past its freshness gate. */
export function createTxLineWorldCupStatusReader(
  options: Readonly<{
    read?: WorldCupStatusReader;
    clock?: () => number;
  }> = {},
): WorldCupStatusReader {
  const read = options.read ?? readWorldCupStatus;
  const clock = options.clock ?? Date.now;
  let entry:
    | {
        readonly promise: Promise<WorldCupStatus>;
        settled: boolean;
        validUntilMs: number;
      }
    | undefined;
  let lastNowMs: number | undefined;

  return () => {
    const nowMs = clock();
    if (!Number.isSafeInteger(nowMs) || nowMs <= 0) {
      entry = undefined;
      return Promise.resolve(unavailable("INVALID_TXLINE_MVP_CONFIGURATION"));
    }
    if (lastNowMs !== undefined && nowMs < lastNowMs) {
      entry = undefined;
      return Promise.resolve(unavailable("INVALID_TXLINE_MVP_CONFIGURATION"));
    }
    lastNowMs = nowMs;
    if (entry !== undefined && (!entry.settled || nowMs < entry.validUntilMs)) {
      return entry.promise;
    }

    let promise: Promise<WorldCupStatus>;
    try {
      promise = read();
    } catch (error) {
      return Promise.reject(error);
    }
    const next = {
      promise,
      settled: false,
      validUntilMs: Math.min(
        Number.MAX_SAFE_INTEGER,
        nowMs + TXLINE_WORLD_CUP_STATUS_CACHE_TTL_MS,
      ),
    };
    entry = next;
    void promise.then(
      (status) => {
        next.settled = true;
        if (status.status === "live") {
          next.validUntilMs = Math.min(
            next.validUntilMs,
            status.observedAtMs + TXLINE_WORLD_CUP_OBSERVATION_MAX_AGE_MS,
          );
        }
      },
      () => {
        if (entry === next) entry = undefined;
      },
    );
    return promise;
  };
}

export const readCachedWorldCupStatus = createTxLineWorldCupStatusReader();
