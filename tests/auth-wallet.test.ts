import { describe, expect, it } from "vitest";

import {
  PRIVY_MVP_CONFIG,
  summarizeEmbeddedWallets,
} from "@/components/auth/privy-auth";

describe("Privy MVP configuration", () => {
  it("delegates login methods to the dashboard and automatically creates both embedded wallets", () => {
    // Login methods come from the Privy dashboard so enabling Google there
    // requires no client change; the client must not restrict the list.
    expect(PRIVY_MVP_CONFIG).not.toHaveProperty("loginMethods");
    expect(PRIVY_MVP_CONFIG).toMatchObject({
      externalWallets: { disableAllExternalWallets: true },
      embeddedWallets: {
        ethereum: { createOnLogin: "all-users" },
        solana: { createOnLogin: "all-users" },
      },
    });
    expect(Object.isFrozen(PRIVY_MVP_CONFIG)).toBe(true);
  });
});

describe("summarizeEmbeddedWallets", () => {
  it("selects exactly one Privy embedded wallet for each required chain", () => {
    expect(
      summarizeEmbeddedWallets([
        {
          type: "wallet",
          address: "0x1111111111111111111111111111111111111111",
          chainType: "ethereum",
          walletClientType: "privy",
          connectorType: "embedded",
        },
        {
          type: "wallet",
          address: "7dHbWXmci3dT8UFYWyz2SgU8Pkj27L1KX6vD8xvQp9wC",
          chainType: "solana",
          walletClientType: "privy-v2",
          connectorType: "embedded",
        },
        {
          type: "wallet",
          address: "0x2222222222222222222222222222222222222222",
          chainType: "ethereum",
          walletClientType: "metamask",
          connectorType: "injected",
        },
      ]),
    ).toEqual({
      status: "ready",
      ethereumAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: "7dHbWXmci3dT8UFYWyz2SgU8Pkj27L1KX6vD8xvQp9wC",
    });
  });

  it("reports pending without guessing when one wallet has not been created", () => {
    expect(
      summarizeEmbeddedWallets([
        {
          type: "wallet",
          address: "0x1111111111111111111111111111111111111111",
          chainType: "ethereum",
          walletClientType: "privy",
          connectorType: "embedded",
        },
      ]),
    ).toEqual({
      status: "pending",
      ethereumAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: null,
    });
  });

  it.each([
    [
      "duplicate Ethereum wallets",
      [
        { type: "wallet", address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", walletClientType: "privy", connectorType: "embedded" },
        { type: "wallet", address: "0x2222222222222222222222222222222222222222", chainType: "ethereum", walletClientType: "privy", connectorType: "embedded" },
      ],
    ],
    [
      "malformed embedded wallet",
      [{ type: "wallet", address: "", chainType: "solana", walletClientType: "privy", connectorType: "embedded" }],
    ],
  ])("fails closed for %s", (_label, accounts) => {
    expect(summarizeEmbeddedWallets(accounts)).toEqual({
      status: "ambiguous",
      ethereumAddress: null,
      solanaAddress: null,
    });
  });
});
