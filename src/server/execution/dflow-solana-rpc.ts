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
  const guardedAddresses = guard === null
    ? Object.freeze([] as string[])
    : guardedAccountAddresses(guard);
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
        params: [guardedAddresses, {
          encoding: "base64",
          commitment,
          minContextSlot: input.minimumContextSlot,
        }],
      },
    }));
    if (pre.id !== preId || pre.result.value.length !== guardedAddresses.length) {
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
                addresses: guardedAddresses,
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
        guardedAddresses,
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
  readonly writableAccountAddresses: readonly string[];
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
  if (
    !Array.isArray(value.writableAccountAddresses) ||
    value.writableAccountAddresses.length === 0 ||
    value.writableAccountAddresses.length > 64
  ) {
    throw new Error("DFlow simulation writable-account boundary is invalid");
  }
  const writable = new Set<string>();
  for (const address of value.writableAccountAddresses) {
    try {
      const canonical = new PublicKey(address).toBase58();
      if (canonical !== address || writable.has(address)) throw new Error("noncanonical");
      writable.add(address);
    } catch (error) {
      throw new Error("DFlow simulation writable account is invalid", { cause: error });
    }
  }
  if (
    !writable.has(value.walletAddress) ||
    !writable.has(value.inputTokenAccount) ||
    !writable.has(value.outputTokenAccount)
  ) {
    throw new Error("DFlow simulation omitted a protected writable account");
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

function guardedAccountAddresses(
  guard: DflowSimulationBalanceGuard,
): readonly string[] {
  return Object.freeze([...guard.writableAccountAddresses]);
}

function verifyBalanceDeltas(
  guard: DflowSimulationBalanceGuard,
  addresses: readonly string[],
  pre: readonly (z.infer<typeof rpcAccountSchema> | null)[],
  postUnknown: readonly unknown[] | undefined,
) {
  if (
    pre.length !== addresses.length ||
    postUnknown === undefined ||
    postUnknown.length !== addresses.length
  ) {
    throw new Error("DFlow simulation omitted guarded account state");
  }
  const post = postUnknown.map((account) => rpcAccountSchema.nullable().parse(account));
  const indexByAddress = new Map(addresses.map((address, index) => [address, index]));
  const walletIndex = indexByAddress.get(guard.walletAddress)!;
  const inputIndex = indexByAddress.get(guard.inputTokenAccount)!;
  const outputIndex = indexByAddress.get(guard.outputTokenAccount)!;
  const preWallet = pre[walletIndex];
  const postWallet = post[walletIndex];
  if (preWallet === null || preWallet === undefined || postWallet === null) {
    throw new Error("DFlow simulation omitted the fee-payer account");
  }
  assertSameAccountExceptLamports(preWallet, postWallet, "fee payer");
  const preInput = tokenState(pre[inputIndex], guard.inputMint, guard.walletAddress, false);
  const postInput = tokenState(post[inputIndex], guard.inputMint, guard.walletAddress, false);
  assertSameTokenStateExceptAmount(preInput, postInput, "input token account");
  const preOutput = tokenState(pre[outputIndex], guard.outputMint, guard.walletAddress, true);
  const postOutput = tokenState(
    post[outputIndex],
    guard.outputMint,
    guard.walletAddress,
    guard.minimumOutputCreditAtomic === "0",
  );
  assertAuthorizedOutputTransition(preOutput, postOutput);

  for (let index = 0; index < addresses.length; index += 1) {
    if (index === walletIndex || index === inputIndex || index === outputIndex) continue;
    const before = walletOwnedTokenAccount(pre[index], guard.walletAddress);
    const after = walletOwnedTokenAccount(post[index], guard.walletAddress);
    if (before !== null || after !== null) {
      if (before === null || after === null || !accountsEqual(before.account, after.account)) {
        throw new Error("DFlow simulation changed another wallet-owned token account");
      }
    }
  }

  if (postInput.amount > preInput.amount || postOutput.amount < preOutput.amount) {
    throw new Error("DFlow simulation token balance direction is invalid");
  }
  const inputDebit = preInput.amount - postInput.amount;
  const outputCredit = postOutput.amount - preOutput.amount;
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

type RpcAccount = z.infer<typeof rpcAccountSchema>;
type TokenState = Readonly<{ account: RpcAccount; bytes: Buffer; amount: bigint }>;

function tokenState(
  account: z.infer<typeof rpcAccountSchema> | null | undefined,
  expectedMint: string,
  expectedOwner: string,
  allowMissing: boolean,
): TokenState {
  if (account === null || account === undefined) {
    if (allowMissing) {
      return Object.freeze({
        account: rpcAccountSchema.parse({
          data: ["", "base64"],
          executable: false,
          lamports: 0,
          owner: CLASSIC_TOKEN_PROGRAM_ID,
        }),
        bytes: Buffer.alloc(0),
        amount: 0n,
      });
    }
    throw new Error("DFlow simulation omitted a required token account");
  }
  if (account.executable || account.owner !== CLASSIC_TOKEN_PROGRAM_ID) {
    throw new Error("DFlow simulation token account owner is invalid");
  }
  const encoded = account.data[0];
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || bytes.byteLength !== 165) {
    throw new Error("DFlow simulation token account data is malformed");
  }
  if (
    new PublicKey(bytes.subarray(0, 32)).toBase58() !== expectedMint ||
    new PublicKey(bytes.subarray(32, 64)).toBase58() !== expectedOwner
  ) {
    throw new Error("DFlow simulation token account binding changed");
  }
  return Object.freeze({ account, bytes, amount: bytes.readBigUInt64LE(64) });
}

function assertSameTokenStateExceptAmount(
  before: TokenState,
  after: TokenState,
  label: string,
): void {
  if (
    before.bytes.byteLength !== 165 ||
    after.bytes.byteLength !== 165 ||
    before.account.lamports !== after.account.lamports ||
    before.account.owner !== after.account.owner ||
    before.account.executable !== after.account.executable ||
    !before.bytes.subarray(0, 64).equals(after.bytes.subarray(0, 64)) ||
    !before.bytes.subarray(72).equals(after.bytes.subarray(72))
  ) {
    throw new Error(`DFlow simulation changed ${label} authority or metadata`);
  }
}

function assertAuthorizedOutputTransition(before: TokenState, after: TokenState): void {
  if (before.bytes.byteLength === 165) {
    assertSameTokenStateExceptAmount(before, after, "output token account");
    return;
  }
  if (after.bytes.byteLength === 0) return;
  if (
    after.bytes.byteLength !== 165 ||
    after.bytes.readUInt32LE(72) !== 0 ||
    after.bytes[108] !== 1 ||
    after.bytes.readUInt32LE(109) !== 0 ||
    after.bytes.readBigUInt64LE(121) !== 0n ||
    after.bytes.readUInt32LE(129) !== 0
  ) {
    throw new Error("DFlow simulation created an output token account with authority");
  }
}

function walletOwnedTokenAccount(
  account: RpcAccount | null | undefined,
  walletAddress: string,
): TokenState | null {
  if (account === null || account === undefined || account.owner !== CLASSIC_TOKEN_PROGRAM_ID) {
    return null;
  }
  const encoded = account.data[0];
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || bytes.byteLength !== 165) return null;
  if (new PublicKey(bytes.subarray(32, 64)).toBase58() !== walletAddress) return null;
  return Object.freeze({ account, bytes, amount: bytes.readBigUInt64LE(64) });
}

function assertSameAccountExceptLamports(before: RpcAccount, after: RpcAccount, label: string): void {
  if (
    before.owner !== after.owner ||
    before.executable !== after.executable ||
    before.data[0] !== after.data[0] ||
    before.data[1] !== after.data[1]
  ) {
    throw new Error(`DFlow simulation changed ${label} metadata`);
  }
}

function accountsEqual(left: RpcAccount, right: RpcAccount): boolean {
  return left.lamports === right.lamports &&
    left.owner === right.owner &&
    left.executable === right.executable &&
    left.data[0] === right.data[0] &&
    left.data[1] === right.data[1];
}
