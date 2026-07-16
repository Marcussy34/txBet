import { cn } from "@/lib/utils";

export { AgentGlyph, AgentTelemetry, agentTelemetry } from "./graphics/agent-telemetry";
export { EventEdgeRoute } from "./graphics/event-edge-route";
export {
  ExecutionProtocolGraphic,
  ExecutionProtocolMobileGraphic,
} from "./graphics/execution-protocol";
export { LatencyCorridor } from "./graphics/latency-corridor";
export { QuoteWindowGraphic } from "./graphics/quote-window";

export function TxBetMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="txBet"
      className={cn("size-10", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 11H15L21 21M5 37H15L21 27M27 21L33 11H43M27 27L33 37H43"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path d="M21 16V32M27 16V32" stroke="currentColor" strokeWidth="3.2" />
    </svg>
  );
}
export function TxBetLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <TxBetMark className={compact ? "size-8" : "size-10"} />
      <div className="leading-none">
        <div className="font-sans text-[1.55rem] font-semibold tracking-[-0.045em] text-foreground">txBet</div>
        {!compact && (
          <div className="mt-1 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground">
            Event-driven trading infrastructure
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusGlyph({
  state,
  className,
}: {
  state: "feed" | "scan" | "locked" | "blocked" | "risk";
  className?: string;
}) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("size-4", className)} fill="none">
      {state === "feed" && <path d="M2 14H7V9H12V5H18" stroke="currentColor" strokeWidth="2" />}
      {state === "scan" && <><circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.8" /><path d="M13 13L18 18" stroke="currentColor" strokeWidth="1.8" /></>}
      {state === "locked" && <><path d="M3 13H7L10 10L13 13H17" stroke="currentColor" strokeWidth="1.8" /><path d="M10 5L14 9L10 13L6 9L10 5Z" fill="currentColor" /></>}
      {state === "blocked" && <><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M5 15L15 5" stroke="currentColor" strokeWidth="1.8" /></>}
      {state === "risk" && <><path d="M10 2L18 17H2L10 2Z" stroke="currentColor" strokeWidth="1.8" /><path d="M10 7V12M10 15V15.1" stroke="currentColor" strokeWidth="2" /></>}
    </svg>
  );
}
