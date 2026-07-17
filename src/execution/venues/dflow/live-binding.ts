import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

import { sha256Canonical, type JsonValue } from "@/core/canonical-json";

const safeText = z.string().trim().min(1).max(240);
const bindingId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const evidenceHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const safeTime = z.number().int().nonnegative().safe();

const rawBindingSchema = z.object({
  id: bindingId,
  competition: z.literal("fifa-world-cup"),
  edition: z.literal(2026),
  title: safeText,
  outcome: safeText,
  marketKey: safeText,
  outcomeMint: z.string().min(32).max(44),
  evidenceUrl: z.url().refine((value) => value.startsWith("https://"), {
    message: "Evidence URL must use HTTPS",
  }),
  evidenceHash,
  reviewedAtMs: safeTime,
  validUntilMs: safeTime,
}).strict();

const manifestSchema = z.object({
  schemaVersion: z.literal("txbet-dflow-world-cup-bindings-v1"),
  bindings: z.array(rawBindingSchema).min(1).max(512),
}).strict();

export interface DflowWorldCupBinding {
  readonly id: string;
  readonly competition: "fifa-world-cup";
  readonly edition: 2026;
  readonly title: string;
  readonly outcome: string;
  readonly marketKey: string;
  readonly outcomeMint: string;
  readonly evidenceUrl: string;
  readonly evidenceHash: string;
  readonly reviewedAtMs: number;
  readonly validUntilMs: number;
  readonly bindingHash: string;
}

export interface DflowWorldCupBindings {
  readonly schemaVersion: "txbet-dflow-world-cup-bindings-v1";
  readonly bindings: readonly DflowWorldCupBinding[];
}

/** Parses the server-owned allowlist that binds a reviewed Kalshi market to one mint. */
export function parseDflowWorldCupBindings(json: string): DflowWorldCupBindings {
  let unknownManifest: unknown;
  try {
    unknownManifest = JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error("DFlow World Cup binding manifest is not valid JSON", { cause: error });
  }

  const parsed = manifestSchema.parse(unknownManifest);
  const ids = new Set<string>();
  const mints = new Set<string>();
  const outcomes = new Set<string>();
  const bindings = parsed.bindings.map((raw) => {
    if (raw.validUntilMs <= raw.reviewedAtMs) {
      throw new Error(`DFlow binding ${raw.id} has no valid review window`);
    }
    const outcomeMint = canonicalPublicKey(raw.outcomeMint);
    const marketOutcome = `${raw.marketKey}\u0000${raw.outcome}`;
    assertUnique(ids, raw.id, "binding ID");
    assertUnique(mints, outcomeMint, "outcome mint");
    assertUnique(outcomes, marketOutcome, "market outcome");

    const evidence = {
      ...raw,
      outcomeMint,
    } satisfies JsonValue;
    return Object.freeze({
      ...evidence,
      bindingHash: `sha256:${sha256Canonical(evidence)}`,
    }) satisfies DflowWorldCupBinding;
  });

  return Object.freeze({
    schemaVersion: parsed.schemaVersion,
    bindings: Object.freeze(bindings),
  });
}

/** Resolves a binding only while its independent review window is current. */
export function resolveCurrentDflowWorldCupBinding(
  manifest: DflowWorldCupBindings,
  id: string,
  nowMs: number,
): DflowWorldCupBinding {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("Current binding verification time is invalid");
  }
  const binding = manifest.bindings.find((candidate) => candidate.id === id);
  if (!binding) throw new Error("Requested DFlow World Cup binding is not allowlisted");
  if (binding.reviewedAtMs > nowMs || binding.validUntilMs <= nowMs) {
    throw new Error("Requested DFlow World Cup binding review is expired or not current");
  }
  return binding;
}

function canonicalPublicKey(value: string): string {
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) throw new Error("not canonical");
    return key.toBase58();
  } catch (error) {
    throw new Error("DFlow binding outcome mint is not a canonical Solana public key", {
      cause: error,
    });
  }
}

function assertUnique(values: Set<string>, value: string, label: string): void {
  if (values.has(value)) throw new Error(`DFlow binding ${label} must be unique`);
  values.add(value);
}
