"use client";

import Link from "next/link";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import type { ReactNode } from "react";

import { usePrivyConfigured } from "@/components/auth/privy-auth";
import { TxBetMark } from "@/components/brand/txbet-brand";
import { Button } from "@/components/ui/button";

/* CONSOLE ACCESS GATE
 * The console is operator surface: identity comes first. Unauthenticated
 * visitors see the gate; Privy's modal offers whatever login methods the
 * dashboard enables. Unconfigured environments fail closed with a plain note.
 */

function GateShell({ children, note }: { children: ReactNode; note: string }) {
  return (
    <section
      aria-label="Console access"
      className="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-16 text-center"
    >
      {/* Quiet echo of the landing beam: one static hairline, no motion. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-px -translate-x-1/2 bg-foreground/10"
      />
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-3">
          <TxBetMark className="size-9" />
          <span className="font-sans text-2xl font-semibold tracking-[-0.05em]">txBet</span>
        </div>
        <div aria-hidden="true" className="my-8 h-14 w-px bg-foreground/40" />
        <div className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-primary">00 / access</div>
        <h1 className="mt-4 font-serif text-[clamp(2.6rem,6vw,4rem)] font-normal leading-[0.92] tracking-[-0.04em]">
          Identity first.
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{note}</p>
        <div className="mt-8 flex min-h-12 items-center">{children}</div>
        <Link
          href="/"
          className="mt-10 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden="true">←</span> Back to landing
        </Link>
      </div>
      <div className="absolute inset-x-0 bottom-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground/80">
        <span>privy identity</span>
        <span>embedded evm + sol wallets</span>
        <span>synthetic replay / no live money</span>
      </div>
    </section>
  );
}

function ConfiguredConsoleGate({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  // Current Privy docs route modal-opening through useLogin (callback-capable).
  const { login } = useLogin();

  if (!ready) {
    return (
      <GateShell note="Sign in to open the replay console.">
        <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
          Auth loading
        </span>
      </GateShell>
    );
  }
  if (!authenticated) {
    return (
      <GateShell note="Sign in to open the replay console. Signing in creates your embedded EVM and Solana wallets.">
        <Button
          type="button"
          onClick={() => login()}
          className="h-12 rounded-md px-8 font-mono text-xs font-semibold uppercase tracking-[0.14em]"
        >
          Sign in <span aria-hidden="true">↗</span>
        </Button>
      </GateShell>
    );
  }
  return <>{children}</>;
}

/** Hard gate: the console renders only for an authenticated Privy identity. */
export function ConsoleAccessGate({ children }: { children: ReactNode }) {
  const configured = usePrivyConfigured();

  // usePrivy is only legal under a live PrivyProvider, so the configured
  // branch lives in its own component instead of a conditional hook call.
  if (!configured) {
    return (
      <GateShell note="Authentication is not configured in this environment. Set the Privy variables in .env and restart the server.">
        <span className="border border-warning/35 bg-warning/[0.045] px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-warning">
          auth unconfigured
        </span>
      </GateShell>
    );
  }
  return <ConfiguredConsoleGate>{children}</ConfiguredConsoleGate>;
}
