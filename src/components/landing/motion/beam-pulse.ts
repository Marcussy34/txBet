import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { createBeamArcs } from "@/components/landing/beam-arcs";
import type { MotionCleanup } from "@/components/landing/motion/live-loop";

export const BEAM_PULSE_TIMING = {
  firstDelay: 1.5,
  idleMin: 1.2,
  idleMax: 2.4,
  chargeAt: 0,
  chargeYFraction: 0.06,
  chargeCountMin: 2,
  chargeCountMax: 3,
  fireAt: 0.1,
  fireDuration: 0.42,
  fireFromYFraction: -0.08,
  fireToYFraction: 0.38,
  bloomAt: 0.42,
  bloomHalfDuration: 0.25,
  bloomOpacity: 0.35,
  bloomFromScale: 0.97,
  bloomPeakScale: 1,
  bloomToScale: 1.03,
  reemergeAt: 0.62,
  reemergeDuration: 0.5,
  reemergeFromYFraction: 0.62,
  reemergeToYFraction: 1.04,
  landingAt: 1.05,
  landingYFraction: 0.94,
  landingCountMin: 1,
  landingCountMax: 2,
  landingHalfDuration: 0.175,
  tickFromScaleX: 0.375,
  tickToScaleX: 1,
  tickOpacity: 0.5,
  cycleEnd: 1.4,
  hiddenOpacity: 0,
  visibleOpacity: 1,
  arcCountStep: 1,
} as const;

export function animateBeamPulse(root: HTMLDivElement): MotionCleanup {
  /* BEAM PULSE STORYBOARD
   * 0.00s charge cracks at the top rail
   * 0.10s the packet fires into the masked gate
   * 0.42s the identity blooms as the event passes through
   * 0.62s the packet re-emerges and settles into a faint tick
   */
  const splash = root.querySelector<HTMLElement>("[data-brand-splash]");
  const packet = root.querySelector<HTMLElement>("[data-gsap-beam-pulse]");
  const tick = root.querySelector<HTMLElement>("[data-gsap-beam-tick]");
  const canvas = root.querySelector<HTMLCanvasElement>("[data-gsap-beam-arcs]");
  const bloom = root.querySelector<HTMLElement>("[data-gsap-lockup-bloom]");

  if (!splash || !packet || !tick || !canvas || !bloom) return () => undefined;

  let arcs: ReturnType<typeof createBeamArcs> | undefined;
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

  const ensureArcs = () => {
    arcs ??= createBeamArcs(canvas);
  };

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
    arcs?.destroy();
    arcs = undefined;
  };

  const playWhenVisible = () => {
    if (!canPlay()) return;
    ensureArcs();

    if (cycleRunning) timeline.play();
    else if (delayedCall) delayedCall.resume();
    else schedulePendingCycle();
  };

  const syncDocumentVisibility = () => {
    if (document.hidden || !visibilityTrigger?.isActive) pauseLoop();
    else playWhenVisible();
  };

  gsap.set(canvas, { opacity: BEAM_PULSE_TIMING.visibleOpacity });
  timeline.call(
    () => arcs?.burst({
      yFraction: BEAM_PULSE_TIMING.chargeYFraction,
      count: gsap.utils.random(
        BEAM_PULSE_TIMING.chargeCountMin,
        BEAM_PULSE_TIMING.chargeCountMax,
        BEAM_PULSE_TIMING.arcCountStep,
      ),
    }),
    [],
    BEAM_PULSE_TIMING.chargeAt,
  );
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
  timeline.call(
    () => arcs?.burst({
      yFraction: BEAM_PULSE_TIMING.landingYFraction,
      count: gsap.utils.random(
        BEAM_PULSE_TIMING.landingCountMin,
        BEAM_PULSE_TIMING.landingCountMax,
        BEAM_PULSE_TIMING.arcCountStep,
      ),
    }),
    [],
    BEAM_PULSE_TIMING.landingAt,
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
    visibilityTrigger?.kill();
    visibilityTrigger = undefined;
    arcs?.destroy();
    arcs = undefined;
  };
}
