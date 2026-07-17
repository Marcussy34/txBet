import { describe, expect, it, vi } from "vitest";

import {
  deployDepositWalletCrashSafely,
  derivePinnedBeaconDepositWalletAddress,
} from "@/venues/polymarket/onboarding";

const OWNER = "0x1111111111111111111111111111111111111111";
const DEPOSIT = "0x574548bC296A44a39a7828343FC262244f37a7e5";
const TX_HASH = `0x${"22".repeat(32)}`;

describe("Polymarket deposit-wallet onboarding", () => {
  it("pins the official beacon CREATE2 derivation with a known answer", () => {
    expect(derivePinnedBeaconDepositWalletAddress(OWNER)).toBe(DEPOSIT);
    expect(() => derivePinnedBeaconDepositWalletAddress("0x1234")).toThrow(/address/i);
  });

  it("persists submit-start and locator before waiting for confirmation", async () => {
    const calls: string[] = [];
    const handle = {
      transactionHash: TX_HASH,
      transactionId: "relayer-1",
      wait: vi.fn(async () => {
        calls.push("wait");
        return { transactionHash: TX_HASH, transactionId: "relayer-1" };
      }),
    };
    const deploy = vi.fn(async () => {
      calls.push("deploy");
      return handle;
    });

    await expect(
      deployDepositWalletCrashSafely({
        ownerSignerAddress: OWNER,
        eoaSecureClient: { account: { wallet: OWNER } },
        persistSubmitStarted: async (intent) => {
          expect(intent.depositWalletAddress).toBe(DEPOSIT);
          calls.push("persist-start");
        },
        deploy,
        persistLocator: async (locator) => {
          expect(locator).toEqual({
            transactionHash: TX_HASH,
            transactionId: "relayer-1",
          });
          calls.push("persist-locator");
        },
        verifyDeployed: async (wallet) => {
          expect(wallet).toBe(DEPOSIT);
          calls.push("verify");
          return true;
        },
        persistConfirmed: async () => {
          calls.push("persist-confirmed");
        },
      }),
    ).resolves.toEqual({
      kind: "confirmed",
      depositWalletAddress: DEPOSIT,
      transactionHash: TX_HASH,
      transactionId: "relayer-1",
    });

    expect(deploy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "persist-start",
      "deploy",
      "persist-locator",
      "wait",
      "verify",
      "persist-confirmed",
    ]);
  });

  it("does not deploy when durable submit-start persistence fails", async () => {
    const deploy = vi.fn();
    await expect(
      deployDepositWalletCrashSafely({
        ownerSignerAddress: OWNER,
        eoaSecureClient: { account: { wallet: OWNER } },
        persistSubmitStarted: async () => {
          throw new Error("database unavailable");
        },
        deploy,
        persistLocator: async () => undefined,
        verifyDeployed: async () => true,
        persistConfirmed: async () => undefined,
      }),
    ).rejects.toThrow(/database unavailable/i);
    expect(deploy).not.toHaveBeenCalled();
  });

  it("returns unknown without a retry after deploy or confirmation ambiguity", async () => {
    for (const scenario of ["deploy", "wait", "verify"] as const) {
      const handle = {
        transactionHash: TX_HASH,
        transactionId: "relayer-1",
        wait: vi.fn(async () => {
          if (scenario === "wait") throw new Error("timeout with upstream body");
          return { transactionHash: TX_HASH, transactionId: "relayer-1" };
        }),
      };
      const deploy = vi.fn(async () => {
        if (scenario === "deploy") throw new Error("connection reset with upstream body");
        return handle;
      });
      const result = await deployDepositWalletCrashSafely({
        ownerSignerAddress: OWNER,
        eoaSecureClient: { account: { wallet: OWNER } },
        persistSubmitStarted: async () => undefined,
        deploy,
        persistLocator: async () => undefined,
        verifyDeployed: async () => scenario !== "verify",
        persistConfirmed: async () => undefined,
      });

      expect(result).toEqual({
        kind: "unknown",
        depositWalletAddress: DEPOSIT,
        reason: "POLYMARKET_DEPOSIT_WALLET_DEPLOYMENT_AMBIGUOUS",
      });
      expect(JSON.stringify(result)).not.toContain("upstream body");
      expect(deploy).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects a client that was not explicitly bound to the owner EOA", async () => {
    const deploy = vi.fn();
    await expect(
      deployDepositWalletCrashSafely({
        ownerSignerAddress: OWNER,
        eoaSecureClient: { account: { wallet: DEPOSIT } },
        persistSubmitStarted: async () => undefined,
        deploy,
        persistLocator: async () => undefined,
        verifyDeployed: async () => true,
        persistConfirmed: async () => undefined,
      }),
    ).rejects.toThrow(/explicit owner EOA/i);
    expect(deploy).not.toHaveBeenCalled();
  });
});
