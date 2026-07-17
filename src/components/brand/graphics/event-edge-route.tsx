import { cn } from "@/lib/utils";

function SvgChip({
  x,
  y,
  width,
  label,
  height = 24,
  fontSize = 13,
}: {
  x: number;
  y: number;
  width: number;
  label: string;
  height?: number;
  fontSize?: number;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="currentColor"
        fillOpacity="0.025"
        stroke="currentColor"
        strokeOpacity="0.42"
      />
      <text
        x={x + 8}
        y={y + height / 2 + fontSize * 0.36}
        fill="currentColor"
        fontFamily="var(--font-data)"
        fontSize={fontSize}
        letterSpacing="1.2"
      >
        {label}
      </text>
    </g>
  );
}

export function EventEdgeRoute({ className }: { className?: string }) {
  return (
    <svg
      data-gsap-asset="event-edge-route"
      viewBox="0 0 760 280"
      role="img"
      aria-labelledby="event-edge-title event-edge-description"
      className={cn("w-full text-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="event-edge-title">Momentum-to-position route</title>
      <desc id="event-edge-description">
        A qualifying red-card momentum shift opens complementary YES and NO outcome positions, joins them as an exact pair, and passes through a two-slab after-cost gate.
      </desc>

      <defs>
        <pattern id="event-edge-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>

      <path d="M42 40H718M42 140H718M42 240H718" stroke="currentColor" strokeOpacity="0.09" />
      <path d="M170 32V248M400 32V248M502 32V248M628 32V248" stroke="currentColor" strokeOpacity="0.07" />

      {/* The capture band keeps a quiet fill and visibly hatched one-pixel boundaries. */}
      <g aria-hidden="true">
        <rect x="400" y="38" width="102" height="204" fill="currentColor" fillOpacity="0.04" />
        <rect x="400" y="38" width="8" height="204" fill="url(#event-edge-hatch)" fillOpacity="0.34" />
        <rect x="494" y="38" width="8" height="204" fill="url(#event-edge-hatch)" fillOpacity="0.34" />
        <path d="M400 38V242M502 38V242" stroke="currentColor" strokeOpacity="0.34" strokeWidth="1" />
      </g>

      {/* Exact complements split at the square node and settle at one pair diamond. */}
      <path
        data-gsap-draw
        d="M64 140H170C218 140 226 76 292 76H418C472 76 490 140 558 140H704"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="square"
      />
      <path
        data-gsap-draw
        d="M64 140H170C218 140 226 204 292 204H418C472 204 490 140 558 140"
        stroke="currentColor"
        strokeOpacity="0.56"
        strokeWidth="2.5"
        strokeLinecap="square"
      />

      <rect data-gsap-node data-gsap-stage="event" x="57" y="133" width="14" height="14" fill="currentColor" />
      <rect data-gsap-node data-gsap-stage="split" x="164" y="134" width="12" height="12" fill="currentColor" />
      <rect data-gsap-node data-gsap-stage="quote" x="286" y="70" width="13" height="13" fill="currentColor" />
      <path data-gsap-node data-gsap-stage="quote" d="M292.5 197L299.5 204L292.5 211L285.5 204L292.5 197Z" stroke="currentColor" strokeWidth="2.5" />
      {/* Outcome markers wear a background halo so the rail never bleeds through them. */}
      <path data-gsap-node data-gsap-stage="pair" d="M558 132L566 140L558 148L550 140L558 132Z" stroke="var(--background)" strokeWidth="3" paintOrder="stroke" className="fill-success" />

      {/* Two parallel slabs quote the Split-Window Gate in the txBet mark. */}
      <g data-gsap-node data-gsap-stage="gate">
        <rect x="612" y="108" width="9" height="64" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="2" />
        <rect x="636" y="108" width="9" height="64" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="2" />
      </g>
      <rect data-gsap-node data-gsap-stage="pass" x="697" y="133" width="14" height="14" stroke="var(--background)" strokeWidth="3" paintOrder="stroke" className="fill-success" />

      {/* The live loop turns these duplicate rails into a short courier and its fade. */}
      <g className="text-success" aria-hidden="true">
        <path data-gsap-packet-trail="source" d="M64 140H170" stroke="currentColor" strokeWidth="1" strokeLinecap="square" opacity="0" />
        <path data-gsap-packet="source" d="M64 140H170" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square" opacity="0" />
        <path data-gsap-packet-trail="yes" d="M170 140C218 140 226 76 292 76H418C472 76 490 140 558 140" stroke="currentColor" strokeWidth="1" strokeLinecap="square" opacity="0" />
        <path data-gsap-packet="yes" d="M170 140C218 140 226 76 292 76H418C472 76 490 140 558 140" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square" opacity="0" />
        <path data-gsap-packet-trail="no" d="M170 140C218 140 226 204 292 204H418C472 204 490 140 558 140" stroke="currentColor" strokeWidth="1" strokeLinecap="square" opacity="0" />
        <path data-gsap-packet="no" d="M170 140C218 140 226 204 292 204H418C472 204 490 140 558 140" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square" opacity="0" />
        <path data-gsap-packet-trail="gate" d="M558 140H704" stroke="currentColor" strokeWidth="1" strokeLinecap="square" opacity="0" />
        <path data-gsap-packet="gate" d="M558 140H704" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square" opacity="0" />
      </g>

      <g className="hidden sm:block">
        <SvgChip x={38} y={92} width={132} label="TXLINE / 63:00" />
        <SvgChip x={38} y={164} width={126} label="RED CARD / H2" />
        <SvgChip x={266} y={36} width={118} label="YES / $0.540" />
        <SvgChip x={266} y={220} width={116} label="NO / $0.400" />
        <SvgChip x={410} y={106} width={90} label="CAPTURE" />
        <SvgChip x={510} y={92} width={116} label="PAIR / $0.940" />
        <SvgChip x={604} y={176} width={110} label="COST GATE" />
        {/* Worked example: each leg is venue-attributed and the gate carries its real fee load. */}
        <text x={268} y={26} fill="currentColor" opacity="0.5" fontFamily="var(--font-data)" fontSize="10.5" letterSpacing="1.3">
          POLYMARKET / 0.05 CURVE
        </text>
        <text x={268} y={262} fill="currentColor" opacity="0.5" fontFamily="var(--font-data)" fontSize="10.5" letterSpacing="1.3">
          KALSHI / 0.07 CURVE
        </text>
        <text x={606} y={216} fill="currentColor" opacity="0.55" fontFamily="var(--font-data)" fontSize="10.5" letterSpacing="1.2">
          FEES $0.029
        </text>
      </g>
      <g className="sm:hidden">
        <SvgChip x={28} y={86} width={146} height={36} fontSize={20} label="MOMENTUM / 63:00" />
        <SvgChip x={28} y={158} width={136} height={36} fontSize={20} label="CARD / H2" />
        <SvgChip x={242} y={24} width={132} height={36} fontSize={20} label="YES / .540" />
        <SvgChip x={242} y={220} width={128} height={36} fontSize={20} label="NO / .400" />
        <SvgChip x={404} y={96} width={104} height={36} fontSize={19} label="CAPTURE" />
        <SvgChip x={510} y={86} width={128} height={36} fontSize={20} label="PAIR / .940" />
        <SvgChip x={600} y={176} width={128} height={36} fontSize={20} label="COST GATE" />
      </g>
    </svg>
  );
}
