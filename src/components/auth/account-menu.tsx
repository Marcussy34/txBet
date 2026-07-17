// No "use client" here: this renders inside privy-auth's client boundary, and
// declaring one would make Next flag the onSignOut function prop (71007).
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, LogOut, UserRound } from "lucide-react";

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
  /** Funding rail shown in the deposit picker (from the landing venue table). */
  rail: string;
  /** Which embedded wallet funds this venue. */
  chain: "EVM" | "SOL";
};

// Landing roster order; an authoritative balance adapter can populate this later.
const VENUE_BALANCES: readonly VenueBalanceRow[] = [
  { id: "polymarket", name: "Polymarket", icon: "/venues/polymarket-blue.svg", rail: "Polygon", chain: "EVM" },
  { id: "kalshi", name: "Kalshi", icon: "/venues/kalshi.svg", rail: "Solana / DFlow", chain: "SOL" },
  { id: "opinion", name: "Opinion", icon: "/venues/opinion.webp", rail: "BNB Chain", chain: "EVM" },
  { id: "predictfun", name: "Predict.fun", icon: "/venues/predictfun.svg", rail: "BNB Chain", chain: "EVM" },
  { id: "limitless", name: "Limitless", icon: "/venues/limitless.svg", rail: "Base", chain: "EVM" },
  { id: "sxbet", name: "SX Bet", icon: "/venues/sxbet.png", flatten: true, rail: "SX Network", chain: "EVM" },
  { id: "myriad", name: "Myriad", icon: "/venues/myriad.svg", rail: "BNB Chain", chain: "EVM" },
  { id: "hydromancer", name: "Hyperliquid", icon: "/venues/hyperliquid.svg", rail: "Hyperliquid", chain: "EVM" },
];

function VenueWordmark({ venue, className }: { venue: VenueBalanceRow; className?: string }) {
  return (
    <Image
      src={venue.icon}
      alt={venue.name}
      width={140}
      height={24}
      className={cn(
        "h-3.5 w-auto max-w-28 object-contain object-left",
        venue.flatten && "brightness-0 invert",
        className,
      )}
    />
  );
}

function abbreviated(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/* One chain address on its own line: abbreviated for display, but the copy
 * button always writes the FULL address to the clipboard. */
export function AddressRow({ chain, address }: { chain: string; address: string }) {
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
            <VenueWordmark venue={venue} />
            <span
              aria-label={`${venue.name} balance $0`}
              className="font-mono text-[0.625rem] uppercase tracking-[0.08em] tabular-nums text-muted-foreground"
            >
              $0
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Header balance: shows $0 until an authoritative balance adapter reports
 * real per-venue cash. */
export function HeaderBalance() {
  return (
    <div className="text-right" title="Balances load once venue adapters are live">
      <p className="font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-muted-foreground">
        Available
      </p>
      <p className="font-mono text-xs tabular-nums text-foreground">$0</p>
    </div>
  );
}

/* Deposit picker: choose a venue, then get the funding rail plus the matching
 * embedded wallet address. Actual venue transfers arrive with the adapters. */
export function DepositMenu({ wallets }: { readonly wallets: EmbeddedWalletSummary }) {
  const [venueId, setVenueId] = useState<string | null>(null);
  const venue = VENUE_BALANCES.find((row) => row.id === venueId) ?? null;
  const address =
    venue === null ? null : venue.chain === "SOL" ? wallets.solanaAddress : wallets.ethereumAddress;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setVenueId(null);
      }}
    >
      <DropdownMenuTrigger className="flex h-8 items-center border border-border bg-card px-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Deposit
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-64 min-w-64 rounded-none p-0">
        {venue === null ? (
          <div className="px-2 py-2">
            <p className="px-1 pb-2 pt-1 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground">
              Deposit to venue
            </p>
            {VENUE_BALANCES.map((row) => (
              <DropdownMenuItem
                key={row.id}
                closeOnClick={false}
                onClick={() => setVenueId(row.id)}
                className="justify-between rounded-none px-1.5 py-2"
              >
                <VenueWordmark venue={row} />
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted-foreground">
                  {row.rail}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3">
            <button
              type="button"
              onClick={() => setVenueId(null)}
              className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft aria-hidden="true" className="size-3" /> Venues
            </button>
            <div className="mt-3">
              <VenueWordmark venue={venue} className="h-4" />
            </div>
            <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground">
              rail / {venue.rail}
            </p>
            {address !== null ? (
              <div className="mt-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  Fund your embedded {venue.chain} wallet on {venue.rail}:
                </p>
                <div className="mt-2">
                  <AddressRow chain={venue.chain} address={address} />
                </div>
              </div>
            ) : (
              <p className="mt-3 font-mono text-[0.625rem] uppercase text-warning">
                Embedded wallets not ready
              </p>
            )}
            <p className="mt-3 border-t border-border pt-2 text-[0.625rem] leading-4 text-muted-foreground">
              Transfers into the venue itself go live with the balance adapters.
            </p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
      <DropdownMenuContent align="end" sideOffset={10} className="w-64 min-w-64 rounded-none p-0">
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
        {/* Profile / portfolio: replay P&L and live boundaries in one place. */}
        <div className="p-1">
          <DropdownMenuItem
            render={<Link href="/portfolio" />}
            className="rounded-none px-2 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em]"
          >
            <UserRound aria-hidden="true" className="size-3.5" />
            Portfolio
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="mx-0 my-0" />
        {/* Venue balances show $0 until an authoritative adapter observes real cash. */}
        <AccountMenuBalanceList />
        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="p-1">
          <DropdownMenuItem
            variant="destructive"
            onClick={onSignOut}
            className="rounded-none px-2 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em]"
          >
            <LogOut aria-hidden="true" className="size-3.5" />
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
