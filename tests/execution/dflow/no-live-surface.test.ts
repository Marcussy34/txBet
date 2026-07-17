import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DFLOW_SHADOW_REGISTRATION,
  refuseDflowLiveOpportunity,
} from "@/execution/venues/dflow/shadow-adapter";

const repoRoot = resolve(import.meta.dirname, "../../..");
const dflowRoot = resolve(repoRoot, "src/execution/venues/dflow");
const FORBIDDEN_LIVE_SURFACE_PATTERNS = Object.freeze([
  /@privy-io\//,
  /import\s*\{[^}]*\b(?:Connection|Keypair|Signer|sendAndConfirmRawTransaction|sendAndConfirmTransaction)\b[^}]*\}\s*from\s*["']@solana\/web3\.js["']/s,
  /new\s+Connection\s*\(/,
  /\.(?:sendRawTransaction|sendTransaction|sendEncodedTransaction|signTransaction|simulateTransaction|sign|addSignature)\s*\(/,
  /\b(?:sendAndConfirmRawTransaction|sendAndConfirmTransaction|broadcastTransaction)\s*\(/,
  /\bmethod\s*:\s*["'](?:sendTransaction|simulateTransaction)["']/,
  /\bSOLANA_RPC_URL\b/,
] as const);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

describe("DFlow paired-agent isolation", () => {
  it("keeps Privy, write-RPC, broadcast, and live adapters outside the venue lane", () => {
    const files = sourceFiles(dflowRoot);
    expect(files.map((file) => file.slice(dflowRoot.length + 1))).not.toEqual(
      expect.arrayContaining([
        "signer.ts",
        "privy.ts",
        "rpc.ts",
        "broadcast.ts",
        "send.ts",
        "submit.ts",
        "simulation.ts",
        "live-adapter.ts",
      ]),
    );

    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const forbidden of FORBIDDEN_LIVE_SURFACE_PATTERNS) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it("recognizes aliased RPC imports, raw RPC methods, and versioned signing calls", () => {
    for (const unsafeSource of [
      'import { Connection as Rpc } from "@solana/web3.js";',
      'import { sendAndConfirmTransaction } from "@solana/web3.js";',
      "versionedTransaction.sign([]);",
      "versionedTransaction.addSignature(key, signature);",
      'const request = { method: "sendTransaction" };',
      "rpc.sendEncodedTransaction(bytes);",
      "const endpoint = process.env.SOLANA_RPC_URL;",
    ]) {
      expect(
        FORBIDDEN_LIVE_SURFACE_PATTERNS.some((pattern) =>
          pattern.test(unsafeSource),
        ),
        unsafeSource,
      ).toBe(true);
    }
  });

  it("registers shadow evidence only and refuses before reservation", () => {
    expect(DFLOW_SHADOW_REGISTRATION.liveAdapterRegistered).toBe(false);
    expect(DFLOW_SHADOW_REGISTRATION.kind).toBe("shadow-evidence");
    expect(refuseDflowLiveOpportunity()).toMatchObject({
      accepted: false,
      reservationCreated: false,
    });
  });

  it("prevents workers and application modules from importing fixture decoding as execution", () => {
    const applicationSource = sourceFiles(resolve(repoRoot, "src"))
      .filter((file) => !file.startsWith(`${dflowRoot}/`))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(applicationSource).not.toMatch(
      /dflow\/(?:transaction|signer|broadcast|rpc|live-adapter)(?:["']|\b)/,
    );
  });
});
