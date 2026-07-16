import type { AgentId } from "@/core/types";
import { cn } from "@/lib/utils";

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

export const agentTelemetry: Record<AgentId, { code: string; trace: string; point: [number, number] }> = {
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
      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between">
        <span className="font-mono text-[0.6875rem] font-medium tracking-[0.16em] text-muted-foreground">{telemetry.code}</span>
        <span className="grid size-8 place-items-center rounded-sm border border-border bg-background/85 motion-safe:transition-[background-color,color] motion-safe:duration-150 group-hover:bg-foreground group-hover:text-background group-focus-within:bg-foreground group-focus-within:text-background">
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
        {/* The cursor is complete but parked and hidden in server HTML. */}
        <line
          data-gsap-agent-cursor
          x1="8"
          x2="8"
          y1="8"
          y2="80"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0"
          vectorEffect="non-scaling-stroke"
        />
        <circle data-gsap-node cx={telemetry.point[0]} cy={telemetry.point[1]} r="3.2" fill="currentColor" />
      </svg>
      <span className="absolute bottom-3 left-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">event trace</span>
    </div>
  );
}
