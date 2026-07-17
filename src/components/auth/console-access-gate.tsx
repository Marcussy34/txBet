"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import type { ReactNode } from "react";

import { usePrivyConfigured } from "@/components/auth/privy-auth";
import { TxBetMark } from "@/components/brand/txbet-brand";
import { Button } from "@/components/ui/button";

/* CONSOLE ACCESS GATE
 * The console is operator surface: identity comes first. The gate is
 * deliberately minimal — logo and a single sign-in action, no copy. Privy's
 * modal offers whatever login methods the dashboard enables. Unconfigured
 * environments fail closed with a plain note.
 */

function GateShell({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Console access"
      className="flex min-h-svh flex-col items-center justify-center gap-12 px-4 text-center"
    >
      <div className="flex items-center gap-3">
        <TxBetMark className="size-9" />
        <span className="font-sans text-2xl font-semibold tracking-[-0.05em]">txBet</span>
      </div>
      {children}
    </section>
  );
}

function ConfiguredConsoleGate({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  // Current Privy docs route modal-opening through useLogin (callback-capable).
  const { login } = useLogin();

  if (!authenticated) {
    return (
      <GateShell>
        {/* Disabled-until-ready keeps the layout stable while Privy boots. */}
        <Button
          type="button"
          disabled={!ready}
          onClick={() => login()}
          className="h-12 w-full max-w-xs rounded-full font-mono text-xs font-semibold uppercase tracking-[0.14em]"
        >
          Sign in
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
      <GateShell>
        <span className="border border-warning/35 bg-warning/[0.045] px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-warning">
          auth unconfigured
        </span>
      </GateShell>
    );
  }
  return <ConfiguredConsoleGate>{children}</ConfiguredConsoleGate>;
}
