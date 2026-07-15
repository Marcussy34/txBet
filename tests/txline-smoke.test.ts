import { describe, expect, it, vi } from "vitest";
import {
  runTxLineSmoke,
  runTxLineSmokeCli,
  type TxLineSmokeDependencies,
} from "../scripts/smoke-txline";

const fixture = {
  baseUrl: "https://txline.example",
  fixtureId: "fixture-123",
  apiToken: "do-not-print-this-token",
  seconds: 1,
};

function dependencies(
  openScoreStream: TxLineSmokeDependencies["openScoreStream"],
  delay: TxLineSmokeDependencies["delay"] = async () => {},
): TxLineSmokeDependencies {
  return {
    delay,
    fetchScoreSnapshot: async () => [],
    openScoreStream,
    startGuestSession: async () => "guest-jwt",
  };
}

describe("TxLINE smoke runner", () => {
  it("fails when the stream never opens and always closes the source", async () => {
    const close = vi.fn();

    await expect(runTxLineSmoke(fixture, dependencies(() => ({ close })))).rejects.toThrow(
      "TxLINE stream never opened within 1 second.",
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("fails immediately when the stream connection errors", async () => {
    const close = vi.fn();
    const never = () => new Promise<void>(() => {});
    const openScoreStream: TxLineSmokeDependencies["openScoreStream"] = (input) => {
      queueMicrotask(() => input.onError?.(new Error("contains internal details")));
      return { close };
    };

    await expect(
      runTxLineSmoke(fixture, dependencies(openScoreStream, never)),
    ).rejects.toThrow("TxLINE stream connection failed before opening.");
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns a summary after an opened stream observation window", async () => {
    const close = vi.fn();
    const openScoreStream: TxLineSmokeDependencies["openScoreStream"] = (input) => {
      input.onOpen?.();
      input.onPayload({
        Action: "Red Card",
        Confirmed: true,
        FixtureId: fixture.fixtureId,
        MessageId: "message-1",
      });
      return { close };
    };

    await expect(runTxLineSmoke(fixture, dependencies(openScoreStream))).resolves.toMatchObject({
      fixtureId: fixture.fixtureId,
      streamOpened: true,
      streamMessages: 1,
      normalizedMessages: 1,
      lastAction: "red_card",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns a nonzero CLI result with a concise credential-safe error", async () => {
    const errors: string[] = [];
    const close = vi.fn();
    const openScoreStream: TxLineSmokeDependencies["openScoreStream"] = (input) => {
      queueMicrotask(() => input.onError?.(new Error(fixture.apiToken)));
      return { close };
    };

    const exitCode = await runTxLineSmokeCli({
      argv: ["--fixture", fixture.fixtureId, "--seconds", "1"],
      dependencies: dependencies(openScoreStream, () => new Promise<void>(() => {})),
      env: {
        TXLINE_API_TOKEN: fixture.apiToken,
        TXLINE_BASE_URL: fixture.baseUrl,
      },
      io: {
        error: (message) => errors.push(message),
        log: vi.fn(),
      },
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual(["TxLINE stream connection failed before opening."]);
    expect(errors.join(" ")).not.toContain(fixture.apiToken);
  });
});
