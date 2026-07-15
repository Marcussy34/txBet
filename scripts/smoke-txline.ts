import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { EventSource } from "eventsource";
import { normalizeTxLineEvent } from "../src/lib/txline/normalize";
import {
  DEFAULT_TXLINE_BASE_URL,
  fetchScoreSnapshot,
  openScoreStream,
  startGuestSession,
} from "../src/lib/txline/client";

export interface TxLineSmokeInput {
  baseUrl: string;
  fixtureId: string;
  apiToken: string;
  seconds: number;
}

export interface TxLineSmokeSummary {
  fixtureId: string;
  snapshotRows: number;
  normalizedSnapshotRows: number;
  streamOpened: boolean;
  streamMessages: number;
  normalizedMessages: number;
  lastAction: string;
}

type StreamHandle = Pick<EventSource, "close">;

export interface TxLineSmokeDependencies {
  startGuestSession: typeof startGuestSession;
  fetchScoreSnapshot: typeof fetchScoreSnapshot;
  openScoreStream: (
    input: Parameters<typeof openScoreStream>[0],
  ) => StreamHandle;
  delay: (milliseconds: number) => Promise<void>;
}

interface SmokeIo {
  log: (message: string) => void;
  error: (message: string) => void;
}

export interface TxLineSmokeCliInput {
  argv?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  io?: SmokeIo;
  dependencies?: Partial<TxLineSmokeDependencies>;
}

class TxLineSmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TxLineSmokeError";
  }
}

const defaultDependencies: TxLineSmokeDependencies = {
  startGuestSession,
  fetchScoreSnapshot,
  openScoreStream,
  delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function argument(argv: readonly string[], name: string, fallback?: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

async function runStep<T>(message: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    // Keep CLI failures concise and guarantee credentials never reach stderr.
    throw new TxLineSmokeError(message);
  }
}

export async function runTxLineSmoke(
  input: TxLineSmokeInput,
  dependencyOverrides: Partial<TxLineSmokeDependencies> = {},
): Promise<TxLineSmokeSummary> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const guestJwt = await runStep(
    "TxLINE guest session request failed.",
    () => dependencies.startGuestSession(input.baseUrl),
  );
  const snapshot = await runStep(
    "TxLINE score snapshot request failed.",
    () => dependencies.fetchScoreSnapshot({
      baseUrl: input.baseUrl,
      fixtureId: input.fixtureId,
      guestJwt,
      apiToken: input.apiToken,
    }),
  );
  const normalizedSnapshot = snapshot
    .map((row) => normalizeTxLineEvent(row))
    .filter((row) => row !== null);
  let messages = 0;
  let normalized = 0;
  let opened = false;
  let lastAction = "none";
  let rejectStream: (error: TxLineSmokeError) => void = () => {};
  let streamFailed = false;
  const streamFailure = new Promise<never>((_, reject) => {
    rejectStream = (error) => {
      if (streamFailed) return;
      streamFailed = true;
      reject(error);
    };
  });
  // Handle a defensive synchronous error callback from an injected stream factory.
  void streamFailure.catch(() => {});

  let source: StreamHandle;
  try {
    source = dependencies.openScoreStream({
      baseUrl: input.baseUrl,
      fixtureId: input.fixtureId,
      guestJwt,
      apiToken: input.apiToken,
      onOpen: () => { opened = true; },
      onPayload: (payload) => {
        messages += 1;
        const event = normalizeTxLineEvent(payload);
        if (event) {
          normalized += 1;
          lastAction = event.action;
        }
      },
      onError: () => {
        rejectStream(new TxLineSmokeError(
          opened
            ? "TxLINE stream connection failed."
            : "TxLINE stream connection failed before opening.",
        ));
      },
    });
  } catch {
    throw new TxLineSmokeError("TxLINE stream could not be started.");
  }

  try {
    await Promise.race([
      dependencies.delay(input.seconds * 1_000),
      streamFailure,
    ]);
    if (!opened) {
      const unit = input.seconds === 1 ? "second" : "seconds";
      throw new TxLineSmokeError(
        `TxLINE stream never opened within ${input.seconds} ${unit}.`,
      );
    }
    return {
      fixtureId: input.fixtureId,
      snapshotRows: snapshot.length,
      normalizedSnapshotRows: normalizedSnapshot.length,
      streamOpened: opened,
      streamMessages: messages,
      normalizedMessages: normalized,
      lastAction,
    };
  } finally {
    source.close();
  }
}

function publicErrorMessage(error: unknown): string {
  return error instanceof TxLineSmokeError
    ? error.message
    : "TxLINE smoke check failed.";
}

export async function runTxLineSmokeCli(
  input: TxLineSmokeCliInput = {},
): Promise<number> {
  const argv = input.argv ?? process.argv.slice(2);
  const env = input.env ?? process.env;
  const io = input.io ?? console;
  const fixtureId = argument(argv, "--fixture", env.TXLINE_FIXTURE_ID);
  const seconds = Number(argument(argv, "--seconds", "15"));
  const apiToken = env.TXLINE_API_TOKEN;
  const baseUrl = env.TXLINE_BASE_URL ?? DEFAULT_TXLINE_BASE_URL;

  if (!fixtureId || !apiToken) {
    io.error(
      "Usage: pnpm txline:smoke -- --fixture FIXTURE_ID [--seconds 15]; set TXLINE_API_TOKEN in .env.",
    );
    return 1;
  }
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) {
    io.error("--seconds must be between 1 and 60.");
    return 1;
  }

  try {
    const summary = await runTxLineSmoke(
      { baseUrl, fixtureId, apiToken, seconds },
      input.dependencies,
    );
    io.log(JSON.stringify(summary, null, 2));
    return 0;
  } catch (error) {
    io.error(publicErrorMessage(error));
    return 1;
  }
}

const isEntryPoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntryPoint) {
  process.exitCode = await runTxLineSmokeCli();
}
