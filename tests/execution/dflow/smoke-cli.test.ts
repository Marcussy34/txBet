import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { runDflowSmokeCli } from "../../../scripts/smoke-dflow";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../fixtures/dflow/order-response.json", import.meta.url),
    "utf8",
  ),
) as unknown;

describe("DFlow shadow smoke CLI", () => {
  it("prints only the offline shadow result", () => {
    const log = vi.fn();
    const error = vi.fn();

    expect(runDflowSmokeCli({ argv: [], fixture, io: { log, error } })).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      ok: true,
      shadowOnly: true,
      liveReady: false,
    });
  });

  it("rejects every argument, including wallet and transaction inputs", () => {
    const log = vi.fn();
    const error = vi.fn();

    for (const argv of [
      ["--wallet", "fake"],
      ["--transaction", "fake"],
      ["--user-public-key", "fake"],
    ]) {
      expect(runDflowSmokeCli({ argv, fixture, io: { log, error } })).toBe(1);
    }
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "DFlow shadow smoke accepts no arguments and never uses a wallet.",
    );
  });
});
