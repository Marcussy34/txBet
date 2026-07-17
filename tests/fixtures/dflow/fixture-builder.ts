import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

function fixtureKey(byte: number): string {
  return new PublicKey(Uint8Array.from({ length: 32 }, () => byte)).toBase58();
}

function associatedTokenAddress(owner: string, mint: string): string {
  return PublicKey.findProgramAddressSync(
    [
      new PublicKey(owner).toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0].toBase58();
}

export const FIXTURE_WALLET = fixtureKey(1);
export const FIXTURE_INPUT_MINT = fixtureKey(2);
export const FIXTURE_OUTPUT_MINT = fixtureKey(3);
export const FIXTURE_INPUT_SOURCE = associatedTokenAddress(
  FIXTURE_WALLET,
  FIXTURE_INPUT_MINT,
);
export const FIXTURE_INPUT_DESTINATION = fixtureKey(5);
export const FIXTURE_OUTPUT_DESTINATION = associatedTokenAddress(
  FIXTURE_WALLET,
  FIXTURE_OUTPUT_MINT,
);
export const FIXTURE_LAMPORT_DESTINATION = fixtureKey(7);
export const FIXTURE_BLOCKHASH = fixtureKey(8);
export const FIXTURE_ATTACKER = fixtureKey(9);
export const FIXTURE_LOOKUP_TABLE = fixtureKey(10);
export const FIXTURE_UNKNOWN_PROGRAM = fixtureKey(11);

function transferCheckedInstruction(options: {
  readonly amountAtomic?: bigint;
  readonly inputSource?: string;
  readonly inputMint?: string;
  readonly inputDestination?: string;
  readonly programId?: PublicKey;
  readonly multisigShape?: boolean;
} = {}): TransactionInstruction {
  const data = Buffer.alloc(10);
  data[0] = 12;
  data.writeBigUInt64LE(options.amountAtomic ?? 1_000_000n, 1);
  data[9] = 6;

  const keys = [
    {
      pubkey: new PublicKey(options.inputSource ?? FIXTURE_INPUT_SOURCE),
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: new PublicKey(options.inputMint ?? FIXTURE_INPUT_MINT),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: new PublicKey(
        options.inputDestination ?? FIXTURE_INPUT_DESTINATION,
      ),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: new PublicKey(FIXTURE_WALLET), isSigner: true, isWritable: false },
  ];
  if (options.multisigShape) {
    keys.push({
      pubkey: new PublicKey(FIXTURE_ATTACKER),
      isSigner: false,
      isWritable: false,
    });
  }

  return new TransactionInstruction({
    programId: options.programId ?? TOKEN_PROGRAM_ID,
    keys,
    data,
  });
}

function associatedOutputInstruction(options: {
  readonly outputMint?: string;
  readonly outputDestination?: string;
  readonly outputDestinationWritable?: boolean;
} = {}): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: new PublicKey(FIXTURE_WALLET), isSigner: true, isWritable: true },
      {
        pubkey: new PublicKey(
          options.outputDestination ?? FIXTURE_OUTPUT_DESTINATION,
        ),
        isSigner: false,
        isWritable: options.outputDestinationWritable ?? true,
      },
      { pubkey: new PublicKey(FIXTURE_WALLET), isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(options.outputMint ?? FIXTURE_OUTPUT_MINT),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

export interface SanitizedFixtureMutation {
  readonly computeUnitLimit?: number;
  readonly amountAtomic?: bigint;
  readonly lamports?: number;
  readonly inputMint?: string;
  readonly inputSource?: string;
  readonly outputMint?: string;
  readonly inputDestination?: string;
  readonly outputDestination?: string;
  readonly outputDestinationWritable?: boolean;
  readonly tokenProgramId?: PublicKey;
  readonly tokenOpcode?: number;
  readonly multisigShape?: boolean;
  readonly unknownProgram?: boolean;
  readonly extraWritableAttacker?: boolean;
  readonly unexpectedSigner?: boolean;
  readonly recentBlockhash?: string;
}

export function buildSanitizedDflowFixture(
  mutation: SanitizedFixtureMutation = {},
): string {
  const tokenInstruction = transferCheckedInstruction({
    amountAtomic: mutation.amountAtomic,
    inputMint: mutation.inputMint,
    inputSource: mutation.inputSource,
    inputDestination: mutation.inputDestination,
    programId: mutation.tokenProgramId,
    multisigShape: mutation.multisigShape,
  });
  if (mutation.tokenOpcode !== undefined) {
    tokenInstruction.data[0] = mutation.tokenOpcode;
  }

  const transaction = new Transaction({
    feePayer: new PublicKey(FIXTURE_WALLET),
    recentBlockhash: mutation.recentBlockhash ?? FIXTURE_BLOCKHASH,
  }).add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: mutation.computeUnitLimit ?? 200_000,
    }),
    associatedOutputInstruction({
      outputMint: mutation.outputMint,
      outputDestination: mutation.outputDestination,
      outputDestinationWritable: mutation.outputDestinationWritable,
    }),
    tokenInstruction,
    SystemProgram.transfer({
      fromPubkey: new PublicKey(FIXTURE_WALLET),
      toPubkey: new PublicKey(FIXTURE_LAMPORT_DESTINATION),
      lamports: mutation.lamports ?? 5_000,
    }),
  );

  if (mutation.unknownProgram || mutation.extraWritableAttacker) {
    transaction.add(
      new TransactionInstruction({
        programId: new PublicKey(FIXTURE_UNKNOWN_PROGRAM),
        keys: mutation.extraWritableAttacker
          ? [
              {
                pubkey: new PublicKey(FIXTURE_ATTACKER),
                isSigner: false,
                isWritable: true,
              },
            ]
          : [],
        data: Buffer.from([1]),
      }),
    );
  }

  if (mutation.unexpectedSigner) {
    transaction.add(
      new TransactionInstruction({
        programId: new PublicKey(FIXTURE_UNKNOWN_PROGRAM),
        keys: [
          {
            pubkey: new PublicKey(FIXTURE_ATTACKER),
            isSigner: true,
            isWritable: false,
          },
        ],
        data: Buffer.from([2]),
      }),
    );
  }

  return transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

export function buildLookupTableFixture(): {
  readonly base64: string;
  readonly lookupAddress: string;
  readonly lookupAddresses: readonly string[];
} {
  const lookup = new AddressLookupTableAccount({
    key: new PublicKey(FIXTURE_LOOKUP_TABLE),
    state: {
      deactivationSlot: 0xffff_ffff_ffff_ffffn,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: [new PublicKey(FIXTURE_LAMPORT_DESTINATION)],
    },
  });
  const message = new TransactionMessage({
    payerKey: new PublicKey(FIXTURE_WALLET),
    recentBlockhash: FIXTURE_BLOCKHASH,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      associatedOutputInstruction(),
      transferCheckedInstruction(),
      SystemProgram.transfer({
        fromPubkey: new PublicKey(FIXTURE_WALLET),
        toPubkey: new PublicKey(FIXTURE_LAMPORT_DESTINATION),
        lamports: 5_000,
      }),
    ],
  }).compileToV0Message([lookup]);

  return {
    base64: Buffer.from(new VersionedTransaction(message).serialize()).toString(
      "base64",
    ),
    lookupAddress: FIXTURE_LOOKUP_TABLE,
    lookupAddresses: [FIXTURE_LAMPORT_DESTINATION],
  };
}
