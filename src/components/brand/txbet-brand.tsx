import type { AgentId } from "@/core/types";
import { cn } from "@/lib/utils";

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

export function AgentGlyph({
  agent,
  className,
}: {
  agent: AgentId;
  className?: string;
}) {
  const common = {
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-5", className)} fill="none">
      {agent === "red-card" && (
        <>
          <path d="M7 5L16 3L18 17L9 19L7 5Z" {...common} />
          <path d="M5 21L20 21" {...common} />
        </>
      )}
      {agent === "injury" && (
        <>
          <path d="M12 3V21M3 12H21" {...common} />
          <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        </>
      )}
      {agent === "penalty-var" && (
        <>
          <rect x="3" y="5" width="18" height="13" {...common} />
          <path d="M8 9L12 13L17 8" {...common} />
          <path d="M12 18V22" {...common} />
        </>
      )}
      {agent === "goal-reaction" && (
        <>
          <path d="M4 20V8H20V20" {...common} />
          <path d="M8 20V12H16V20" {...common} />
          <path d="M12 3L14 6L12 9L10 6L12 3Z" fill="currentColor" />
        </>
      )}
      {agent === "corner-pressure" && (
        <>
          <path d="M5 21V3M5 5H14L11 9H5" {...common} />
          <path d="M9 17H13L15 14H19" {...common} />
          <path d="M10 21H20" {...common} />
        </>
      )}
      {agent === "dangerous-free-kick" && (
        <>
          <path d="M4 20C7 12 10 8 20 5" {...common} />
          <path d="M15 5H20V10" {...common} />
          <circle cx="7" cy="17" r="2.5" {...common} />
        </>
      )}
    </svg>
  );
}

const agentTelemetry: Record<AgentId, { code: string; trace: string; point: [number, number] }> = {
  "red-card": { code: "A01", trace: "M8 68H40V52H66V24H92V52H120V42H152", point: [152, 42] },
  injury: { code: "A02", trace: "M8 54H34L48 30L62 72L78 44L94 54H152", point: [152, 54] },
  "penalty-var": { code: "A03", trace: "M8 62H42V34H72V62H102V28H132V62H152", point: [152, 62] },
  "goal-reaction": { code: "A04", trace: "M8 68H34V58H58V22H84V58H110V46H152", point: [152, 46] },
  "corner-pressure": { code: "A05", trace: "M8 72H32V62H56V50H80V38H104V26H128V14H152", point: [152, 14] },
  "dangerous-free-kick": { code: "A06", trace: "M8 68C38 68 48 38 76 38S112 18 152 18", point: [152, 18] },
};

export function AgentTelemetry({ agent, className }: { agent: AgentId; className?: string }) {
  const telemetry = agentTelemetry[agent];
  return (
    <div className={cn("relative overflow-hidden border border-border bg-card text-foreground", className)}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground),transparent_95%)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--foreground),transparent_95%)_1px,transparent_1px)] bg-[size:24px_24px]"
      />
      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between">
        <span className="font-mono text-[0.6875rem] font-medium tracking-[0.16em] text-muted-foreground">{telemetry.code}</span>
        <span className="grid size-8 place-items-center rounded-sm border border-border bg-background/85">
          <AgentGlyph agent={agent} className="size-4" />
        </span>
      </div>
      <svg
        data-gsap-asset="agent-telemetry"
        viewBox="0 0 160 88"
        role="img"
        aria-label={`${agent.replaceAll("-", " ")} trigger telemetry`}
        className="absolute inset-x-3 bottom-4 h-[58%] w-[calc(100%-1.5rem)]"
        fill="none"
      >
        <path d="M8 20H152M8 44H152M8 68H152" stroke="currentColor" strokeOpacity="0.10" />
        <path d="M40 8V80M80 8V80M120 8V80" stroke="currentColor" strokeOpacity="0.08" />
        <path data-gsap-draw d={telemetry.trace} stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" />
        <circle data-gsap-node cx={telemetry.point[0]} cy={telemetry.point[1]} r="3.2" fill="currentColor" />
      </svg>
      <span className="absolute bottom-3 left-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">event trace</span>
    </div>
  );
}

export function QuoteWindowGraphic({ className }: { className?: string }) {
  return (
    <svg
      data-gsap-asset="quote-window"
      viewBox="0 0 960 280"
      role="img"
      aria-labelledby="quote-window-title quote-window-description"
      className={cn("w-full text-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="quote-window-title">Quote convergence window</title>
      <desc id="quote-window-description">
        Two synthetic venue quotes converge after a match event, leaving a brief modeled execution window before the pair normalizes.
      </desc>

      <path d="M56 52H904M56 140H904M56 228H904" stroke="currentColor" strokeOpacity="0.10" />
      <path d="M120 28V252M480 28V252M840 28V252" stroke="currentColor" strokeOpacity="0.08" />
      <rect x="466" y="28" width="28" height="224" fill="currentColor" fillOpacity="0.055" />
      <path d="M466 54H450V226H466M494 54H510V226H494" stroke="currentColor" strokeOpacity="0.32" strokeWidth="2" />

      <path
        data-gsap-draw
        d="M56 72C176 72 230 82 330 96C404 106 442 116 480 132C574 128 694 126 904 126"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
      <path
        data-gsap-draw
        d="M56 210C176 210 244 196 338 180C402 169 448 150 480 132C574 136 696 138 904 138"
        stroke="currentColor"
        strokeOpacity="0.58"
        strokeWidth="3"
        strokeLinecap="square"
      />

      <g data-gsap-node>
        <rect x="46" y="62" width="20" height="20" fill="currentColor" />
        <circle cx="56" cy="210" r="10" stroke="currentColor" strokeWidth="3" />
      </g>
      <g data-gsap-node>
        <circle cx="480" cy="132" r="10" fill="currentColor" />
        <circle cx="480" cy="132" r="20" stroke="currentColor" strokeOpacity="0.24" />
      </g>
      <g data-gsap-node>
        <rect x="894" y="116" width="20" height="20" fill="currentColor" />
        <circle cx="904" cy="138" r="10" stroke="currentColor" strokeWidth="3" />
      </g>

      <g className="hidden sm:block" fill="currentColor" fontFamily="var(--font-data)" fontSize="14" letterSpacing="1.8">
        <text x="56" y="34">EVENT / T+0</text>
        <text x="410" y="272">CAPTURE WINDOW</text>
        <text x="740" y="34">PAIR NORMALIZED</text>
      </g>
      <g className="sm:hidden" fill="currentColor" fontFamily="var(--font-data)" fontSize="32" letterSpacing="1.8">
        <text x="56" y="34">T+0</text>
        <text x="386" y="272">CAPTURE</text>
        <text x="700" y="34">SETTLED</text>
      </g>
    </svg>
  );
}

export function LatencyCorridor({ className }: { className?: string }) {
  return (
    <svg
      data-gsap-asset="latency-corridor"
      viewBox="0 0 720 240"
      role="img"
      aria-labelledby="latency-corridor-title latency-corridor-description"
      className={cn("w-full text-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="latency-corridor-title">Latency Corridor</title>
      <desc id="latency-corridor-description">A TxLINE-format event at T plus zero precedes three staggered synthetic venue repricing moments.</desc>
      <path d="M54 48H676M54 96H676M54 144H676M54 192H676" stroke="currentColor" strokeOpacity="0.12" />
      <path d="M150 30V210" stroke="currentColor" strokeWidth="2" />
      <path d="M310 72V120M430 120V168M560 168V216" stroke="currentColor" strokeWidth="2" strokeOpacity="0.55" />
      <path data-gsap-draw d="M150 48H310V96H430V144H560V192H676" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <rect data-gsap-node x="139" y="37" width="22" height="22" fill="currentColor" />
      <circle data-gsap-node cx="310" cy="96" r="7" fill="currentColor" />
      <circle data-gsap-node cx="430" cy="144" r="7" fill="currentColor" />
      <circle data-gsap-node cx="560" cy="192" r="7" fill="currentColor" />
      <g className="hidden sm:block" fill="currentColor" fontFamily="var(--font-data)" fontSize="18" letterSpacing="1.4">
        <text x="54" y="22">TXLINE EVENT</text>
        <text x="139" y="232">T+0</text>
        <text x="286" y="64">VENUE 01</text>
        <text x="406" y="112">VENUE 02</text>
        <text x="536" y="160">VENUE 03</text>
      </g>
      <g className="sm:hidden" fill="currentColor" fontFamily="var(--font-data)" fontSize="32" letterSpacing="1.4">
        <text x="54" y="30">EVENT</text>
        <text x="139" y="232">T+0</text>
        <text x="286" y="68">V01</text>
        <text x="406" y="116">V02</text>
        <text x="536" y="164">V03</text>
      </g>
    </svg>
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
