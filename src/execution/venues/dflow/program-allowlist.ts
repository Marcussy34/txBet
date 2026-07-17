export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const COMPUTE_BUDGET_PROGRAM_ID =
  "ComputeBudget111111111111111111111111111111";
export const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const CLASSIC_TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * Only standard programs needed by the txBet-owned offline fixture are accepted.
 * No DFlow routing program is claimed while the official program contract is absent.
 */
export const SANITIZED_DFLOW_FIXTURE_PROGRAM_IDS = Object.freeze([
  SYSTEM_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CLASSIC_TOKEN_PROGRAM_ID,
] as const);

export type SanitizedDflowFixtureProgramId =
  (typeof SANITIZED_DFLOW_FIXTURE_PROGRAM_IDS)[number];

export function assertSanitizedDflowFixtureProgram(
  programId: string,
): asserts programId is SanitizedDflowFixtureProgramId {
  if (
    !(SANITIZED_DFLOW_FIXTURE_PROGRAM_IDS as readonly string[]).includes(
      programId,
    )
  ) {
    throw new Error(`DFlow sanitized-fixture program is not allowlisted: ${programId}`);
  }
}
