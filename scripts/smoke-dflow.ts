import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { runDflowShadowSmoke } from "../src/execution/venues/dflow/smoke";

interface DflowSmokeIo {
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

export interface DflowSmokeCliInput {
  readonly argv?: readonly string[];
  readonly fixture?: unknown;
  readonly io?: DflowSmokeIo;
}

function readSanitizedFixture(): unknown {
  return JSON.parse(
    readFileSync(
      new URL("../tests/fixtures/dflow/order-response.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

/** Runs entirely offline and rejects every CLI-supplied value. */
export function runDflowSmokeCli(input: DflowSmokeCliInput = {}): number {
  const argv = input.argv ?? process.argv.slice(2);
  const io = input.io ?? console;
  if (argv.length !== 0) {
    io.error("DFlow shadow smoke accepts no arguments and never uses a wallet.");
    return 1;
  }

  try {
    const result = runDflowShadowSmoke(input.fixture ?? readSanitizedFixture());
    io.log(JSON.stringify(result, null, 2));
    return 0;
  } catch {
    // Do not surface fixture content or environment values on failure.
    io.error("DFlow offline shadow smoke failed.");
    return 1;
  }
}

const isEntryPoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntryPoint) {
  process.exitCode = runDflowSmokeCli();
}
