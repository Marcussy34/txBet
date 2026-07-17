import { z } from "zod";

import { PublicKey } from "@solana/web3.js";

import { CLASSIC_TOKEN_PROGRAM_ID } from "@/execution/venues/dflow/program-allowlist";

const RPC_TIMEOUT_MS = 8_000;
const commitment = "confirmed" as const;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const simulationSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.string(),
  result: z.strictObject({
    context: z.strictObject({ slot: z.number().int().nonnegative().safe() }).passthrough(),
    value: z.object({
      err: z.unknown().nullable(),
      unitsConsumed: z.number().int().nonnegative().safe().optional(),
      accounts: z.array(z.unknown().nullable()).optional(),
    }).passthrough(),
  }),
});

const rpcAccountSchema = z.object({
  data: z.tuple([z.string(), z.literal("base64")]),
  executable: z.boolean(),
  lamports: z.number().int().nonnegative().safe(),
  owner: z.string(),
}).passthrough();

const multipleAccountsSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.string(),
  result: z.strictObject({
    context: z.strictObject({ slot: z.number().int().nonnegative().safe() }).passthrough(),
    value: z.array(rpcAccountSchema.nullable()),
  }),
});

const blockHeightSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.string(),
  result: z.number().int().nonnegative().safe(),
});

const submitSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.string(),
  result: z.string().min(1).max(128),
});

export class DflowSubmissionUnknownError extends Error {
  override readonly name = "DflowSubmissionUnknownError";
  readonly signature: string;

  constructor(signature: string) {
    super("DFlow transaction submission outcome is unknown");
    this.signature = signature;
  }
}

/** Simulates the exact signed bytes and keeps the DFlow blockhash in place. */
export async function simulateDflowSignedTransaction(input: {
  readonly rpcUrl: string;
  readonly transactionBase64: string;
  readonly minimumContextSlot: number;
  readonly operationId: string;
  readonly fetcher?: Fetcher;
  readonly balanceGuard?: DflowSimulationBalanceGuard;
}): Promise<Readonly<{
  contextSlot: number;
  unitsConsumed: number | null;
  balanceDeltas?: Readonly<{
    inputDebitAtomic: string;
    outputCreditAtomic: string;
    lamportDebit: string;
  }>;
}>> {
  assertSafeNonnegative(input.minimumContextSlot, "DFlow minimum context slot");
  const guard = input.balanceGuard === undefined
    ? null
    : validateBalanceGuard(input.balanceGuard);
  let preAccounts: readonly (z.infer<typeof rpcAccountSchema> | null)[] | null = null;
  let simulationMinimumSlot = input.minimumContextSlot;
  if (guard !== null) {
    const preId = `accounts:${rpcId(input.operationId)}`;
    const pre = multipleAccountsSchema.parse(await rpcRequest({
      rpcUrl: input.rpcUrl,
      fetcher: input.fetcher,
      body: {
        jsonrpc: "2.0",
        id: preId,
        method: "getMultipleAccounts",
        params: [[guard.walletAddress, guard.inputTokenAccount, guard.outputTokenAccount], {
          encoding: "base64",
          commitment,
          minContextSlot: input.minimumContextSlot,
        }],
      },
    }));
    if (pre.id !== preId || pre.result.value.length !== 3) {
      throw new Error("DFlow balance snapshot is malformed");
    }
    preAccounts = pre.result.value;
    simulationMinimumSlot = Math.max(input.minimumContextSlot, pre.result.context.slot);
  }
  const id = `simulate:${rpcId(input.operationId)}`;
  const value = simulationSchema.parse(await rpcRequest({
    rpcUrl: input.rpcUrl,
    fetcher: input.fetcher,
    body: {
      jsonrpc: "2.0",
      id,
      method: "simulateTransaction",
      params: [input.transactionBase64, {
        encoding: "base64",
        sigVerify: true,
        replaceRecentBlockhash: false,
        commitment,
        minContextSlot: simulationMinimumSlot,
        ...(guard === null
          ? {}
          : {
              accounts: {
                addresses: [
                  guard.walletAddress,
                  guard.inputTokenAccount,
                  guard.outputTokenAccount,
                ],
                encoding: "base64",
              },
            }),
      }],
    },
  }));
  if (value.id !== id || value.result.context.slot < simulationMinimumSlot) {
    throw new Error("DFlow transaction simulation returned a stale context slot");
  }
  if (value.result.value.err !== null) {
    throw new Error("DFlow transaction simulation failed");
  }
  const deltas = guard === null
    ? undefined
    : verifyBalanceDeltas(
        guard,
        preAccounts!,
        value.result.value.accounts,
      );
  return Object.freeze({
    contextSlot: value.result.context.slot,
    unitsConsumed: value.result.value.unitsConsumed ?? null,
    ...(deltas === undefined ? {} : { balanceDeltas: deltas }),
  });
}

export interface DflowSimulationBalanceGuard {
  readonly walletAddress: string;
  readonly inputTokenAccount: string;
  readonly outputTokenAccount: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly expectedInputDebitAtomic: string;
  readonly minimumOutputCreditAtomic: string;
  readonly maximumLamportDebit: string;
}

/** Reads the confirmed height immediately before the durable submission claim. */
export async function getDflowSolanaBlockHeight(input: {
  readonly rpcUrl: string;
  readonly operationId: string;
  readonly fetcher?: Fetcher;
}): Promise<number> {
  const id = `block-height:${rpcId(input.operationId)}`;
  let parsed: z.infer<typeof blockHeightSchema>;
  try {
    parsed = blockHeightSchema.parse(await rpcRequest({
      rpcUrl: input.rpcUrl,
      fetcher: input.fetcher,
      body: {
        jsonrpc: "2.0",
        id,
        method: "getBlockHeight",
        params: [{ commitment }],
      },
    }));
  } catch (error) {
    throw new Error("DFlow Solana block height is unavailable", { cause: error });
  }
  if (parsed.id !== id) throw new Error("DFlow Solana block height response ID changed");
  return parsed.result;
}

/** Broadcasts once. Any non-matching response remains UNKNOWN and is never retried here. */
export async function submitDflowSignedTransactionOnce(input: {
  readonly rpcUrl: string;
  readonly transactionBase64: string;
  readonly expectedSignature: string;
  readonly minimumContextSlot: number;
  readonly operationId: string;
  readonly fetcher?: Fetcher;
}): Promise<Readonly<{ state: "submitted"; signature: string }>> {
  assertSafeNonnegative(input.minimumContextSlot, "DFlow minimum context slot");
  const id = `send:${rpcId(input.operationId)}`;
  try {
    const parsed = submitSchema.parse(await rpcRequest({
      rpcUrl: input.rpcUrl,
      fetcher: input.fetcher,
      body: {
        jsonrpc: "2.0",
        id,
        method: "sendTransaction",
        params: [input.transactionBase64, {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: commitment,
          maxRetries: 0,
          minContextSlot: input.minimumContextSlot,
        }],
      },
    }));
    if (parsed.id !== id || parsed.result !== input.expectedSignature) {
      throw new Error("signature mismatch");
    }
    return Object.freeze({ state: "submitted", signature: input.expectedSignature });
  } catch {
    // A network or RPC error can happen after the validator accepted the packet.
    throw new DflowSubmissionUnknownError(input.expectedSignature);
  }
}

async function rpcRequest(input: {
  readonly rpcUrl: string;
  readonly body: unknown;
  readonly fetcher?: Fetcher;
}): Promise<unknown> {
  const url = canonicalRpcUrl(input.rpcUrl);
  const response = await (input.fetcher ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.body),
    redirect: "error",
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Solana RPC request failed");
  let value: unknown;
  try {
    value = await response.json() as unknown;
  } catch (error) {
    throw new Error("Solana RPC response is malformed", { cause: error });
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    "error" in value
  ) {
    throw new Error("Solana RPC returned an error");
  }
  return value;
}

function canonicalRpcUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error("Solana RPC URL is invalid", { cause: error });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.toString() !== value
  ) {
    // Private providers may place an API key in the path or query. This value is
    // server-only and is never copied into an error or response.
    throw new Error("Solana RPC URL must be canonical HTTPS without userinfo or a fragment");
  }
  return value;
}

function rpcId(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new Error("DFlow operation ID is invalid");
  }
  return value;
}

function assertSafeNonnegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`);
}

function validateBalanceGuard(
  value: DflowSimulationBalanceGuard,
): DflowSimulationBalanceGuard {
  for (const [label, address] of [
    ["wallet", value.walletAddress],
    ["input token account", value.inputTokenAccount],
    ["output token account", value.outputTokenAccount],
    ["input mint", value.inputMint],
    ["output mint", value.outputMint],
  ] as const) {
    try {
      if (new PublicKey(address).toBase58() !== address) throw new Error("noncanonical");
    } catch (error) {
      throw new Error(`DFlow simulation ${label} is invalid`, { cause: error });
    }
  }
  for (const [label, amount] of [
    ["input debit", value.expectedInputDebitAtomic],
    ["minimum output credit", value.minimumOutputCreditAtomic],
    ["maximum lamport debit", value.maximumLamportDebit],
  ] as const) {
    if (!/^(0|[1-9][0-9]*)$/.test(amount)) {
      throw new Error(`DFlow simulation ${label} is invalid`);
    }
  }
  if (value.expectedInputDebitAtomic === "0") {
    throw new Error("DFlow simulation input debit must be positive");
  }
  return value;
}

function verifyBalanceDeltas(
  guard: DflowSimulationBalanceGuard,
  pre: readonly (z.infer<typeof rpcAccountSchema> | null)[],
  postUnknown: readonly unknown[] | undefined,
) {
  if (postUnknown === undefined || postUnknown.length !== 3) {
    throw new Error("DFlow simulation omitted guarded account state");
  }
  const post = postUnknown.map((account) => rpcAccountSchema.nullable().parse(account));
  const preWallet = pre[0];
  const postWallet = post[0];
  if (preWallet === null || preWallet === undefined || postWallet === null) {
    throw new Error("DFlow simulation omitted the fee-payer account");
  }
  const preInput = tokenBalance(pre[1], guard.inputMint, guard.walletAddress, false);
  const postInput = tokenBalance(post[1], guard.inputMint, guard.walletAddress, false);
  const preOutput = tokenBalance(pre[2], guard.outputMint, guard.walletAddress, true);
  const postOutput = tokenBalance(
    post[2],
    guard.outputMint,
    guard.walletAddress,
    guard.minimumOutputCreditAtomic === "0",
  );
  if (postInput > preInput || postOutput < preOutput) {
    throw new Error("DFlow simulation token balance direction is invalid");
  }
  const inputDebit = preInput - postInput;
  const outputCredit = postOutput - preOutput;
  const lamportDebit = BigInt(Math.max(0, preWallet.lamports - postWallet.lamports));
  if (inputDebit !== BigInt(guard.expectedInputDebitAtomic)) {
    throw new Error("DFlow simulation input debit does not equal the authorized amount");
  }
  if (outputCredit < BigInt(guard.minimumOutputCreditAtomic)) {
    throw new Error("DFlow simulation output credit is below the authorized floor");
  }
  if (lamportDebit > BigInt(guard.maximumLamportDebit)) {
    throw new Error("DFlow simulation lamport debit exceeds the reserved bound");
  }
  return Object.freeze({
    inputDebitAtomic: inputDebit.toString(),
    outputCreditAtomic: outputCredit.toString(),
    lamportDebit: lamportDebit.toString(),
  });
}

function tokenBalance(
  account: z.infer<typeof rpcAccountSchema> | null | undefined,
  expectedMint: string,
  expectedOwner: string,
  allowMissing: boolean,
): bigint {
  if (account === null || account === undefined) {
    if (allowMissing) return 0n;
    throw new Error("DFlow simulation omitted a required token account");
  }
  if (account.executable || account.owner !== CLASSIC_TOKEN_PROGRAM_ID) {
    throw new Error("DFlow simulation token account owner is invalid");
  }
  const encoded = account.data[0];
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || bytes.byteLength < 72) {
    throw new Error("DFlow simulation token account data is malformed");
  }
  if (
    new PublicKey(bytes.subarray(0, 32)).toBase58() !== expectedMint ||
    new PublicKey(bytes.subarray(32, 64)).toBase58() !== expectedOwner
  ) {
    throw new Error("DFlow simulation token account binding changed");
  }
  return bytes.readBigUInt64LE(64);
}
