import { z } from "zod";

import type { BlobExecutionJournal } from "@/server/execution/blob-journal";
import { vercelExecutionControlViewFromJournal } from "@/server/execution/vercel-control";

const PLATFORM_CANARY_CEILING_MICROS = 10_000_000;
const canonicalAtomic = z.string().regex(/^(0|[1-9][0-9]*)$/);
const submissionReservationSchema = z.object({
  schemaVersion: z.literal("txbet-dflow-submit-started-v1"),
  riskMicros: z.number().int().positive().safe(),
}).passthrough();

/** Converts the worst-case configured native-token debit into integer microdollars. */
export function calculateDflowRiskMicros(input: {
  readonly amountMicros: number;
  readonly priorityFeeLamports: string;
  readonly initCostLamports: string;
  readonly baseFeeLamports: string;
  readonly solUsdUpperBoundMicros: string;
}): Readonly<{
  networkCostMicros: number;
  riskMicros: number;
  totalLamports: string;
}> {
  if (!Number.isSafeInteger(input.amountMicros) || input.amountMicros <= 0) {
    throw new Error("DFlow input microdollars must be a positive safe integer");
  }
  const priority = parseAtomic(input.priorityFeeLamports, "priority fee");
  const init = parseAtomic(input.initCostLamports, "initialization cost");
  const base = parseAtomic(input.baseFeeLamports, "base fee");
  const solUsd = parseAtomic(input.solUsdUpperBoundMicros, "SOL/USD upper bound");
  if (solUsd <= 0n) throw new Error("DFlow SOL/USD upper bound must be positive");

  const totalLamports = priority + init + base;
  const networkCost = (totalLamports * solUsd + 999_999_999n) / 1_000_000_000n;
  const risk = BigInt(input.amountMicros) + networkCost;
  if (risk > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("DFlow risk exceeds the safe integer range");
  }
  return Object.freeze({
    networkCostMicros: Number(networkCost),
    riskMicros: Number(risk),
    totalLamports: totalLamports.toString(),
  });
}

/** Runs inside the Blob CAS loop so two different orders cannot overspend one grant. */
export function assertDflowCanaryClaimBudget(input: {
  readonly journal: BlobExecutionJournal;
  readonly expectedControlVersion: number;
  readonly riskMicros: number;
  readonly configuredMaxTotalMicros: number;
  readonly nowMs: number;
}): Readonly<{ reservedBeforeMicros: number; reservedAfterMicros: number }> {
  for (const [label, value] of [
    ["control version", input.expectedControlVersion],
    ["risk", input.riskMicros],
    ["configured ceiling", input.configuredMaxTotalMicros],
    ["time", input.nowMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`DFlow ${label} is invalid`);
    }
  }
  if (input.riskMicros <= 0 || input.configuredMaxTotalMicros <= 0) {
    throw new Error("DFlow canary claim must reserve a positive bounded amount");
  }

  const control = vercelExecutionControlViewFromJournal(input.journal, input.nowMs);
  if (control.requestedMode !== "canary") {
    throw new Error("DFlow real-money canary authority is not active");
  }
  if (control.version !== input.expectedControlVersion) {
    throw new Error("DFlow execution control version changed");
  }
  const ceiling = Math.min(
    PLATFORM_CANARY_CEILING_MICROS,
    input.configuredMaxTotalMicros,
    control.maxTotalMicros,
  );
  const reservedBefore = input.journal.events
    .filter((event) => event.kind === "DFLOW_SUBMIT_STARTED")
    .reduce((total, event) => {
      const parsed = submissionReservationSchema.parse(event.payload);
      const next = total + parsed.riskMicros;
      if (!Number.isSafeInteger(next)) throw new Error("DFlow reserved risk overflowed");
      return next;
    }, 0);
  const reservedAfter = reservedBefore + input.riskMicros;
  if (!Number.isSafeInteger(reservedAfter) || reservedAfter > ceiling) {
    throw new Error("DFlow execution budget would be exceeded");
  }
  return Object.freeze({
    reservedBeforeMicros: reservedBefore,
    reservedAfterMicros: reservedAfter,
  });
}

function parseAtomic(value: string, label: string): bigint {
  const parsed = canonicalAtomic.safeParse(value);
  if (!parsed.success) throw new Error(`DFlow ${label} must be a canonical atomic integer`);
  return BigInt(parsed.data);
}
