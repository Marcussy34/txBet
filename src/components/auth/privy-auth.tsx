"use client";

import bs58 from "bs58";
import { LogIn, LogOut, WalletCards } from "lucide-react";
import {
  PrivyProvider,
  usePrivy,
  type PrivyProviderProps,
} from "@privy-io/react-auth";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { isAddress } from "viem";

import { Button } from "@/components/ui/button";

export const PRIVY_MVP_CONFIG = Object.freeze({
  // No loginMethods override: the modal offers whatever the Privy dashboard
  // enables (email + wallet today; Google appears once enabled there).
  appearance: {
    theme: "dark",
    accentColor: "#63E6BE",
    landingHeader: "Sign in to txBet",
    loginMessage: "Signing in creates your embedded EVM and Solana wallets.",
    showWalletLoginFirst: false,
  },
  externalWallets: {
    disableAllExternalWallets: true,
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "all-users" },
    solana: { createOnLogin: "all-users" },
    showWalletUIs: false,
  },
} satisfies NonNullable<PrivyProviderProps["config"]>);

export type EmbeddedWalletSummary = Readonly<
  | {
      status: "ready";
      ethereumAddress: string;
      solanaAddress: string;
    }
  | {
      status: "pending";
      ethereumAddress: string | null;
      solanaAddress: string | null;
    }
  | {
      status: "ambiguous";
      ethereumAddress: null;
      solanaAddress: null;
    }
>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSolanaAddress(value: string): boolean {
  try {
    return bs58.decode(value).byteLength === 32;
  } catch {
    return false;
  }
}

/** Selects only unambiguous Privy-created wallets from the user account. */
export function summarizeEmbeddedWallets(
  linkedAccounts: readonly unknown[],
): EmbeddedWalletSummary {
  const byChain: Record<"ethereum" | "solana", string[]> = {
    ethereum: [],
    solana: [],
  };

  for (const account of linkedAccounts) {
    if (!isRecord(account) || account.type !== "wallet") continue;
    const isPrivyWallet =
      (account.walletClientType === "privy" ||
        account.walletClientType === "privy-v2") &&
      account.connectorType === "embedded";
    if (!isPrivyWallet) continue;

    if (account.chainType !== "ethereum" && account.chainType !== "solana") {
      return Object.freeze({
        status: "ambiguous",
        ethereumAddress: null,
        solanaAddress: null,
      });
    }
    if (typeof account.address !== "string") {
      return Object.freeze({
        status: "ambiguous",
        ethereumAddress: null,
        solanaAddress: null,
      });
    }
    const valid =
      account.chainType === "ethereum"
        ? isAddress(account.address, { strict: false })
        : isSolanaAddress(account.address);
    if (!valid) {
      return Object.freeze({
        status: "ambiguous",
        ethereumAddress: null,
        solanaAddress: null,
      });
    }
    byChain[account.chainType].push(account.address);
  }

  if (byChain.ethereum.length > 1 || byChain.solana.length > 1) {
    return Object.freeze({
      status: "ambiguous",
      ethereumAddress: null,
      solanaAddress: null,
    });
  }
  const ethereumAddress = byChain.ethereum[0] ?? null;
  const solanaAddress = byChain.solana[0] ?? null;
  if (ethereumAddress !== null && solanaAddress !== null) {
    return Object.freeze({ status: "ready", ethereumAddress, solanaAddress });
  }
  return Object.freeze({ status: "pending", ethereumAddress, solanaAddress });
}

const PrivyConfiguredContext = createContext(false);

/** True when a Privy app ID is configured and the provider is live. */
export function usePrivyConfigured(): boolean {
  return useContext(PrivyConfiguredContext);
}

export function TxBetPrivyProvider({
  appId,
  nonce,
  children,
}: {
  readonly appId: string;
  readonly nonce?: string;
  readonly children: ReactNode;
}) {
  if (appId.trim().length === 0) {
    return (
      <PrivyConfiguredContext.Provider value={false}>
        {children}
      </PrivyConfiguredContext.Provider>
    );
  }

  return (
    <PrivyConfiguredContext.Provider value>
      <PrivyProvider
        appId={appId}
        config={{ ...PRIVY_MVP_CONFIG, scriptNonce: nonce }}
      >
        {children}
      </PrivyProvider>
    </PrivyConfiguredContext.Provider>
  );
}

function abbreviated(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ConfiguredAuthWalletControl() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  if (!ready) {
    return (
      <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
        Auth loading
      </span>
    );
  }
  if (!authenticated || user === null) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => login()}
      >
        <LogIn aria-hidden="true" />
        Sign in
      </Button>
    );
  }

  const wallets = summarizeEmbeddedWallets(user.linkedAccounts);
  return (
    <div className="flex items-center gap-2">
      <div className="hidden min-w-0 text-right lg:block">
        <p className="truncate text-xs font-medium text-foreground">
          {user.google?.email ?? user.email?.address ?? "Signed in"}
        </p>
        {wallets.status === "ready" ? (
          <p className="font-mono text-[0.625rem] text-muted-foreground">
            EVM {abbreviated(wallets.ethereumAddress)} · SOL {abbreviated(wallets.solanaAddress)}
          </p>
        ) : (
          <p className="font-mono text-[0.625rem] uppercase text-warning">
            {wallets.status === "pending"
              ? "Creating embedded wallets"
              : "Wallet identity ambiguous"}
          </p>
        )}
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Sign out of txBet"
        onClick={() => void logout()}
      >
        <LogOut aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Login and public-address display only. It exposes no generic signing action. */
export function AuthWalletControl() {
  const configured = useContext(PrivyConfiguredContext);
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
        <WalletCards aria-hidden="true" className="size-3.5" />
        Auth unconfigured
      </span>
    );
  }
  return <ConfiguredAuthWalletControl />;
}
