import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  hashDflowFixtureLookupTable,
  validateSanitizedDflowTransactionFixture,
} from "@/execution/venues/dflow/transaction";
import {
  FIXTURE_ATTACKER,
  FIXTURE_BLOCKHASH,
  FIXTURE_INPUT_DESTINATION,
  FIXTURE_INPUT_MINT,
  FIXTURE_INPUT_SOURCE,
  FIXTURE_LAMPORT_DESTINATION,
  FIXTURE_OUTPUT_DESTINATION,
  FIXTURE_OUTPUT_MINT,
  FIXTURE_WALLET,
  TOKEN_2022_PROGRAM_ID,
  buildLookupTableFixture,
  buildSanitizedDflowFixture,
} from "../../fixtures/dflow/fixture-builder";

const fixturePolicy = {
  feePayer: FIXTURE_WALLET,
  expectedRecentBlockhash: FIXTURE_BLOCKHASH,
  currentBlockHeight: 450,
  lastValidBlockHeight: 500,
  inputMint: FIXTURE_INPUT_MINT,
  inputMintDecimals: 6,
  outputMint: FIXTURE_OUTPUT_MINT,
  inputSource: FIXTURE_INPUT_SOURCE,
  inputDestination: FIXTURE_INPUT_DESTINATION,
  outputDestination: FIXTURE_OUTPUT_DESTINATION,
  allowedLamportDestination: FIXTURE_LAMPORT_DESTINATION,
  reservedInputAtomic: "1000000",
  maxExplicitLamportTransferAtomic: "5000",
} as const;
const checkedInFixture = readFileSync(
  new URL("../../fixtures/dflow/unsigned-transaction.base64.txt", import.meta.url),
  "utf8",
).trim();

describe("DFlow sanitized transaction fixture validation", () => {
  it("extracts immutable non-executable evidence from the good unsigned fixture", () => {
    const evidence = validateSanitizedDflowTransactionFixture(
      checkedInFixture,
      fixturePolicy,
    );

    expect(checkedInFixture).toBe(buildSanitizedDflowFixture());

    expect(evidence).toMatchObject({
      fixtureOnly: true,
      executable: false,
      messageVersion: "legacy",
      recentBlockhash: FIXTURE_BLOCKHASH,
      lastValidBlockHeight: 500,
      requiredSigners: [FIXTURE_WALLET],
      inputOutflowAtomic: "1000000",
      explicitLamportTransferAtomic: "5000",
    });
    expect(evidence.unsignedMessageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.resolvedAccountListSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect("messageBytes" in evidence).toBe(false);
  });

  it("rejects malformed base64, unsupported versions, blockhash drift, and expiry", () => {
    expect(() =>
      validateSanitizedDflowTransactionFixture("%%%", fixturePolicy),
    ).toThrow(/base64/i);

    const unsupported = Buffer.from(buildSanitizedDflowFixture(), "base64");
    unsupported[65] = 0x81;
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        unsupported.toString("base64"),
        fixturePolicy,
      ),
    ).toThrow(/version|deserialize/i);

    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({ recentBlockhash: FIXTURE_ATTACKER }),
        fixturePolicy,
      ),
    ).toThrow(/blockhash/i);
    expect(() =>
      validateSanitizedDflowTransactionFixture(buildSanitizedDflowFixture(), {
        ...fixturePolicy,
        currentBlockHeight: 501,
      }),
    ).toThrow(/expired/i);
  });

  it("rejects wire payloads larger than Solana's 1232-byte transaction limit", () => {
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        Buffer.alloc(1_233).toString("base64"),
        fixturePolicy,
      ),
    ).toThrow(/1232/);
  });

  it("rejects any populated signature in the sanitized unsigned fixture", () => {
    const signed = Buffer.from(buildSanitizedDflowFixture(), "base64");
    signed[1] = 1;
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        signed.toString("base64"),
        fixturePolicy,
      ),
    ).toThrow(/unsigned/i);
  });

  it("rejects fee-payer drift, extra signers, and unapproved writable accounts", () => {
    expect(() =>
      validateSanitizedDflowTransactionFixture(buildSanitizedDflowFixture(), {
        ...fixturePolicy,
        feePayer: FIXTURE_ATTACKER,
      }),
    ).toThrow(/fee payer/i);
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({ unexpectedSigner: true }),
        fixturePolicy,
      ),
    ).toThrow(/signer/i);
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({ extraWritableAttacker: true }),
        fixturePolicy,
      ),
    ).toThrow(/writable/i);
  });

  it("requires every policy-bound destination that the fixture mutates to be writable", () => {
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({ outputDestinationWritable: false }),
        fixturePolicy,
      ),
    ).toThrow(/required writable/i);
  });

  it("resolves injected lookup tables and rejects missing or changed bindings", () => {
    const lookupFixture = buildLookupTableFixture();
    expect(() =>
      validateSanitizedDflowTransactionFixture(lookupFixture.base64, fixturePolicy),
    ).toThrow(/lookup table/i);

    const boundSha256 = hashDflowFixtureLookupTable({
      address: lookupFixture.lookupAddress,
      addresses: lookupFixture.lookupAddresses,
    });
    const evidence = validateSanitizedDflowTransactionFixture(
      lookupFixture.base64,
      fixturePolicy,
      [
        {
          address: lookupFixture.lookupAddress,
          addresses: lookupFixture.lookupAddresses,
          boundSha256,
        },
      ],
    );
    expect(evidence.lookupTableHashes).toEqual({
      [lookupFixture.lookupAddress]: boundSha256,
    });

    expect(() =>
      validateSanitizedDflowTransactionFixture(
        lookupFixture.base64,
        fixturePolicy,
        [
          {
            address: lookupFixture.lookupAddress,
            addresses: lookupFixture.lookupAddresses,
            boundSha256: "0".repeat(64),
          },
        ],
      ),
    ).toThrow(/lookup table.*changed/i);
  });

  it("rejects unknown programs, Token-2022, hidden CPI routes, and unsafe token shapes", () => {
    for (const mutation of [
      { unknownProgram: true },
      { tokenProgramId: TOKEN_2022_PROGRAM_ID },
      { tokenOpcode: 4 },
      { multisigShape: true },
    ]) {
      expect(() =>
        validateSanitizedDflowTransactionFixture(
          buildSanitizedDflowFixture(mutation),
          fixturePolicy,
        ),
      ).toThrow();
    }
  });

  it("binds the synthetic fixture compute-unit limit exactly", () => {
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({ computeUnitLimit: 199_999 }),
        fixturePolicy,
      ),
    ).toThrow(/compute-unit.*200000/i);
  });

  it("rejects mint/destination drift and every outflow above its reservation", () => {
    for (const mutation of [
      { inputMint: FIXTURE_ATTACKER },
      { outputMint: FIXTURE_ATTACKER },
      { inputDestination: FIXTURE_ATTACKER },
      { outputDestination: FIXTURE_ATTACKER },
      { amountAtomic: 1_000_001n },
      { lamports: 5_001 },
    ]) {
      expect(() =>
        validateSanitizedDflowTransactionFixture(
          buildSanitizedDflowFixture(mutation),
          fixturePolicy,
        ),
      ).toThrow();
    }
  });

  it("rejects a zero-input transfer even though it is below the reservation ceiling", () => {
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({ amountAtomic: 0n }),
        fixturePolicy,
      ),
    ).toThrow(/positive/i);
  });

  it("derives wallet-controlled token accounts instead of trusting caller aliases", () => {
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({ inputSource: FIXTURE_ATTACKER }),
        { ...fixturePolicy, inputSource: FIXTURE_ATTACKER },
      ),
    ).toThrow(/associated token/i);
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({ outputDestination: FIXTURE_ATTACKER }),
        { ...fixturePolicy, outputDestination: FIXTURE_ATTACKER },
      ),
    ).toThrow(/associated token/i);
  });

  it("rejects aliased mint and account roles even when transaction and policy agree", () => {
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({
          outputMint: FIXTURE_INPUT_MINT,
          outputDestination: FIXTURE_INPUT_SOURCE,
        }),
        {
          ...fixturePolicy,
          outputMint: FIXTURE_INPUT_MINT,
          outputDestination: FIXTURE_INPUT_SOURCE,
        },
      ),
    ).toThrow(/distinct/i);
    expect(() =>
      validateSanitizedDflowTransactionFixture(
        buildSanitizedDflowFixture({
          inputDestination: FIXTURE_INPUT_SOURCE,
        }),
        { ...fixturePolicy, inputDestination: FIXTURE_INPUT_SOURCE },
      ),
    ).toThrow(/distinct/i);
  });
});
