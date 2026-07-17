// No "use client" here: this renders inside privy-auth's client boundary, and
// declaring one would make Next flag the onSignOut function prop (71007).
import Image from "next/image";
import { useState } from "react";
import { Check, ChevronDown, Copy, LogOut, UserRound } from "lucide-react";

import type { EmbeddedWalletSummary } from "@/components/auth/privy-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/* ACCOUNT MENU
 * Predictefy-style header dropdown: identity on top, venue balance status,
 * and sign-out at the bottom. Never infer cash from wallet creation alone.
 */

type VenueBalanceRow = {
  id: string;
  name: string;
  /** Wordmark under /public/venues (same assets as the landing roster). */
  icon: string;
  /** Flatten to white when the official mark is too dark for the carbon field. */
  flatten?: boolean;
};

// Landing roster order; an authoritative balance adapter can populate this later.
const VENUE_BALANCES: readonly VenueBalanceRow[] = [
  { id: "polymarket", name: "Polymarket", icon: "/venues/polymarket-blue.svg" },
  { id: "kalshi", name: "Kalshi", icon: "/venues/kalshi.svg" },
  { id: "opinion", name: "Opinion", icon: "/venues/opinion.webp" },
  { id: "predictfun", name: "Predict.fun", icon: "/venues/predictfun.svg" },
  { id: "limitless", name: "Limitless", icon: "/venues/limitless.svg" },
  { id: "sxbet", name: "SX Bet", icon: "/venues/sxbet.png", flatten: true },
  { id: "myriad", name: "Myriad", icon: "/venues/myriad.svg" },
  { id: "hydromancer", name: "Hyperliquid", icon: "/venues/hyperliquid.svg" },
];

function abbreviated(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/* One chain address on its own line: abbreviated for display, but the copy
 * button always writes the FULL address to the clipboard. */
function AddressRow({ chain, address }: { chain: string; address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard
      .writeText(address)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard can be denied (permissions/insecure context); stay quiet.
      });
  };

  return (
    <div className="flex items-center justify-between gap-2 font-mono text-[0.625rem] text-muted-foreground">
      <span className="truncate">
        {chain} {abbreviated(address)}
      </span>
      <button
        type="button"
        aria-label={`Copy ${chain} address`}
        onClick={copy}
        className="-my-1 flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-3 text-success" />
        ) : (
          <Copy aria-hidden="true" className="size-3" />
        )}
      </button>
    </div>
  );
}

export function AccountMenuBalanceList() {
  return (
    <div className="px-3 py-3">
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground">
        Available cash
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {VENUE_BALANCES.map((venue) => (
          <li key={venue.id} className="flex items-center justify-between gap-3">
            <Image
              src={venue.icon}
              alt={venue.name}
              width={140}
              height={24}
              className={cn(
                "h-3.5 w-auto max-w-28 object-contain object-left",
                venue.flatten && "brightness-0 invert",
              )}
            />
            <span
              aria-label={`${venue.name} balance not loaded`}
              className="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground"
            >
              Not loaded
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccountMenu({
  email,
  wallets,
  onSignOut,
}: {
  readonly email: string | null;
  readonly wallets: EmbeddedWalletSummary;
  readonly onSignOut: () => void;
}) {
  const trimmedEmail = email?.trim() ?? "";
  const initial = trimmedEmail.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex size-9 items-center justify-center rounded-full border border-border bg-card font-mono text-sm text-foreground">
          {initial !== "" ? initial : <UserRound aria-hidden="true" className="size-4" />}
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-64 min-w-64 p-0">
        {/* Identity: email plus the embedded wallet pair. */}
        <div className="px-3 py-3">
          <p className="truncate text-xs font-medium text-foreground">
            {trimmedEmail !== "" ? trimmedEmail : "Signed in"}
          </p>
          {wallets.status === "ready" ? (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <AddressRow chain="EVM" address={wallets.ethereumAddress} />
              <AddressRow chain="SOL" address={wallets.solanaAddress} />
            </div>
          ) : (
            <p className="mt-1 font-mono text-[0.625rem] uppercase text-warning">
              {wallets.status === "pending" ? "Creating embedded wallets" : "Wallet identity ambiguous"}
            </p>
          )}
        </div>
        <DropdownMenuSeparator className="mx-0 my-0" />
        {/* A venue balance is unavailable until an authoritative adapter observes it. */}
        <AccountMenuBalanceList />
        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="p-1">
          <DropdownMenuItem variant="destructive" onClick={onSignOut} className="px-2 py-1.5">
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
