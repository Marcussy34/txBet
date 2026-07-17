"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

import { animateAgentTelemetry } from "@/components/landing/motion/agent-telemetry";
import { animateBeamPulse } from "@/components/landing/motion/beam-pulse";
import type { MotionCleanup } from "@/components/landing/motion/live-loop";
import { LOOP_REGISTRY } from "@/components/landing/motion/registry";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}
type LandingMotionOptions = {
  scope: RefObject<HTMLDivElement | null>;
};

function animateAsset(asset: SVGSVGElement): MotionCleanup {
  const animate = LOOP_REGISTRY[asset.dataset.gsapAsset ?? ""];
  return animate ? animate(asset) : animateAgentTelemetry(asset);
}

function setupLandingMotion(root: HTMLDivElement): MotionCleanup {
  let motionCleanups: MotionCleanup[] = [];
  const context = gsap.context(() => {
    const splash = root.querySelector<HTMLElement>("[data-brand-splash]");
    const beam = root.querySelector<HTMLElement>("[data-gsap-beam]");
    const lockup = root.querySelector<HTMLElement>("[data-gsap-lockup]");
    const flankMatch = root.querySelector<HTMLElement>('[data-gsap-flank="match"]');
    const flankReprice = root.querySelector<HTMLElement>('[data-gsap-flank="reprice"]');

    if (splash && beam && lockup) {
      const splashScrub = gsap
        .timeline({
          scrollTrigger: {
            trigger: splash,
            start: "top top",
            end: "bottom top",
            scrub: 0.4,
          },
        })
        .to(beam, { opacity: 0.34, scaleX: 0.18, transformOrigin: "center center", ease: "none" }, 0)
        .to(lockup, { opacity: 0.72, scale: 0.965, yPercent: -6, ease: "none" }, 0);

      // Flank rails shear apart and dim out as the corridor narrows into the system.
      if (flankMatch) splashScrub.to(flankMatch, { y: -36, autoAlpha: 0, ease: "none" }, 0);
      if (flankReprice) splashScrub.to(flankReprice, { y: 36, autoAlpha: 0, ease: "none" }, 0);
    }

    const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-gsap-reveal]"));
    reveals.forEach((element) => {
      gsap.fromTo(
        element,
        { opacity: 0.72, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.72,
          ease: "power3.out",
          clearProps: "opacity,transform",
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
            once: true,
          },
        },
      );
    });

    motionCleanups = Array.from(root.querySelectorAll<SVGSVGElement>("[data-gsap-asset]")).map(animateAsset);
    motionCleanups.push(animateBeamPulse(root));
  }, root);

  return () => {
    context.revert();
    motionCleanups.forEach((cleanup) => cleanup());
  };
}

export function useLandingMotion({ scope }: LandingMotionOptions) {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let cleanupMotion: MotionCleanup | undefined;

      // A native media listener avoids ScrollTrigger's global matchMedia refresh changing scroll position.
      const syncMotionPreference = () => {
        cleanupMotion?.();
        cleanupMotion = reducedMotion.matches ? undefined : setupLandingMotion(root);
      };

      syncMotionPreference();
      reducedMotion.addEventListener("change", syncMotionPreference);

      return () => {
        reducedMotion.removeEventListener("change", syncMotionPreference);
        cleanupMotion?.();
      };
    },
    { scope },
  );
}
