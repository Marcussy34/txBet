"use client";

import { useEffect, useState } from "react";
import { Radio, RotateCcw, TriangleAlert } from "lucide-react";
import { z } from "zod";

const CLIENT_REQUEST_TIMEOUT_MS = 5_000;
const MAX_LIVE_OBSERVATION_AGE_MS = 30_000;
const INT32_MAX = 2_147_483_647;

const boundedTextSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim())
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const canonicalInt32Schema = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine((value) => Number(value) <= INT32_MAX);
const safeCounterSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const unconfiguredSchema = z
  .object({
    status: z.literal("unconfigured"),
    provenance: z.literal("deterministic-replay"),
    verification: z.literal("REPLAY_NOT_LIVE"),
    reason: z.literal("TXLINE_MVP_NOT_CONFIGURED"),
  })
  .strict();

const unavailableSchema = z
  .object({
    status: z.literal("unavailable"),
    provenance: z.literal("txline-mainnet-rest"),
    verification: z.literal("LIVE_UNVERIFIED"),
    reason: z.enum([
      "INVALID_TXLINE_MVP_CONFIGURATION",
      "NO_VALID_TXLINE_OBSERVATION",
      "TXLINE_READ_FAILED",
    ]),
  })
  .strict();

const liveSchema = z
  .object({
    status: z.literal("live"),
    provenance: z.literal("txline-mainnet-rest"),
    verification: z.literal("LIVE_UNVERIFIED"),
    fixtureId: canonicalInt32Schema,
    competitionId: canonicalInt32Schema,
    action: boundedTextSchema,
    gameState: boundedTextSchema,
    observedAtMs: safeCounterSchema,
    sequence: safeCounterSchema,
    confirmed: z.literal(true),
    ageMs: safeCounterSchema.max(MAX_LIVE_OBSERVATION_AGE_MS),
  })
  .strict();

const worldCupStatusSchema = z.discriminatedUnion("status", [
  unconfiguredSchema,
  unavailableSchema,
  liveSchema,
]);

export type BrowserWorldCupStatus = z.infer<typeof worldCupStatusSchema>;

const CLIENT_UNAVAILABLE: BrowserWorldCupStatus = Object.freeze({
  status: "unavailable",
  provenance: "txline-mainnet-rest",
  verification: "LIVE_UNVERIFIED",
  reason: "TXLINE_READ_FAILED",
});

/** Treats the same-origin API response as untrusted and rejects unknown fields. */
export function parseWorldCupStatus(value: unknown): BrowserWorldCupStatus | null {
  const result = worldCupStatusSchema.safeParse(value);
  return result.success ? Object.freeze(result.data) : null;
}

function formatAge(ageMs: number): string {
  if (ageMs < 1_000) return "under 1s old";
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s old`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m old`;
  return `${Math.floor(ageMs / 3_600_000)}h old`;
}

async function requestWorldCupStatus(signal: AbortSignal): Promise<BrowserWorldCupStatus> {
  try {
    const response = await fetch("/api/world-cup", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return CLIENT_UNAVAILABLE;

    const value: unknown = await response.json();
    return parseWorldCupStatus(value) ?? CLIENT_UNAVAILABLE;
  } catch {
    // Upstream errors can contain credentials, so the browser receives no detail.
    return CLIENT_UNAVAILABLE;
  }
}

function LoadingStatus() {
  return (
    <div>
      <p className="font-mono text-xs font-semibold tracking-[0.12em] text-muted-foreground">
        TXLINE STATUS CHECKING
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Agents remain available while the read completes.
      </p>
    </div>
  );
}

function UnconfiguredStatus() {
  return (
    <div className="flex items-start gap-3">
      <RotateCcw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-primary">
          AGENTS READY
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          TxLINE not configured. Live fixtures attach when the feed is wired.
        </p>
      </div>
    </div>
  );
}

function UnavailableStatus() {
  return (
    <div className="flex items-start gap-3">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-warning">
          LIVE DATA UNAVAILABLE
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Fallback event stream remains active. No live observation is being used.
        </p>
      </div>
    </div>
  );
}

function LiveStatus({ status }: { readonly status: Extract<BrowserWorldCupStatus, { status: "live" }> }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Radio className="size-4 text-primary" aria-hidden="true" />
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-primary">
          TXLINE LIVE · UNVERIFIED
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <div>
          <dt className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            Action
          </dt>
          <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{status.action}</dd>
        </div>
        <div>
          <dt className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            State
          </dt>
          <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{status.gameState}</dd>
        </div>
        <div>
          <dt className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            Age
          </dt>
          <dd className="mt-0.5 font-mono text-xs text-foreground">{formatAge(status.ageMs)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            Feed
          </dt>
          <dd className="mt-0.5 font-mono text-xs text-foreground">Sequence {status.sequence}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Read-only World Cup observation. It never exposes a signing or execution action. */
export function WorldCupLiveStatus() {
  const [status, setStatus] = useState<BrowserWorldCupStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

    void requestWorldCupStatus(controller.signal).then((nextStatus) => {
      if (mounted) setStatus(nextStatus);
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return (
    <section
      aria-label="World Cup data status"
      aria-live="polite"
      className="rounded-lg border border-border/70 bg-card/70 px-4 py-3"
    >
      {status === null ? (
        <LoadingStatus />
      ) : status.status === "unconfigured" ? (
        <UnconfiguredStatus />
      ) : status.status === "unavailable" ? (
        <UnavailableStatus />
      ) : (
        <LiveStatus status={status} />
      )}
      <p className="mt-3 border-t border-border/60 pt-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        LIVE-EXECUTABLE STRATEGY · OPERATOR-GATED EXECUTION · TxLINE REST status is not Solana/on-chain verified.
      </p>
    </section>
  );
}
