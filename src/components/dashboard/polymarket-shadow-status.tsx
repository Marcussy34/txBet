"use client";

import { useEffect, useState } from "react";
import { ScanSearch, ShieldAlert, TriangleAlert } from "lucide-react";
import { z } from "zod";

const CLIENT_REQUEST_TIMEOUT_MS = 5_000;
const HASH = /^[a-f0-9]{64}$/;
const REASON_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;
const POSITIVE_UINT = /^[1-9][0-9]*$/;
const safeCounter = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const reasonCodes = z.array(z.string().regex(REASON_CODE)).max(64);

const baseShape = {
  venue: z.literal("polymarket"),
  mode: z.literal("SHADOW_ONLY"),
  executable: z.literal(false),
} as const;

const unconfiguredSchema = z
  .object({
    status: z.literal("unconfigured"),
    ...baseShape,
    liveData: z.literal(false),
    reason: z.literal("POLYMARKET_WORLD_CUP_REVIEW_NOT_CONFIGURED"),
  })
  .strict();

const unavailableSchema = z
  .object({
    status: z.literal("unavailable"),
    ...baseShape,
    liveData: z.literal(false),
    reason: z.enum([
      "INVALID_POLYMARKET_WORLD_CUP_REVIEW",
      "POLYMARKET_PUBLIC_READ_FAILED",
      "POLYMARKET_PUBLIC_BOOK_REJECTED",
    ]),
    reasonCodes: reasonCodes.optional(),
  })
  .strict();

const candidateSchema = z
  .object({
    status: z.literal("CANDIDATE"),
    candidateHash: z.string().regex(HASH),
    exactShares: z
      .object({
        numerator: z.string().regex(POSITIVE_UINT),
        denominator: z.string().regex(POSITIVE_UINT),
      })
      .strict(),
    totalBookCostMicros: safeCounter,
    nominalPayoutMicros: safeCounter,
    grossProfitMicros: safeCounter,
    grossReturnBps: safeCounter,
    expiresAt: safeCounter,
    nonExecutableReasons: z
      .array(
        z.enum([
          "ASSET_VALUE_POLICY_NOT_BOUND",
          "VENUE_FEES_NOT_INCLUDED",
          "NETWORK_COST_NOT_INCLUDED",
          "LIVE_EXECUTION_NOT_AUTHORIZED",
        ]),
      )
      .min(1)
      .max(4),
  })
  .strict();

const noCandidateSchema = z
  .object({
    status: z.literal("NO_CANDIDATE"),
    reasonCodes,
  })
  .strict();

const scannedSchema = z
  .object({
    status: z.literal("scanned"),
    ...baseShape,
    liveData: z.literal(true),
    provenance: z.literal("polymarket-public-clob"),
    verification: z.literal("PINNED_IDENTITY_LIVE_BOOK"),
    liveBook: z
      .object({
        side: z.enum(["left", "right"]),
        observedAtMs: safeCounter,
        receivedAtMs: safeCounter,
        bookRevision: z.string().regex(/^[a-f0-9]{40}$/),
        quoteEvidenceHash: z.string().regex(HASH),
        marketIdentityHash: z.string().regex(HASH),
      })
      .strict(),
    scan: z.discriminatedUnion("status", [candidateSchema, noCandidateSchema]),
  })
  .strict();

const statusSchema = z.discriminatedUnion("status", [
  unconfiguredSchema,
  unavailableSchema,
  scannedSchema,
]);

export type BrowserPolymarketShadowStatus = z.infer<typeof statusSchema>;

const CLIENT_UNAVAILABLE: BrowserPolymarketShadowStatus = Object.freeze({
  status: "unavailable",
  venue: "polymarket",
  mode: "SHADOW_ONLY",
  executable: false,
  liveData: false,
  reason: "POLYMARKET_PUBLIC_READ_FAILED",
});

/** Rejects forged execution claims and unknown fields from the same-origin API. */
export function parsePolymarketShadowStatus(
  value: unknown,
): BrowserPolymarketShadowStatus | null {
  const result = statusSchema.safeParse(value);
  return result.success ? Object.freeze(result.data) : null;
}

async function requestStatus(signal: AbortSignal): Promise<BrowserPolymarketShadowStatus> {
  try {
    const response = await fetch("/api/polymarket/world-cup-shadow", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return CLIENT_UNAVAILABLE;
    const value: unknown = await response.json();
    return parsePolymarketShadowStatus(value) ?? CLIENT_UNAVAILABLE;
  } catch {
    return CLIENT_UNAVAILABLE;
  }
}

function formatMicros(value: number): string {
  return `$${(value / 1_000_000).toFixed(2)}`;
}

function UnconfiguredStatus() {
  return (
    <div className="flex items-start gap-3">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-warning">
          POLYMARKET REVIEW REQUIRED
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          No reviewed World Cup pair is configured, so no public book is being scanned.
        </p>
      </div>
    </div>
  );
}

function UnavailableStatus({
  status,
}: {
  readonly status: Extract<BrowserPolymarketShadowStatus, { status: "unavailable" }>;
}) {
  return (
    <div className="flex items-start gap-3">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-warning">
          POLYMARKET SHADOW UNAVAILABLE
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          No order action is available. {status.reasonCodes?.slice(0, 3).join(" · ") ?? status.reason}
        </p>
      </div>
    </div>
  );
}

function ScannedStatus({
  status,
}: {
  readonly status: Extract<BrowserPolymarketShadowStatus, { status: "scanned" }>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <ScanSearch className="size-4 text-primary" aria-hidden="true" />
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-primary">
          POLYMARKET LIVE BOOK · SHADOW ONLY
        </p>
      </div>
      <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        PINNED IDENTITY · PUBLIC CLOB
      </p>
      {status.scan.status === "CANDIDATE" ? (
        <div className="mt-3">
          <p className="font-mono text-xs font-semibold text-foreground">
            CANDIDATE · NON-EXECUTABLE
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="font-mono text-[0.625rem] uppercase text-muted-foreground">Gross edge</dt>
              <dd className="mt-0.5 font-mono text-xs text-foreground">
                {formatMicros(status.scan.grossProfitMicros)}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.625rem] uppercase text-muted-foreground">Gross return</dt>
              <dd className="mt-0.5 font-mono text-xs text-foreground">
                {(status.scan.grossReturnBps / 100).toFixed(2)}%
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.625rem] uppercase text-muted-foreground">Shares</dt>
              <dd className="mt-0.5 font-mono text-xs text-foreground">
                {status.scan.exactShares.numerator}/{status.scan.exactShares.denominator}
              </dd>
            </div>
          </dl>
          <p className="mt-2 break-words font-mono text-[0.625rem] text-muted-foreground">
            {status.scan.nonExecutableReasons.join(" · ")}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="font-mono text-xs font-semibold text-muted-foreground">NO CANDIDATE</p>
          <p className="mt-1 break-words font-mono text-[0.625rem] text-muted-foreground">
            {status.scan.reasonCodes.slice(0, 4).join(" · ") || "NO_APPROVED_EDGE"}
          </p>
        </div>
      )}
    </div>
  );
}

/** Public read and shadow evidence only. No signing control exists in this component. */
export function PolymarketShadowStatus() {
  const [status, setStatus] = useState<BrowserPolymarketShadowStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

    void requestStatus(controller.signal).then((next) => {
      if (mounted) setStatus(next);
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return (
    <section
      aria-label="Polymarket World Cup shadow status"
      aria-live="polite"
      className="rounded-lg border border-border/70 bg-card/70 px-4 py-3"
    >
      {status === null ? (
        <div>
          <p className="font-mono text-xs font-semibold tracking-[0.12em] text-muted-foreground">
            POLYMARKET SHADOW CHECKING
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Public read only.</p>
        </div>
      ) : status.status === "unconfigured" ? (
        <UnconfiguredStatus />
      ) : status.status === "unavailable" ? (
        <UnavailableStatus status={status} />
      ) : (
        <ScannedStatus status={status} />
      )}
      <p className="mt-3 border-t border-border/60 pt-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        PUBLIC READ ONLY · NO APPROVE · NO SIGN · NO SUBMIT · NO CANCEL
      </p>
    </section>
  );
}
