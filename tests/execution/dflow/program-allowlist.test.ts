import { describe, expect, it } from "vitest";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CLASSIC_TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  SANITIZED_DFLOW_FIXTURE_PROGRAM_IDS,
  SYSTEM_PROGRAM_ID,
  assertSanitizedDflowFixtureProgram,
} from "@/execution/venues/dflow/program-allowlist";

describe("DFlow sanitized-fixture program allowlist", () => {
  it("contains only reviewed standard programs and is immutable", () => {
    expect(SANITIZED_DFLOW_FIXTURE_PROGRAM_IDS).toEqual([
      SYSTEM_PROGRAM_ID,
      COMPUTE_BUDGET_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      CLASSIC_TOKEN_PROGRAM_ID,
    ]);
    expect(Object.isFrozen(SANITIZED_DFLOW_FIXTURE_PROGRAM_IDS)).toBe(true);
  });

  it("rejects Token-2022, unknown programs, and lookalike IDs", () => {
    for (const programId of [
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "11111111111111111111111111111112",
      `${CLASSIC_TOKEN_PROGRAM_ID}x`,
    ]) {
      expect(() => assertSanitizedDflowFixtureProgram(programId)).toThrow(
        /not allowlisted/i,
      );
    }
  });
});
