import { createHash } from "node:crypto";

import {
  AddressLookupTableAccount,
  PublicKey,
  type MessageCompiledInstruction,
  type MessageAccountKeys,
  type VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import type { AtomicAmount } from "@/core/live-money";

import { assertAtomicAtMost, assertFreshBlockHeight } from "./bounds";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CLASSIC_TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  assertSanitizedDflowFixtureProgram,
} from "./program-allowlist";

const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface DflowSanitizedFixturePolicy {
  readonly feePayer: string;
  readonly expectedRecentBlockhash: string;
  readonly currentBlockHeight: number;
  readonly lastValidBlockHeight: number;
  readonly inputMint: string;
  readonly inputMintDecimals: number;
  readonly outputMint: string;
  readonly inputSource: string;
  readonly inputDestination: string;
  readonly outputDestination: string;
  readonly allowedLamportDestination: string;
  readonly reservedInputAtomic: AtomicAmount;
  readonly maxExplicitLamportTransferAtomic: AtomicAmount;
}

export interface DflowFixtureLookupTable {
  readonly address: string;
  readonly addresses: readonly string[];
  readonly boundSha256: string;
}

export interface DflowSanitizedFixtureEvidence {
  readonly fixtureOnly: true;
  readonly executable: false;
  readonly messageVersion: "legacy" | 0;
  readonly messageByteLength: number;
  readonly recentBlockhash: string;
  readonly lastValidBlockHeight: number;
  readonly requiredSigners: readonly string[];
  readonly inputOutflowAtomic: AtomicAmount;
  readonly explicitLamportTransferAtomic: AtomicAmount;
  readonly lookupTableHashes: Readonly<Record<string, string>>;
  readonly unsignedMessageSha256: string;
  readonly resolvedAccountListSha256: string;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalPublicKey(value: string, label: string): string {
  try {
    const canonical = new PublicKey(value).toBase58();
    if (canonical !== value) throw new Error("non-canonical");
    return canonical;
  } catch {
    throw new Error(`${label} must be a canonical Solana public key`);
  }
}

function deriveClassicAssociatedTokenAddress(
  owner: string,
  mint: string,
): string {
  return PublicKey.findProgramAddressSync(
    [
      new PublicKey(owner).toBuffer(),
      new PublicKey(CLASSIC_TOKEN_PROGRAM_ID).toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  )[0].toBase58();
}

export function hashDflowFixtureLookupTable(
  table: Pick<DflowFixtureLookupTable, "address" | "addresses">,
): string {
  const address = canonicalPublicKey(table.address, "Lookup-table address");
  const addresses = table.addresses.map((value) =>
    canonicalPublicKey(value, "Lookup-table entry"),
  );
  return sha256(
    JSON.stringify({
      schemaVersion: "dflow-sanitized-lookup-v1",
      address,
      addresses,
    }),
  );
}

function decodeStrictBase64(value: string): Uint8Array {
  if (value.length === 0 || !STRICT_BASE64.test(value)) {
    throw new Error("Sanitized DFlow fixture must be canonical base64");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error("Sanitized DFlow fixture must be canonical base64");
  }
  if (decoded.byteLength > 1_232) {
    throw new Error("Sanitized DFlow fixture exceeds Solana's 1232-byte limit");
  }
  return decoded;
}

function deserializeFixture(value: string): VersionedTransaction {
  const decoded = decodeStrictBase64(value);
  try {
    return VersionedTransaction.deserialize(decoded);
  } catch {
    throw new Error("Sanitized DFlow fixture could not be deserialized or has an unsupported version");
  }
}

function resolveLookupTables(
  message: VersionedMessage,
  suppliedTables: readonly DflowFixtureLookupTable[],
): {
  readonly accounts: readonly AddressLookupTableAccount[];
  readonly hashes: Readonly<Record<string, string>>;
} {
  if (message.version === "legacy") {
    if (suppliedTables.length !== 0) {
      throw new Error("Legacy sanitized fixture cannot carry lookup-table evidence");
    }
    return { accounts: Object.freeze([]), hashes: Object.freeze({}) };
  }

  const required = new Set(
    message.addressTableLookups.map((lookup) => lookup.accountKey.toBase58()),
  );
  if (suppliedTables.length !== required.size) {
    throw new Error("Every DFlow fixture lookup table must be supplied exactly once");
  }

  const accounts: AddressLookupTableAccount[] = [];
  const hashes: Record<string, string> = {};
  for (const table of suppliedTables) {
    const address = canonicalPublicKey(table.address, "Lookup-table address");
    if (!required.delete(address)) {
      throw new Error("Unexpected or duplicate DFlow fixture lookup table");
    }
    if (!SHA256_HEX.test(table.boundSha256)) {
      throw new Error("Lookup-table binding must be lowercase SHA-256 hex");
    }
    const currentHash = hashDflowFixtureLookupTable(table);
    if (currentHash !== table.boundSha256) {
      throw new Error("DFlow fixture lookup table changed after it was bound");
    }
    const addresses = table.addresses.map((value) => new PublicKey(value));
    accounts.push(
      new AddressLookupTableAccount({
        key: new PublicKey(address),
        state: {
          deactivationSlot: 0xffff_ffff_ffff_ffffn,
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          authority: undefined,
          addresses,
        },
      }),
    );
    hashes[address] = currentHash;
  }
  if (required.size !== 0) {
    throw new Error("A required DFlow fixture lookup table is missing");
  }
  return {
    accounts: Object.freeze(accounts),
    hashes: Object.freeze(hashes),
  };
}

function accountKeysFor(
  message: VersionedMessage,
  lookupTables: readonly AddressLookupTableAccount[],
): MessageAccountKeys {
  if (message.version === "legacy") return message.getAccountKeys();
  return message.getAccountKeys({
    addressLookupTableAccounts: [...lookupTables],
  });
}

function keyAt(keys: MessageAccountKeys, index: number, label: string): string {
  const key = keys.get(index);
  if (!key) throw new Error(`${label} references a missing account`);
  return key.toBase58();
}

function assertInstructionAccounts(
  instruction: MessageCompiledInstruction,
  expected: readonly string[],
  keys: MessageAccountKeys,
  label: string,
): void {
  if (instruction.accountKeyIndexes.length !== expected.length) {
    throw new Error(`${label} has an unexpected account or multisig shape`);
  }
  instruction.accountKeyIndexes.forEach((index, position) => {
    if (keyAt(keys, index, label) !== expected[position]) {
      throw new Error(`${label} account binding does not match policy`);
    }
  });
}

function readU64LittleEndian(data: Uint8Array, offset: number): bigint {
  return Buffer.from(data).readBigUInt64LE(offset);
}

function validateInstructions(
  message: VersionedMessage,
  keys: MessageAccountKeys,
  policy: DflowSanitizedFixturePolicy,
): { readonly inputOutflow: bigint; readonly explicitLamportTransfer: bigint } {
  let inputOutflow = 0n;
  let explicitLamportTransfer = 0n;
  const counts = new Map<string, number>();

  for (const instruction of message.compiledInstructions) {
    const programId = keyAt(keys, instruction.programIdIndex, "Program");
    assertSanitizedDflowFixtureProgram(programId);
    counts.set(programId, (counts.get(programId) ?? 0) + 1);

    if (programId === COMPUTE_BUDGET_PROGRAM_ID) {
      if (
        instruction.accountKeyIndexes.length !== 0 ||
        instruction.data.length !== 5 ||
        instruction.data[0] !== 2 ||
        Buffer.from(instruction.data).readUInt32LE(1) !== 200_000
      ) {
        throw new Error(
          "Compute-unit fixture instruction must set exactly 200000 units",
        );
      }
      continue;
    }

    if (programId === ASSOCIATED_TOKEN_PROGRAM_ID) {
      if (instruction.data.length !== 0) {
        throw new Error("Associated-token fixture instruction must use create semantics");
      }
      assertInstructionAccounts(
        instruction,
        [
          policy.feePayer,
          policy.outputDestination,
          policy.feePayer,
          policy.outputMint,
          SYSTEM_PROGRAM_ID,
          CLASSIC_TOKEN_PROGRAM_ID,
        ],
        keys,
        "Associated-token fixture instruction",
      );
      continue;
    }

    if (programId === CLASSIC_TOKEN_PROGRAM_ID) {
      if (instruction.data.length !== 10 || instruction.data[0] !== 12) {
        throw new Error("Classic-token fixture instruction must be TransferChecked");
      }
      if (instruction.data[9] !== policy.inputMintDecimals) {
        throw new Error("Classic-token fixture decimals do not match the input mint");
      }
      assertInstructionAccounts(
        instruction,
        [
          policy.inputSource,
          policy.inputMint,
          policy.inputDestination,
          policy.feePayer,
        ],
        keys,
        "Classic-token fixture instruction",
      );
      inputOutflow += readU64LittleEndian(instruction.data, 1);
      continue;
    }

    if (
      instruction.data.length !== 12 ||
      Buffer.from(instruction.data).readUInt32LE(0) !== 2
    ) {
      throw new Error("System fixture instruction must be a direct transfer");
    }
    assertInstructionAccounts(
      instruction,
      [policy.feePayer, policy.allowedLamportDestination],
      keys,
      "System fixture transfer",
    );
    explicitLamportTransfer += readU64LittleEndian(instruction.data, 4);
  }

  for (const programId of [
    COMPUTE_BUDGET_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    CLASSIC_TOKEN_PROGRAM_ID,
    SYSTEM_PROGRAM_ID,
  ]) {
    if (counts.get(programId) !== 1) {
      throw new Error(`Sanitized DFlow fixture requires exactly one ${programId} instruction`);
    }
  }
  if (inputOutflow === 0n) {
    throw new Error("DFlow fixture USDC outflow must be positive");
  }

  assertAtomicAtMost(
    inputOutflow.toString(),
    policy.reservedInputAtomic,
    "DFlow fixture USDC outflow",
  );
  assertAtomicAtMost(
    explicitLamportTransfer.toString(),
    policy.maxExplicitLamportTransferAtomic,
    "DFlow fixture explicit lamport transfer",
  );
  return { inputOutflow, explicitLamportTransfer };
}

/**
 * Validates only a txBet-owned sanitized fixture. It cannot sign, simulate, send,
 * reserve funds, or promote DFlow into the live registry.
 */
export function validateSanitizedDflowTransactionFixture(
  fixtureBase64: string,
  policy: DflowSanitizedFixturePolicy,
  lookupTables: readonly DflowFixtureLookupTable[] = [],
): DflowSanitizedFixtureEvidence {
  for (const [label, value] of [
    ["Fee payer", policy.feePayer],
    ["Expected blockhash", policy.expectedRecentBlockhash],
    ["Input mint", policy.inputMint],
    ["Output mint", policy.outputMint],
    ["Input source", policy.inputSource],
    ["Input destination", policy.inputDestination],
    ["Output destination", policy.outputDestination],
    ["Lamport destination", policy.allowedLamportDestination],
  ] as const) {
    canonicalPublicKey(value, label);
  }
  const distinctRoles = [
    policy.feePayer,
    policy.inputMint,
    policy.outputMint,
    policy.inputSource,
    policy.inputDestination,
    policy.outputDestination,
    policy.allowedLamportDestination,
  ];
  if (new Set(distinctRoles).size !== distinctRoles.length) {
    throw new Error("DFlow fixture mints and account roles must be distinct");
  }
  if (
    !Number.isSafeInteger(policy.inputMintDecimals) ||
    policy.inputMintDecimals < 0 ||
    policy.inputMintDecimals > 255
  ) {
    throw new Error("Input mint decimals must be an unsigned byte");
  }
  assertFreshBlockHeight(policy.currentBlockHeight, policy.lastValidBlockHeight);

  const transaction = deserializeFixture(fixtureBase64);
  if (transaction.version !== "legacy" && transaction.version !== 0) {
    throw new Error("Sanitized DFlow fixture uses an unsupported transaction version");
  }
  if (
    transaction.signatures.some((signature) =>
      signature.some((byte) => byte !== 0),
    )
  ) {
    throw new Error("Sanitized DFlow fixture must remain unsigned");
  }
  const message = transaction.message;
  if (message.recentBlockhash !== policy.expectedRecentBlockhash) {
    throw new Error("Sanitized DFlow fixture recent blockhash does not match policy");
  }
  const resolvedLookups = resolveLookupTables(message, lookupTables);
  const keys = accountKeysFor(message, resolvedLookups.accounts);
  if (keyAt(keys, 0, "Fee payer") !== policy.feePayer) {
    throw new Error("Sanitized DFlow fixture fee payer does not match the embedded wallet");
  }
  if (
    policy.inputSource !==
    deriveClassicAssociatedTokenAddress(policy.feePayer, policy.inputMint)
  ) {
    throw new Error("DFlow fixture input source must be the wallet associated token account");
  }
  if (
    policy.outputDestination !==
    deriveClassicAssociatedTokenAddress(policy.feePayer, policy.outputMint)
  ) {
    throw new Error(
      "DFlow fixture output destination must be the wallet associated token account",
    );
  }

  const requiredSigners = Array.from(
    { length: message.header.numRequiredSignatures },
    (_, index) => keyAt(keys, index, "Required signer"),
  );
  if (requiredSigners.length !== 1 || requiredSigners[0] !== policy.feePayer) {
    throw new Error("Embedded wallet must be the only required DFlow fixture signer");
  }

  const permittedWritable = new Set([
    policy.feePayer,
    policy.inputSource,
    policy.inputDestination,
    policy.outputDestination,
    policy.allowedLamportDestination,
  ]);
  const actualWritable = new Set<string>();
  for (let index = 0; index < keys.length; index += 1) {
    if (message.isAccountWritable(index)) {
      const writable = keyAt(keys, index, "Writable account");
      actualWritable.add(writable);
      if (!permittedWritable.has(writable)) {
        throw new Error(`Unexpected writable account in DFlow fixture: ${writable}`);
      }
    }
  }
  for (const requiredWritable of permittedWritable) {
    if (!actualWritable.has(requiredWritable)) {
      throw new Error(
        `DFlow fixture required writable account is read-only: ${requiredWritable}`,
      );
    }
  }

  const totals = validateInstructions(message, keys, policy);
  const messageBytes = message.serialize();
  const resolvedAccounts = Array.from({ length: keys.length }, (_, index) =>
    keyAt(keys, index, "Resolved account"),
  );

  return Object.freeze({
    fixtureOnly: true,
    executable: false,
    messageVersion: transaction.version,
    messageByteLength: messageBytes.byteLength,
    recentBlockhash: message.recentBlockhash,
    lastValidBlockHeight: policy.lastValidBlockHeight,
    requiredSigners: Object.freeze(requiredSigners),
    inputOutflowAtomic: totals.inputOutflow.toString() as AtomicAmount,
    explicitLamportTransferAtomic:
      totals.explicitLamportTransfer.toString() as AtomicAmount,
    lookupTableHashes: resolvedLookups.hashes,
    unsignedMessageSha256: sha256(messageBytes),
    resolvedAccountListSha256: sha256(
      JSON.stringify({
        schemaVersion: "dflow-sanitized-account-list-v1",
        accounts: resolvedAccounts,
      }),
    ),
  });
}
