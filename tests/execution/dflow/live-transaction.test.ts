import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  inspectUnsignedDflowTransaction,
  validatePrivySignedDflowTransaction,
} from "@/execution/venues/dflow/live-transaction";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CLASSIC_TOKEN_PROGRAM_ID,
} from "@/execution/venues/dflow/program-allowlist";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OUTCOME = new PublicKey(Uint8Array.from({ length: 32 }, () => 7));
const ROUTER = new PublicKey(Uint8Array.from({ length: 32 }, () => 8));
const BLOCKHASH = new PublicKey(Uint8Array.from({ length: 32 }, () => 9)).toBase58();

function ata(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), new PublicKey(CLASSIC_TOKEN_PROGRAM_ID).toBuffer(), mint.toBuffer()],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  )[0];
}

function unsignedFixture(options: {
  wallet?: Keypair;
  program?: PublicKey;
  extraSigner?: PublicKey;
  extraWritable?: PublicKey;
  includeExpectedAccounts?: boolean;
  lookup?: AddressLookupTableAccount;
} = {}) {
  const wallet = options.wallet ?? Keypair.generate();
  const inputMint = new PublicKey(USDC);
  const keys = options.includeExpectedAccounts === false
    ? [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }]
    : [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: inputMint, isSigner: false, isWritable: false },
        { pubkey: OUTCOME, isSigner: false, isWritable: false },
        { pubkey: ata(wallet.publicKey, inputMint), isSigner: false, isWritable: true },
        { pubkey: ata(wallet.publicKey, OUTCOME), isSigner: false, isWritable: true },
      ];
  if (options.extraSigner) {
    keys.push({ pubkey: options.extraSigner, isSigner: true, isWritable: false });
  }
  if (options.extraWritable) {
    keys.push({ pubkey: options.extraWritable, isSigner: false, isWritable: true });
  }
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
      new TransactionInstruction({
        programId: options.program ?? ROUTER,
        keys,
        data: Buffer.from([1, 2, 3]),
      }),
    ],
  }).compileToV0Message(options.lookup ? [options.lookup] : []);
  const transaction = new VersionedTransaction(message);
  return {
    wallet,
    transaction,
    base64: Buffer.from(transaction.serialize()).toString("base64"),
  };
}

function inspect(base64: string, wallet: PublicKey, programs = [ROUTER.toBase58()]) {
  return inspectUnsignedDflowTransaction({
    transactionBase64: base64,
    walletAddress: wallet.toBase58(),
    inputMint: USDC,
    outputMint: OUTCOME.toBase58(),
    allowedProgramIds: programs,
  });
}

describe("live DFlow transaction validation", () => {
  it("accepts one unsigned, user-bound, lookup-free transaction and measures priority fee", () => {
    const fixture = unsignedFixture();
    const result = inspect(fixture.base64, fixture.wallet.publicKey);

    expect(result).toMatchObject({
      walletAddress: fixture.wallet.publicKey.toBase58(),
      recentBlockhash: BLOCKHASH,
      computeUnitLimit: 200_000,
      computeUnitPriceMicroLamports: "1000",
      priorityFeeLamports: "200",
    });
    expect(result.messageHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.transactionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.writableAccountAddresses).toEqual([
      fixture.wallet.publicKey.toBase58(),
      ata(fixture.wallet.publicKey, new PublicKey(USDC)).toBase58(),
      ata(fixture.wallet.publicKey, OUTCOME).toBase58(),
    ]);
  });

  it("enumerates every writable account for the RPC state-change proof", () => {
    const extraWritable = Keypair.generate().publicKey;
    const fixture = unsignedFixture({ extraWritable });
    const result = inspect(fixture.base64, fixture.wallet.publicKey);

    expect(result.writableAccountAddresses).toContain(extraWritable.toBase58());
  });

  it("rejects extra signers, unexpected programs, missing bound accounts, and lookup tables", () => {
    const extra = Keypair.generate();
    const withSigner = unsignedFixture({ extraSigner: extra.publicKey });
    expect(() => inspect(withSigner.base64, withSigner.wallet.publicKey)).toThrow(/sole|required signer/i);

    const unexpected = unsignedFixture({ program: Keypair.generate().publicKey });
    expect(() => inspect(unexpected.base64, unexpected.wallet.publicKey)).toThrow(/program/i);

    const missing = unsignedFixture({ includeExpectedAccounts: false });
    expect(() => inspect(missing.base64, missing.wallet.publicKey)).toThrow(/account/i);

    const lookupKey = Keypair.generate().publicKey;
    const lookup = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: BigInt("18446744073709551615"),
        lastExtendedSlot: 1,
        lastExtendedSlotStartIndex: 0,
        authority: undefined,
        addresses: [lookupKey],
      },
    });
    const withLookup = unsignedFixture({ lookup });
    // Force the lookup key into an instruction so compilation retains the table.
    withLookup.transaction.message.addressTableLookups.push({
      accountKey: lookup.key,
      writableIndexes: [],
      readonlyIndexes: [0],
    });
    const encodedLookup = Buffer.from(withLookup.transaction.serialize()).toString("base64");
    expect(() => inspect(encodedLookup, withLookup.wallet.publicKey)).toThrow(/lookup/i);
  });

  it("accepts only the Privy signature over the exact reviewed message", async () => {
    const fixture = unsignedFixture();
    const inspected = inspect(fixture.base64, fixture.wallet.publicKey);
    fixture.transaction.sign([fixture.wallet]);
    const signedBase64 = Buffer.from(fixture.transaction.serialize()).toString("base64");

    const signed = await validatePrivySignedDflowTransaction({
      signedTransactionBase64: signedBase64,
      inspected,
    });
    expect(signed.signature).toBe(
      (await import("bs58")).default.encode(fixture.transaction.signatures[0]!),
    );

    const other = unsignedFixture({ wallet: fixture.wallet });
    other.transaction.message.recentBlockhash = Keypair.generate().publicKey.toBase58();
    other.transaction.sign([fixture.wallet]);
    await expect(validatePrivySignedDflowTransaction({
      signedTransactionBase64: Buffer.from(other.transaction.serialize()).toString("base64"),
      inspected,
    })).rejects.toThrow(/message/i);
  });

  it("rejects noncanonical base64, oversized bytes, and a transaction still unsigned", async () => {
    const fixture = unsignedFixture();
    expect(() => inspect(`${fixture.base64}\n`, fixture.wallet.publicKey)).toThrow(/base64/i);
    expect(() => inspect(Buffer.alloc(1_233).toString("base64"), fixture.wallet.publicKey)).toThrow(/size/i);
    const inspected = inspect(fixture.base64, fixture.wallet.publicKey);
    await expect(validatePrivySignedDflowTransaction({
      signedTransactionBase64: fixture.base64,
      inspected,
    })).rejects.toThrow(/signature/i);
  });
});
