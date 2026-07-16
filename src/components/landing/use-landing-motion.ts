"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

type LandingMotionOptions = {
  scope: RefObject<HTMLDivElement | null>;
};

function animateAsset(asset: SVGSVGElement) {
  const paths = Array.from(asset.querySelectorAll<SVGPathElement>("[data-gsap-draw]"));
  const nodes = Array.from(asset.querySelectorAll<SVGGraphicsElement>("[data-gsap-node]"));

  const timeline = gsap.timeline({
    defaults: { ease: "power2.out" },
    scrollTrigger: {
      trigger: asset,
      start: "top 82%",
      once: true,
    },
  });

  paths.forEach((path, index) => {
    const length = path.getTotalLength();
    gsap.set(path, {
      strokeDasharray: length,
      strokeDashoffset: length * 0.72,
    });
    timeline.to(path, { strokeDashoffset: 0, duration: 0.72 }, index * 0.08);
  });

  if (nodes.length > 0) {
    timeline.fromTo(
      nodes,
      { opacity: 0.3, scale: 0.55, transformOrigin: "center center" },
      { opacity: 1, scale: 1, duration: 0.42, stagger: 0.07 },
      paths.length > 0 ? 0.18 : 0,
    );
  }
}

export function useLandingMotion({ scope }: LandingMotionOptions) {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const splash = root.querySelector<HTMLElement>("[data-brand-splash]");
        const beam = root.querySelector<HTMLElement>("[data-gsap-beam]");
        const lockup = root.querySelector<HTMLElement>("[data-gsap-lockup]");

        if (splash && beam && lockup) {
          gsap
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

        root.querySelectorAll<SVGSVGElement>("[data-gsap-asset]").forEach(animateAsset);
      });

      return () => media.revert();
    },
    { scope },
  );
}
