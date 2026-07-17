import { cn } from "@/lib/utils";

type GateProps = {
  code: "01" | "02" | "03" | "04";
  x: number;
  label: string;
  chipX: number;
  chipWidth: number;
};

function DesktopGate({ code, x, label, chipX, chipWidth }: GateProps) {
  return (
    <g data-gsap-stage={code === "01" ? "wake" : code === "02" ? "verify" : code === "03" ? "pair" : "guard"} data-gsap-gate={code}>
      <text x={x - 11} y="54" fill="currentColor" fontFamily="var(--font-data)" fontSize="14" letterSpacing="1.7">
        {code}
      </text>
      {/* Open in server HTML; the loop closes each pair before the packet arrives. */}
      <g data-gsap-gate-slab="left">
        <rect x={x - 17} y="103" width="10" height="54" fill="currentColor" />
        <path d={`M${x - 14} 115H${x - 7}M${x - 14} 145H${x - 7}`} stroke="var(--background)" strokeWidth="2" />
      </g>
      <g data-gsap-gate-slab="right">
        <rect x={x + 7} y="103" width="10" height="54" fill="currentColor" />
        <path d={`M${x + 7} 122H${x + 14}M${x + 7} 138H${x + 14}`} stroke="var(--background)" strokeWidth="2" />
      </g>
      <path d={`M${x - 28} 94V166M${x + 28} 94V166`} stroke="currentColor" strokeOpacity="0.14" />
      <g data-gsap-gate-chip className="text-success">
        {/* Solid backing keeps the grid columns from striking through chip text. */}
        <rect x={chipX} y="202" width={chipWidth} height="30" fill="var(--background)" />
        <rect x={chipX} y="202" width={chipWidth} height="30" fill="currentColor" fillOpacity="0.1" stroke="currentColor" />
        <text x={chipX + 10} y="222" fill="currentColor" fontFamily="var(--font-data)" fontSize="12" letterSpacing="1.15">
          {label}
        </text>
      </g>
    </g>
  );
}

export function ExecutionProtocolGraphic({ className }: { className?: string }) {
  return (
    <svg
      data-gsap-asset="execution-protocol"
      data-gsap-protocol-view
      viewBox="0 0 1120 340"
      role="img"
      aria-labelledby="execution-protocol-title execution-protocol-description"
      className={cn("w-full text-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="execution-protocol-title">Execution protocol route — gate interlock</title>
      <desc id="execution-protocol-description">
        Four paired gate slabs admit a synthetic event when wake, exact terms, equal depth, and net edge pass. On refused cycles a warning route lights up to record the correct no-trade exit.
      </desc>

      <path d="M54 72H1066M54 130H1066M54 248H1066M54 306H1066" stroke="currentColor" strokeOpacity="0.08" />
      <path d="M140 32V250M405 32V250M700 32V250M970 32V250" stroke="currentColor" strokeOpacity="0.065" />
      <path d="M96 130H1056" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2" />

      {/* Completed connectors remain visible without JavaScript or under reduced motion. */}
      <path data-gsap-protocol-segment="wake-verify" d="M158 130H388" stroke="currentColor" strokeWidth="3" />
      <path data-gsap-protocol-segment="verify-pair" d="M423 130H683" stroke="currentColor" strokeWidth="3" />
      <path data-gsap-protocol-segment="pair-guard" d="M718 130H953" stroke="currentColor" strokeWidth="3" />

      <DesktopGate code="01" x={140} label="RED CARD / 63:00" chipX={60} chipWidth={160} />
      <DesktopGate code="02" x={405} label="TERMS EXACT" chipX={342} chipWidth={126} />
      <DesktopGate code="03" x={700} label="DEPTH 2×$40" chipX={632} chipWidth={136} />
      <DesktopGate code="04" x={970} label=".969 &lt; 1.000" chipX={902} chipWidth={136} />

      <path
        data-gsap-protocol-packet
        data-gsap-protocol-stop="0.88"
        d="M96 130H1056"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="28 932"
        strokeDashoffset="-928"
      />

      <g data-gsap-protocol-result className="text-success">
        <path d="M987 130H1052" stroke="currentColor" strokeWidth="3" />
        <path d="M1052 120L1072 130L1052 140V120Z" fill="currentColor" />
        <circle cx="1058" cy="130" r="24" stroke="currentColor" strokeOpacity="0.16" />
      </g>

      {/* The refusal exit stays hidden on pass cycles and lights fully only when the guard
          refuses. The label box sits left of the arrow so the route never crosses its text. */}
      <g data-gsap-refusal className="text-warning opacity-0">
        <path d="M944 130V180H884V270H816" stroke="currentColor" strokeWidth="2.5" />
        <path d="M816 263L802 270L816 277V263Z" fill="currentColor" />
        <rect x="560" y="254" width="226" height="32" fill="var(--background)" />
        <rect x="560" y="254" width="226" height="32" fill="currentColor" fillOpacity="0.1" stroke="currentColor" />
        <text x="572" y="275" fill="currentColor" fontFamily="var(--font-data)" fontSize="12" letterSpacing="1.05">
          NO TRADE / EDGE CONSUMED
        </text>
        <path
          data-gsap-refusal-packet
          d="M944 130V180H884V270H816"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="24 244"
          strokeDashoffset="-240"
        />
      </g>
    </svg>
  );
}

type MobileGateProps = {
  code: "01" | "02" | "03" | "04";
  y: number;
  title: string;
  value: string;
};

function MobileGate({ code, y, title, value }: MobileGateProps) {
  return (
    <g data-gsap-stage={code === "01" ? "wake" : code === "02" ? "verify" : code === "03" ? "pair" : "guard"} data-gsap-gate={code}>
      <g data-gsap-gate-slab="left">
        <rect x="47" y={y - 27} width="10" height="54" fill="currentColor" />
        <path d={`M50 ${y - 16}H57M50 ${y + 16}H57`} stroke="var(--background)" strokeWidth="2" />
      </g>
      <g data-gsap-gate-slab="right">
        <rect x="71" y={y - 27} width="10" height="54" fill="currentColor" />
        <path d={`M71 ${y - 9}H78M71 ${y + 9}H78`} stroke="var(--background)" strokeWidth="2" />
      </g>
      <text x="106" y={y - 11} fill="currentColor" fontFamily="var(--font-data)" fontSize="12.5" letterSpacing="1.1">
        {code} / {title}
      </text>
      <g data-gsap-gate-chip className="text-success">
        <rect x="104" y={y - 2} width="188" height="28" fill="var(--background)" />
        <rect x="104" y={y - 2} width="188" height="28" fill="currentColor" fillOpacity="0.1" stroke="currentColor" />
        <text x="114" y={y + 16} fill="currentColor" fontFamily="var(--font-data)" fontSize="11" letterSpacing="0.8">
          {value}
        </text>
      </g>
    </g>
  );
}

export function ExecutionProtocolMobileGraphic({ className }: { className?: string }) {
  return (
    <svg
      data-gsap-protocol-view
      viewBox="0 0 320 570"
      role="img"
      aria-labelledby="execution-protocol-mobile-title execution-protocol-mobile-description"
      className={cn("w-full text-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="execution-protocol-mobile-title">Vertical execution protocol gate interlock</title>
      <desc id="execution-protocol-mobile-description">
        A mobile view of four paired gate slabs with a complete pass route; on refused cycles a lower warning exit lights up to record the correct no-trade refusal.
      </desc>

      <path d="M28 24V546M28 104H300M28 228H300M28 352H300M28 476H300M28 546H300" stroke="currentColor" strokeOpacity="0.08" />
      <path d="M64 46V500" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2" />
      <path data-gsap-protocol-segment="wake-verify" d="M64 102V174" stroke="currentColor" strokeWidth="3" />
      <path data-gsap-protocol-segment="verify-pair" d="M64 226V298" stroke="currentColor" strokeWidth="3" />
      <path data-gsap-protocol-segment="pair-guard" d="M64 350V422" stroke="currentColor" strokeWidth="3" />

      <MobileGate code="01" y={76} title="WAKE" value="RED CARD / 63:00" />
      <MobileGate code="02" y={200} title="VERIFY" value="TERMS EXACT" />
      <MobileGate code="03" y={324} title="PAIR" value="DEPTH 2×$40" />
      <MobileGate code="04" y={448} title="GUARD" value=".969 &lt; 1.000" />

      <path
        data-gsap-protocol-packet
        data-gsap-protocol-stop="0.82"
        d="M64 46V500"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="26 428"
        strokeDashoffset="-424"
      />

      <g data-gsap-protocol-result className="text-success">
        <path d="M64 475V516" stroke="currentColor" strokeWidth="3" />
        <path d="M54 516L64 536L74 516H54Z" fill="currentColor" />
        <text x="88" y="528" fill="currentColor" fontFamily="var(--font-data)" fontSize="11" letterSpacing="0.9">
          PASS / MATCHED
        </text>
      </g>

      <g data-gsap-refusal className="text-warning opacity-0">
        <path d="M64 420H30V548H92" stroke="currentColor" strokeWidth="2.5" />
        <path d="M92 541L106 548L92 555V541Z" fill="currentColor" />
        <rect x="110" y="532" width="184" height="28" fill="var(--background)" />
        <rect x="110" y="532" width="184" height="28" fill="currentColor" fillOpacity="0.1" stroke="currentColor" />
        <text x="120" y="550" fill="currentColor" fontFamily="var(--font-data)" fontSize="9.8" letterSpacing="0.55">
          NO TRADE / EDGE CONSUMED
        </text>
        <path
          data-gsap-refusal-packet
          d="M64 420H30V548H92"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="22 206"
          strokeDashoffset="-202"
        />
      </g>
    </svg>
  );
}
