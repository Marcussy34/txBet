import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import type { MotionCleanup } from "@/components/landing/motion/live-loop";

export const BEAM_PULSE_TIMING = {
  firstDelay: 1.5,
  idleMin: 0.9,
  idleMax: 1.8,
  // Match-clock rewind: the now-cursor drops two seconds and arrives at 63:00 as the packet fires.
  clockAt: 0,
  clockDuration: 0.45,
  clockDropOffset: -150,
  clockDimOpacity: 0.15,
  clockPeakOpacity: 0.9,
  clockRestOpacity: 0.7,
  markerPopScale: 1.45,
  markerPopDuration: 0.14,
  markerRestOpacity: 0.8,
  fireAt: 0.45,
  fireDuration: 0.42,
  fireFromYFraction: -0.08,
  fireToYFraction: 0.38,
  bloomAt: 0.77,
  bloomHalfDuration: 0.25,
  bloomOpacity: 0.35,
  bloomFromScale: 0.97,
  bloomPeakScale: 1,
  bloomToScale: 1.03,
  reemergeAt: 0.97,
  reemergeDuration: 0.5,
  reemergeFromYFraction: 0.62,
  reemergeToYFraction: 1.04,
  landingAt: 1.4,
  landingHalfDuration: 0.175,
  tickFromScaleX: 0.375,
  tickToScaleX: 1,
  tickOpacity: 0.5,
  // Venue-reprice sweep: T+000 to the T+800 snap, riding the packet landing.
  sweepAt: 1.4,
  sweepDuration: 0.9,
  sweepMs: 800,
  sweepPxPerMs: 0.3,
  sweepActiveOpacity: 0.95,
  sweepRestOpacity: 0.55,
  settleAt: 2.45,
  settleDuration: 0.35,
  cycleEnd: 2.85,
  hiddenOpacity: 0,
  visibleOpacity: 1,
  // Ambient rule breathing keeps the rails alive between pulses.
  breatheOpacity: 0.3,
  breatheDuration: 2.4,
} as const;

const READOUT_REST = "T+800";

export function animateBeamPulse(root: HTMLDivElement): MotionCleanup {
  /* BEAM PULSE STORYBOARD
   * 0.00s the match clock rewinds two seconds and ticks toward 63:00
   * 0.45s the event diamond pops and the packet fires into the masked gate
   * 0.77s the identity blooms as the event passes through
   * 1.40s the packet lands; the reprice cursor sweeps T+000 to the T+800 snap
   */
  const splash = root.querySelector<HTMLElement>("[data-brand-splash]");
  const packet = root.querySelector<HTMLElement>("[data-gsap-beam-pulse]");
  const tick = root.querySelector<HTMLElement>("[data-gsap-beam-tick]");
  const bloom = root.querySelector<HTMLElement>("[data-gsap-lockup-bloom]");

  if (!splash || !packet || !tick || !bloom) return () => undefined;

  // Flank rails are optional instruments; the pulse still runs without them.
  const clockCursor = root.querySelector<SVGGraphicsElement>("[data-gsap-flank-now]");
  const clockMarker = root.querySelector<SVGGraphicsElement>("[data-gsap-flank-marker]");
  const sweepGroup = root.querySelector<SVGGraphicsElement>("[data-gsap-flank-sweep]");
  const sweepReadout = root.querySelector<SVGTextElement>("[data-gsap-flank-readout]");
  const flankRules = Array.from(root.querySelectorAll<SVGGraphicsElement>("[data-gsap-flank-rule]"));

  let delayedCall: ReturnType<typeof gsap.delayedCall> | undefined;
  let visibilityTrigger: ScrollTrigger | undefined;
  let pendingDelay: number | null = BEAM_PULSE_TIMING.firstDelay;
  let cycleRunning = false;
  let destroyed = false;

  const timeline = gsap.timeline({
    paused: true,
    onComplete: () => {
      cycleRunning = false;
      pendingDelay = gsap.utils.random(BEAM_PULSE_TIMING.idleMin, BEAM_PULSE_TIMING.idleMax);
      schedulePendingCycle();
    },
  });

  const idleTimeline = flankRules.length
    ? gsap
        .timeline({ paused: true, repeat: -1, yoyo: true })
        .to(flankRules, {
          opacity: BEAM_PULSE_TIMING.breatheOpacity,
          duration: BEAM_PULSE_TIMING.breatheDuration,
          ease: "sine.inOut",
        })
    : undefined;

  const canPlay = () => !destroyed && !document.hidden && Boolean(visibilityTrigger?.isActive);

  function runCycle() {
    if (!canPlay()) return;
    pendingDelay = null;
    cycleRunning = true;
    timeline.invalidate().restart();
  }

  function schedulePendingCycle() {
    if (!canPlay() || pendingDelay === null || delayedCall) return;
    delayedCall = gsap.delayedCall(pendingDelay, () => {
      delayedCall = undefined;
      if (canPlay()) runCycle();
    });
  }

  const pauseLoop = () => {
    timeline.pause();
    delayedCall?.pause();
    idleTimeline?.pause();
  };

  const playWhenVisible = () => {
    if (!canPlay()) return;
    idleTimeline?.play();

    if (cycleRunning) timeline.play();
    else if (delayedCall) delayedCall.resume();
    else schedulePendingCycle();
  };

  const syncDocumentVisibility = () => {
    if (document.hidden || !visibilityTrigger?.isActive) pauseLoop();
    else playWhenVisible();
  };

  // Rewind reads as replay: the cursor dims out at 63:00 and reappears two seconds up.
  if (clockCursor) {
    timeline.fromTo(
      clockCursor,
      { y: BEAM_PULSE_TIMING.clockDropOffset, opacity: BEAM_PULSE_TIMING.clockDimOpacity },
      {
        y: 0,
        opacity: BEAM_PULSE_TIMING.clockPeakOpacity,
        duration: BEAM_PULSE_TIMING.clockDuration,
        ease: "power1.in",
        immediateRender: false,
      },
      BEAM_PULSE_TIMING.clockAt,
    );
    timeline.to(
      clockCursor,
      { opacity: BEAM_PULSE_TIMING.clockRestOpacity, duration: 0.3, ease: "power2.out" },
      BEAM_PULSE_TIMING.fireAt + 0.25,
    );
  }
  if (clockMarker) {
    timeline.to(
      clockMarker,
      {
        scale: BEAM_PULSE_TIMING.markerPopScale,
        opacity: 1,
        transformOrigin: "center center",
        duration: BEAM_PULSE_TIMING.markerPopDuration,
        ease: "power2.out",
      },
      BEAM_PULSE_TIMING.fireAt,
    );
    timeline.to(
      clockMarker,
      { scale: 1, duration: BEAM_PULSE_TIMING.markerPopDuration, ease: "power2.in" },
      BEAM_PULSE_TIMING.fireAt + BEAM_PULSE_TIMING.markerPopDuration,
    );
    timeline.to(
      clockMarker,
      { opacity: BEAM_PULSE_TIMING.markerRestOpacity, duration: 0.3, ease: "power2.out" },
      BEAM_PULSE_TIMING.settleAt,
    );
  }

  timeline.fromTo(
    packet,
    {
      opacity: BEAM_PULSE_TIMING.hiddenOpacity,
      y: () => splash.clientHeight * BEAM_PULSE_TIMING.fireFromYFraction,
    },
    {
      opacity: BEAM_PULSE_TIMING.visibleOpacity,
      y: () => splash.clientHeight * BEAM_PULSE_TIMING.fireToYFraction,
      duration: BEAM_PULSE_TIMING.fireDuration,
      ease: "power2.in",
      immediateRender: false,
    },
    BEAM_PULSE_TIMING.fireAt,
  );
  timeline.fromTo(
    bloom,
    { opacity: BEAM_PULSE_TIMING.hiddenOpacity, scale: BEAM_PULSE_TIMING.bloomFromScale },
    {
      opacity: BEAM_PULSE_TIMING.bloomOpacity,
      scale: BEAM_PULSE_TIMING.bloomPeakScale,
      duration: BEAM_PULSE_TIMING.bloomHalfDuration,
      ease: "power2.out",
      immediateRender: false,
    },
    BEAM_PULSE_TIMING.bloomAt,
  );
  timeline.to(
    bloom,
    {
      opacity: BEAM_PULSE_TIMING.hiddenOpacity,
      scale: BEAM_PULSE_TIMING.bloomToScale,
      duration: BEAM_PULSE_TIMING.bloomHalfDuration,
      ease: "power2.in",
    },
    BEAM_PULSE_TIMING.bloomAt + BEAM_PULSE_TIMING.bloomHalfDuration,
  );
  // The beam mask owns the middle-band disappearance, so the packet never crosses copy.
  timeline.fromTo(
    packet,
    {
      opacity: BEAM_PULSE_TIMING.visibleOpacity,
      y: () => splash.clientHeight * BEAM_PULSE_TIMING.reemergeFromYFraction,
    },
    {
      opacity: BEAM_PULSE_TIMING.visibleOpacity,
      y: () => splash.clientHeight * BEAM_PULSE_TIMING.reemergeToYFraction,
      duration: BEAM_PULSE_TIMING.reemergeDuration,
      ease: "power2.out",
      immediateRender: false,
    },
    BEAM_PULSE_TIMING.reemergeAt,
  );
  timeline.fromTo(
    tick,
    {
      opacity: BEAM_PULSE_TIMING.hiddenOpacity,
      scaleX: BEAM_PULSE_TIMING.tickFromScaleX,
      transformOrigin: "center center",
    },
    {
      opacity: BEAM_PULSE_TIMING.tickOpacity,
      scaleX: BEAM_PULSE_TIMING.tickToScaleX,
      duration: BEAM_PULSE_TIMING.landingHalfDuration,
      ease: "power2.out",
      immediateRender: false,
    },
    BEAM_PULSE_TIMING.landingAt,
  );
  timeline.to(
    tick,
    {
      opacity: BEAM_PULSE_TIMING.hiddenOpacity,
      duration: BEAM_PULSE_TIMING.landingHalfDuration,
      ease: "power2.in",
    },
    BEAM_PULSE_TIMING.landingAt + BEAM_PULSE_TIMING.landingHalfDuration,
  );

  // One eased millisecond counter drives both the cursor offset and the readout text,
  // so the sweep can never disagree with its own label.
  if (sweepGroup && sweepReadout) {
    const sweepState = { ms: BEAM_PULSE_TIMING.sweepMs };
    const applySweep = () => {
      const ms = Math.round(sweepState.ms);
      sweepReadout.textContent = `T+${String(ms).padStart(3, "0")}`;
      gsap.set(sweepGroup, { y: (ms - BEAM_PULSE_TIMING.sweepMs) * BEAM_PULSE_TIMING.sweepPxPerMs });
    };

    timeline.set(sweepGroup, { opacity: BEAM_PULSE_TIMING.sweepActiveOpacity }, BEAM_PULSE_TIMING.sweepAt);
    timeline.fromTo(
      sweepState,
      { ms: 0 },
      {
        ms: BEAM_PULSE_TIMING.sweepMs,
        duration: BEAM_PULSE_TIMING.sweepDuration,
        ease: "power2.out",
        onUpdate: applySweep,
      },
      BEAM_PULSE_TIMING.sweepAt,
    );
    timeline.to(
      sweepGroup,
      {
        opacity: BEAM_PULSE_TIMING.sweepRestOpacity,
        duration: BEAM_PULSE_TIMING.settleDuration,
        ease: "power2.in",
      },
      BEAM_PULSE_TIMING.settleAt,
    );
  }

  timeline.set(packet, { opacity: BEAM_PULSE_TIMING.hiddenOpacity }, BEAM_PULSE_TIMING.cycleEnd);

  visibilityTrigger = ScrollTrigger.create({
    trigger: splash,
    start: "top 90%",
    end: "bottom 10%",
    onEnter: playWhenVisible,
    onEnterBack: playWhenVisible,
    onLeave: pauseLoop,
    onLeaveBack: pauseLoop,
  });

  document.addEventListener("visibilitychange", syncDocumentVisibility);
  syncDocumentVisibility();

  return () => {
    destroyed = true;
    document.removeEventListener("visibilitychange", syncDocumentVisibility);
    delayedCall?.kill();
    delayedCall = undefined;
    timeline.kill();
    idleTimeline?.kill();
    visibilityTrigger?.kill();
    visibilityTrigger = undefined;
    // Rails fall back to their server-rendered rest state.
    if (sweepReadout) sweepReadout.textContent = READOUT_REST;
    const railElements = [clockCursor, clockMarker, sweepGroup, ...flankRules].filter(
      (element): element is SVGGraphicsElement => Boolean(element),
    );
    if (railElements.length) gsap.set(railElements, { clearProps: "all" });
  };
}
