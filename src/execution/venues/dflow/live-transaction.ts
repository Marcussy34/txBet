import { createHash, timingSafeEqual } from "node:crypto";

import * as ed25519 from "@noble/ed25519";
import {
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CLASSIC_TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
} from "@/execution/venues/dflow/program-allowlist";

const MAX_TRANSACTION_BYTES = 1_232;
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface InspectedDflowTransaction {
  readonly transactionBase64: string;
  readonly transactionHash: string;
  readonly messageBase64: string;
  readonly messageHash: string;
  readonly walletAddress: string;
  readonly inputTokenAccount: string;
  readonly outputTokenAccount: string;
  readonly recentBlockhash: string;
  readonly computeUnitLimit: number;
  readonly computeUnitPriceMicroLamports: string;
  readonly priorityFeeLamports: string;
  readonly programIds: readonly string[];
}

export interface SignedDflowTransaction {
  readonly transactionBase64: string;
  readonly transactionHash: string;
  readonly signature: string;
}

/** Inspects DFlow's unsigned bytes without loosening the replay-fixture validator. */
export function inspectUnsignedDflowTransaction(input: {
  readonly transactionBase64: string;
  readonly walletAddress: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly allowedProgramIds: readonly string[];
}): InspectedDflowTransaction {
  const bytes = decodeTransaction(input.transactionBase64);
  const transaction = deserialize(bytes);
  const message = transaction.message;
  if (message.version !== 0 && message.version !== "legacy") {
    throw new Error("DFlow transaction version is not supported");
  }
  if (message.version === 0 && message.addressTableLookups.length !== 0) {
    throw new Error("DFlow live canary does not accept address lookup tables");
  }
  if (message.header.numRequiredSignatures !== 1 || transaction.signatures.length !== 1) {
    throw new Error("DFlow transaction must have the embedded wallet as its sole required signer");
  }
  if (transaction.signatures.some((signature) => !isZeroSignature(signature))) {
    throw new Error("DFlow transaction must be unsigned before Privy authorization");
  }

  const wallet = canonicalPublicKey(input.walletAddress, "wallet");
  const inputMint = canonicalPublicKey(input.inputMint, "input mint");
  const outputMint = canonicalPublicKey(input.outputMint, "output mint");
  const staticKeys = message.version === "legacy" ? message.accountKeys : message.staticAccountKeys;
  if (staticKeys[0]?.toBase58() !== wallet.toBase58()) {
    throw new Error("DFlow transaction fee payer is not the authenticated wallet");
  }

  const inputTokenAccount = associatedTokenAddress(wallet, inputMint);
  const outputTokenAccount = associatedTokenAddress(wallet, outputMint);
  const requiredAccounts = [inputMint, outputMint, inputTokenAccount, outputTokenAccount]
    .map((key) => key.toBase58());
  const staticAddresses = new Set(staticKeys.map((key) => key.toBase58()));
  if (requiredAccounts.some((address) => !staticAddresses.has(address))) {
    throw new Error("DFlow transaction is missing a user-bound mint or token account");
  }

  const instructions = message.version === "legacy"
    ? message.instructions
    : message.compiledInstructions;
  const allowed = new Set([
    ...input.allowedProgramIds.map((value) => canonicalPublicKey(value, "program").toBase58()),
    COMPUTE_BUDGET_PROGRAM_ID,
  ]);
  const programIds = instructions.map((instruction) => {
    const program = staticKeys[instruction.programIdIndex];
    if (!program) throw new Error("DFlow transaction program index is invalid");
    const programId = program.toBase58();
    if (!allowed.has(programId)) {
      throw new Error(`DFlow transaction program is not allowlisted: ${programId}`);
    }
    return programId;
  });

  const compute = inspectComputeBudget(
    instructions
      .filter((instruction) => staticKeys[instruction.programIdIndex]?.toBase58() === COMPUTE_BUDGET_PROGRAM_ID)
      .map((instruction) => Buffer.from(instruction.data)),
  );
  const priorityFee = (BigInt(compute.limit) * compute.price + 999_999n) / 1_000_000n;
  const messageBytes = Buffer.from(message.serialize());

  return Object.freeze({
    transactionBase64: input.transactionBase64,
    transactionHash: hash(bytes),
    messageBase64: messageBytes.toString("base64"),
    messageHash: hash(messageBytes),
    walletAddress: wallet.toBase58(),
    inputTokenAccount: inputTokenAccount.toBase58(),
    outputTokenAccount: outputTokenAccount.toBase58(),
    recentBlockhash: message.recentBlockhash,
    computeUnitLimit: compute.limit,
    computeUnitPriceMicroLamports: compute.price.toString(),
    priorityFeeLamports: priorityFee.toString(),
    programIds: Object.freeze([...new Set(programIds)].sort()),
  });
}

/** Proves Privy signed the exact reviewed message with the embedded wallet. */
export async function validatePrivySignedDflowTransaction(input: {
  readonly signedTransactionBase64: string;
  readonly inspected: InspectedDflowTransaction;
}): Promise<SignedDflowTransaction> {
  const bytes = decodeTransaction(input.signedTransactionBase64);
  const transaction = deserialize(bytes);
  if (transaction.signatures.length !== 1) {
    throw new Error("Privy DFlow transaction has an unexpected signature count");
  }
  const messageBytes = Buffer.from(transaction.message.serialize());
  const expectedMessage = Buffer.from(input.inspected.messageBase64, "base64");
  if (
    messageBytes.byteLength !== expectedMessage.byteLength ||
    !timingSafeEqual(messageBytes, expectedMessage)
  ) {
    throw new Error("Privy changed the reviewed DFlow transaction message");
  }
  const signature = transaction.signatures[0];
  if (!signature || isZeroSignature(signature)) {
    throw new Error("Privy DFlow transaction signature is missing");
  }
  const publicKey = bs58.decode(input.inspected.walletAddress);
  if (!await ed25519.verifyAsync(signature, messageBytes, publicKey)) {
    throw new Error("Privy DFlow transaction signature is invalid");
  }
  return Object.freeze({
    transactionBase64: input.signedTransactionBase64,
    transactionHash: hash(bytes),
    signature: bs58.encode(signature),
  });
}

function decodeTransaction(value: string): Buffer {
  if (!CANONICAL_BASE64.test(value)) {
    throw new Error("DFlow transaction must use canonical base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new Error("DFlow transaction must use canonical base64");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_TRANSACTION_BYTES) {
    throw new Error("DFlow transaction size is outside Solana's packet bound");
  }
  return bytes;
}

function deserialize(bytes: Uint8Array): VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch (error) {
    throw new Error("DFlow transaction bytes are malformed", { cause: error });
  }
}

function inspectComputeBudget(data: readonly Buffer[]): Readonly<{ limit: number; price: bigint }> {
  let limit: number | null = null;
  let price: bigint | null = null;
  for (const instruction of data) {
    if (instruction[0] === 2 && instruction.byteLength === 5) {
      if (limit !== null) throw new Error("DFlow transaction repeats its compute-unit limit");
      limit = instruction.readUInt32LE(1);
    } else if (instruction[0] === 3 && instruction.byteLength === 9) {
      if (price !== null) throw new Error("DFlow transaction repeats its compute-unit price");
      price = instruction.readBigUInt64LE(1);
    } else {
      throw new Error("DFlow transaction has an unsupported compute-budget instruction");
    }
  }
  if (limit === null || limit <= 0 || price === null) {
    throw new Error("DFlow transaction must explicitly bound compute units and priority price");
  }
  return Object.freeze({ limit, price });
}

function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), new PublicKey(CLASSIC_TOKEN_PROGRAM_ID).toBuffer(), mint.toBuffer()],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  )[0];
}

function canonicalPublicKey(value: string, label: string): PublicKey {
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) throw new Error("not canonical");
    return key;
  } catch (error) {
    throw new Error(`DFlow ${label} is not a canonical Solana public key`, { cause: error });
  }
}

function isZeroSignature(value: Uint8Array): boolean {
  return value.byteLength === 64 && value.every((byte) => byte === 0);
}

function hash(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
