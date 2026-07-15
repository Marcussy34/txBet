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
      <rect x="1" y="1" width="46" height="46" rx="9" fill="#0B1110" stroke="#26302D" />
      <path d="M7 34H15L22 27" stroke="#66DDE7" strokeWidth="3" strokeLinecap="square" />
      <path d="M41 14H33L26 21" stroke="#B8F15A" strokeWidth="3" strokeLinecap="square" />
      <path d="M24 18L30 24L24 30L18 24L24 18Z" fill="#F8F4E8" />
      <path d="M12 40H36" stroke="#FF8A45" strokeWidth="2" strokeLinecap="square" />
      <circle cx="12" cy="40" r="2" fill="#FF8A45" />
      <circle cx="36" cy="40" r="2" fill="#FF8A45" />
    </svg>
  );
}

export function TxBetLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <TxBetMark className={compact ? "size-8" : "size-10"} />
      <div className="leading-none">
        <div className="font-heading text-[1.75rem] font-bold tracking-[-0.03em]">
          <span className="text-feed">tx</span><span className="text-foreground">Bet</span>
        </div>
        {!compact && (
          <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted-foreground">
            event-triggered arbitrage
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

const portraitColors: Record<AgentId, { background: string; shirt: string; accent: string }> = {
  "red-card": { background: "#18363A", shirt: "#66DDE7", accent: "#FF8A45" },
  injury: { background: "#302E1B", shirt: "#E2D56B", accent: "#F8F4E8" },
  "penalty-var": { background: "#26361B", shirt: "#B8F15A", accent: "#66DDE7" },
  "goal-reaction": { background: "#3A2519", shirt: "#FF8A45", accent: "#F8F4E8" },
  "corner-pressure": { background: "#222844", shirt: "#8EA6FF", accent: "#B8F15A" },
  "dangerous-free-kick": { background: "#382134", shirt: "#ED8FD6", accent: "#66DDE7" },
};

export function AgentPortrait({ agent, className }: { agent: AgentId; className?: string }) {
  const palette = portraitColors[agent];
  return (
    <div className={cn("relative overflow-hidden border border-white/10", className)}>
      <svg
        viewBox="0 0 96 96"
        role="img"
        aria-label={`${agent.replaceAll("-", " ")} agent referee profile`}
        className="size-full"
      >
        <rect width="96" height="96" fill={palette.background} />
        <path d="M0 24H96M0 48H96M0 72H96M24 0V96M48 0V96M72 0V96" stroke="#F8F4E8" strokeOpacity="0.06" />
        <circle cx="48" cy="31" r="14" fill="#D9AE8C" />
        <path d="M34 29C35 15 61 15 62 29C56 25 40 25 34 29Z" fill="#111817" />
        <path d="M29 96V69C29 55 38 48 48 48C58 48 67 55 67 69V96H29Z" fill={palette.shirt} />
        <path d="M39 50L48 63L57 50" fill="#F8F4E8" fillOpacity="0.9" />
        <path d="M48 63V96" stroke="#0B1110" strokeOpacity="0.3" strokeWidth="2" />
        <rect x="55" y="64" width="8" height="11" fill={palette.accent} />
        <path d="M36 75H60" stroke="#0B1110" strokeOpacity="0.22" strokeWidth="2" />
      </svg>
      <div className="absolute right-2 top-2 grid size-8 place-items-center border border-white/20 bg-background/75 text-foreground backdrop-blur-sm">
        <AgentGlyph agent={agent} className="size-4" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-background/85 to-transparent" />
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
