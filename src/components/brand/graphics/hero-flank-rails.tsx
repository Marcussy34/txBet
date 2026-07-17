import { cn } from "@/lib/utils";

/* HERO FLANK RAILS
 * Two quiet timing instruments frame the opening beam on wide viewports:
 * left, the synthetic match clock ticking to the 63:00 red card; right, the
 * venue reprice scale whose cursor settles at T+800 inside the capture band.
 * Server HTML always shows the resolved rest state; the beam-pulse loop
 * rewinds and replays them on the same randomized cadence as the packet.
 */

const RAIL_TOP = 60;
const RAIL_BOTTOM = 510;
const MAJOR_STEP = 75;
const MINOR_STEP = 15;

// One horizontal tick per minor step, skipping rows owned by major ticks.
function minorTickPath(xFrom: number, xTo: number) {
  const parts: string[] = [];
  for (let y = RAIL_TOP; y <= RAIL_BOTTOM; y += MINOR_STEP) {
    if ((y - RAIL_TOP) % MAJOR_STEP === 0) continue;
    parts.push(`M${xFrom} ${y}H${xTo}`);
  }
  return parts.join("");
}

const LEFT_MINOR_TICKS = minorTickPath(70, 76);
const RIGHT_MINOR_TICKS = minorTickPath(16, 22);

// One label per match second; the red-card second anchors the whole rail.
const MATCH_SECONDS = ["62:58", "62:59", "63:00", "63:01", "63:02", "63:03", "63:04"];
const EVENT_INDEX = 2;
const EVENT_Y = RAIL_TOP + EVENT_INDEX * MAJOR_STEP;

// Reprice majors every 250ms; labels every 500ms keep the readout column airy.
const REPRICE_MAJORS = [0, 250, 500, 750, 1000, 1250, 1500];
const CAPTURE_TOP = RAIL_TOP + (600 / 1500) * 450;
const CAPTURE_BOTTOM = RAIL_TOP + (1100 / 1500) * 450;
const SNAP_Y = RAIL_TOP + (800 / 1500) * 450;

export function MatchClockRail({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 92 540"
      className={cn("h-[540px] w-[92px] text-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text x="8" y="20" fill="currentColor" opacity="0.55" fontFamily="var(--font-data)" fontSize="9.5" letterSpacing="1.6">
        MATCH
      </text>
      <text x="8" y="33" fill="currentColor" opacity="0.3" fontFamily="var(--font-data)" fontSize="9.5" letterSpacing="1.6">
        CLOCK
      </text>

      <path data-gsap-flank-rule d={`M76 ${RAIL_TOP - 4}V${RAIL_BOTTOM + 4}`} stroke="currentColor" opacity="0.16" />
      <path d={LEFT_MINOR_TICKS} stroke="currentColor" opacity="0.14" />

      {MATCH_SECONDS.map((label, index) => {
        const y = RAIL_TOP + index * MAJOR_STEP;
        const isEvent = index === EVENT_INDEX;
        return (
          <g key={label}>
            <path d={`M62 ${y}H76`} stroke="currentColor" opacity={isEvent ? 0.6 : 0.26} />
            <text
              x="54"
              y={y + 3}
              textAnchor="end"
              fill="currentColor"
              opacity={isEvent ? 0.85 : 0.3}
              fontFamily="var(--font-data)"
              fontSize="9"
              letterSpacing="0.8"
            >
              {label}
            </text>
            {isEvent ? (
              <text
                x="54"
                y={y + 16}
                textAnchor="end"
                fill="currentColor"
                opacity="0.4"
                fontFamily="var(--font-data)"
                fontSize="8"
                letterSpacing="0.7"
              >
                RED CARD
              </text>
            ) : null}
          </g>
        );
      })}

      {/* The now-cursor rests on the event second; the loop rewinds it two seconds up. */}
      <path data-gsap-flank-now d={`M60 ${EVENT_Y}H90`} stroke="currentColor" strokeWidth="2" opacity="0.7" />
      {/* Background halo keeps the event diamond above the cursor line. */}
      <path
        data-gsap-flank-marker
        d={`M76 ${EVENT_Y - 8}L84 ${EVENT_Y}L76 ${EVENT_Y + 8}L68 ${EVENT_Y}Z`}
        fill="currentColor"
        stroke="var(--background)"
        strokeWidth="3"
        paintOrder="stroke"
        opacity="0.8"
      />

      <text x="8" y="534" fill="currentColor" opacity="0.3" fontFamily="var(--font-data)" fontSize="8" letterSpacing="1.2">
        REPLAY
      </text>
    </svg>
  );
}

export function VenueRepriceRail({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 92 540"
      className={cn("h-[540px] w-[92px] text-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="flank-capture-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>

      <text x="8" y="20" fill="currentColor" opacity="0.55" fontFamily="var(--font-data)" fontSize="9.5" letterSpacing="1.6">
        VENUE
      </text>
      <text x="8" y="33" fill="currentColor" opacity="0.3" fontFamily="var(--font-data)" fontSize="9.5" letterSpacing="1.6">
        REPRICE
      </text>

      {/* Capture band quotes the 600-1100ms window from the timing corridor chapter. */}
      <rect x="8" y={CAPTURE_TOP} width="16" height={CAPTURE_BOTTOM - CAPTURE_TOP} fill="currentColor" fillOpacity="0.05" />
      <rect x="8" y={CAPTURE_TOP} width="16" height={CAPTURE_BOTTOM - CAPTURE_TOP} fill="url(#flank-capture-hatch)" fillOpacity="0.3" />
      <path d={`M8 ${CAPTURE_TOP}H24M8 ${CAPTURE_BOTTOM}H24`} stroke="currentColor" opacity="0.3" />
      <text x="38" y={CAPTURE_TOP + 10} fill="currentColor" opacity="0.45" fontFamily="var(--font-data)" fontSize="8" letterSpacing="0.8">
        CAPTURE
      </text>
      <text x="38" y={CAPTURE_TOP + 22} fill="currentColor" opacity="0.28" fontFamily="var(--font-data)" fontSize="8" letterSpacing="0.6">
        600-1100
      </text>

      <path data-gsap-flank-rule d={`M16 ${RAIL_TOP - 4}V${RAIL_BOTTOM + 4}`} stroke="currentColor" opacity="0.16" />
      <path d={RIGHT_MINOR_TICKS} stroke="currentColor" opacity="0.14" />

      {REPRICE_MAJORS.map((ms, index) => {
        const y = RAIL_TOP + index * MAJOR_STEP;
        const labelled = index % 2 === 0;
        return (
          <g key={ms}>
            <path d={`M16 ${y}H30`} stroke="currentColor" opacity="0.26" />
            {labelled ? (
              <text
                x="38"
                y={y + 3}
                fill="currentColor"
                opacity="0.3"
                fontFamily="var(--font-data)"
                fontSize="9"
                letterSpacing="0.8"
              >
                T+{String(ms).padStart(3, "0")}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* The sweep cursor rests where the venue snap lands, inside the capture band.
          The outer group owns the rest position so the loop only tweens a relative offset. */}
      <g transform={`translate(0 ${SNAP_Y})`}>
        <g data-gsap-flank-sweep opacity="0.55">
          <path d="M8 0H30" stroke="currentColor" strokeWidth="2" />
          <text
            data-gsap-flank-readout
            x="38"
            y="4"
            fill="currentColor"
            fontFamily="var(--font-data)"
            fontSize="9"
            letterSpacing="0.8"
          >
            T+800
          </text>
        </g>
      </g>

      <text x="8" y="534" fill="currentColor" opacity="0.3" fontFamily="var(--font-data)" fontSize="8" letterSpacing="1.2">
        SYNTHETIC
      </text>
    </svg>
  );
}
