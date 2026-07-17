"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { usePrivyConfigured } from "@/components/auth/privy-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { dollarsToMicros, formatUsd } from "@/core/money";
import type { VercelExecutionControlView } from "@/server/execution/vercel-control";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isControlView(value: unknown): value is VercelExecutionControlView {
  return isRecord(value) &&
    value.schemaVersion === "txbet-vercel-control-view-v1" &&
    typeof value.version === "number" &&
    (value.requestedMode === "disabled" ||
      value.requestedMode === "shadow" ||
      value.requestedMode === "canary") &&
    (value.effectiveAgentMode === "disabled" ||
      value.effectiveAgentMode === "shadow") &&
    typeof value.maxTotalMicros === "number" &&
    isRecord(value.pairedExecution) &&
    value.pairedExecution.executable === false;
}

function singleValue(value: number | readonly number[], fallback: number): number {
  return typeof value === "number" ? value : value[0] ?? fallback;
}

export function formatControlExpiry(expiresAtMs: number | null): string {
  if (expiresAtMs === null) return "not armed";
  return `${new Date(expiresAtMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function ExecutionControlStatus(
  { control }: { control: VercelExecutionControlView },
) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border font-mono text-[0.6875rem] uppercase tracking-[0.08em]">
      <div className="bg-background/90 px-3 py-2 text-muted-foreground">requested</div>
      <div className="bg-background/90 px-3 py-2 text-right text-foreground">
        {control.requestedMode}
      </div>
      <div className="bg-background/90 px-3 py-2 text-muted-foreground">effective</div>
      <div className="bg-background/90 px-3 py-2 text-right text-warning">
        {control.effectiveAgentMode}
      </div>
      <div className="bg-background/90 px-3 py-2 text-muted-foreground">current maximum</div>
      <div className="bg-background/90 px-3 py-2 text-right text-foreground">
        {formatUsd(control.maxTotalMicros)}
      </div>
      <div className="bg-background/90 px-3 py-2 text-muted-foreground">current expiry</div>
      <div className="bg-background/90 px-3 py-2 text-right text-foreground">
        {formatControlExpiry(control.expiresAtMs)}
      </div>
      <div className="bg-background/90 px-3 py-2 text-muted-foreground">manual DFlow</div>
      <div className="bg-background/90 px-3 py-2 text-right text-foreground">
        {control.kalshiDflow.manualExactInputCanary.authorized ? "authorized" : "not armed"}
      </div>
    </div>
  );
}

function ConfiguredExecutionControlPanel() {
  const { getAccessToken } = usePrivy();
  const [control, setControl] = useState<VercelExecutionControlView | null>(null);
  const [amountMicros, setAmountMicros] = useState(1_000_000);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (
    method: "GET" | "PUT",
    body?: unknown,
  ): Promise<VercelExecutionControlView> => {
    const accessToken = await getAccessToken();
    if (accessToken === null) throw new Error("Privy session unavailable");
    const response = await fetch("/api/execution/control", {
      method,
      cache: "no-store",
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(method === "PUT"
          ? {
              "content-type": "application/json",
              "idempotency-key": window.crypto.randomUUID(),
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as unknown;
    if (
      !response.ok ||
      !isRecord(result) ||
      result.ok !== true ||
      !isControlView(result.control)
    ) {
      throw new Error("Execution control request failed");
    }
    return result.control;
  }, [getAccessToken]);

  useEffect(() => {
    let active = true;
    void request("GET")
      .then((next) => {
        if (!active) return;
        setError(null);
        setControl(next);
        if (next.maxTotalMicros > 0) setAmountMicros(next.maxTotalMicros);
      })
      .catch(() => {
        if (active) setError("Control unavailable");
      });
    return () => {
      active = false;
    };
  }, [request]);

  async function update(mode: "disabled" | "shadow" | "canary") {
    if (control === null) return;
    setBusy(true);
    setError(null);
    try {
      const disabled = mode === "disabled";
      const next = await request("PUT", {
        expectedVersion: control.version,
        mode,
        maxTotalMicros: disabled ? 0 : amountMicros,
        expiresAtMs: disabled ? null : Date.now() + 24 * 60 * 60 * 1_000,
        confirmRealMoney: mode === "canary" && confirmed,
      });
      setControl(next);
      if (next.maxTotalMicros > 0) setAmountMicros(next.maxTotalMicros);
      setConfirmed(false);
    } catch {
      setError("Update rejected; reload the current control");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col border border-border bg-background/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-primary">
            Agent arming
          </p>
          <p className="mt-1 text-xs text-muted-foreground">World Cup only · versioned grant</p>
        </div>
        <ShieldAlert aria-hidden="true" className="size-4 text-warning" />
      </div>

      <div className="mt-3">
        {control === null ? (
          <p className="text-xs text-muted-foreground">{error ?? "Loading control…"}</p>
        ) : (
          <ExecutionControlStatus control={control} />
        )}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Next 24-hour grant maximum</span>
          <span className="font-mono text-foreground">{formatUsd(amountMicros)}</span>
        </div>
        <Slider
          aria-label="Maximum total dollars"
          min={1}
          max={10}
          step={1}
          value={[amountMicros / 1_000_000]}
          onValueChange={(value) =>
            setAmountMicros(dollarsToMicros(singleValue(value, 1)))}
          disabled={busy}
        />
      </div>

      <label className="mt-4 flex items-start gap-2 text-[0.6875rem] leading-5 text-muted-foreground">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(value) => setConfirmed(value === true)}
          disabled={busy}
          className="mt-0.5"
        />
        I understand canary requests involve real money, but this build still forces the paired agent to shadow.
      </label>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button size="sm" variant="outline" disabled={busy || control === null} onClick={() => void update("disabled")}>
          Disable
        </Button>
        <Button size="sm" variant="outline" disabled={busy || control === null} onClick={() => void update("shadow")}>
          Shadow
        </Button>
        <Button size="sm" variant="outline" disabled={busy || control === null || !confirmed} onClick={() => void update("canary")}>
          Canary
        </Button>
      </div>
      {error !== null && control !== null ? (
        <p className="mt-2 text-[0.6875rem] text-danger">{error}</p>
      ) : null}
      <p className="mt-3 text-[0.6875rem] leading-5 text-warning">
        Manual DFlow exact-input canaries can use this grant. The paired agent stays shadow-only because exact output is not guaranteed.
      </p>
    </div>
  );
}

/** Authenticated control for the single-deployment Vercel MVP. */
export function ExecutionControlPanel() {
  const configured = usePrivyConfigured();
  if (!configured) {
    return (
      <div className="flex min-h-full flex-col border border-border bg-background/70 p-3">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-primary">
          Agent arming
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Sign in with configured Privy auth to load the versioned execution control.
        </p>
        <p className="mt-auto pt-4 font-mono text-[0.6875rem] uppercase text-warning">
          fail closed / shadow only
        </p>
      </div>
    );
  }
  return <ConfiguredExecutionControlPanel />;
}
