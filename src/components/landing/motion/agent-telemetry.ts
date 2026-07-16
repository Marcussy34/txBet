import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import type { MotionCleanup } from "@/components/landing/motion/live-loop";

export function animateAgentTelemetry(asset: SVGSVGElement): MotionCleanup {
  const paths = Array.from(asset.querySelectorAll<SVGPathElement>("[data-gsap-draw]"));
  const nodes = Array.from(asset.querySelectorAll<SVGGraphicsElement>("[data-gsap-node]"));
  const cursor = asset.querySelector<SVGLineElement>("[data-gsap-agent-cursor]");
  const card = asset.closest<HTMLElement>("[data-gsap-agent-index]");
  const parsedIndex = Number.parseInt(card?.dataset.gsapAgentIndex ?? "0", 10);
  const agentIndex = Number.isFinite(parsedIndex) ? Math.max(0, parsedIndex) : 0;

  const drawTimeline = gsap.timeline({
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
    drawTimeline.to(path, { strokeDashoffset: 0, duration: 0.72 }, index * 0.08);
  });

  if (nodes.length > 0) {
    drawTimeline.fromTo(
      nodes,
      { opacity: 0.3, scale: 0.55, transformOrigin: "center center" },
      { opacity: 1, scale: 1, duration: 0.42, stagger: 0.07 },
      paths.length > 0 ? 0.18 : 0,
    );
  }

  const redrawTrace = () => {
    paths.forEach((path) => {
      const length = path.getTotalLength();
      gsap.fromTo(
        path,
        { strokeDashoffset: length * 0.24 },
        { strokeDashoffset: 0, duration: 0.28, ease: "power2.out", overwrite: "auto" },
      );
    });
  };

  const hoverQuery = window.matchMedia("(hover: hover)");
  const handlePointerEnter = () => {
    if (hoverQuery.matches) redrawTrace();
  };
  card?.addEventListener("pointerenter", handlePointerEnter);
  card?.addEventListener("focusin", redrawTrace);

  let cursorTimeline: ReturnType<typeof gsap.timeline> | undefined;
  let visibilityTrigger: ReturnType<typeof ScrollTrigger.create> | undefined;
  let syncDocumentVisibility: (() => void) | undefined;

  if (cursor) {
    cursorTimeline = gsap.timeline({
      paused: true,
      repeat: -1,
      repeatDelay: 0.9,
      delay: agentIndex * 0.4,
      defaults: { ease: "none" },
    });

    cursorTimeline
      .set(cursor, { opacity: 0, x: 0 })
      .to(cursor, { opacity: 0.34, duration: 0.12 }, 0)
      .to(cursor, { x: 144, duration: 3.5 }, 0)
      .to(nodes, { scale: 1.4, duration: 0.1, transformOrigin: "center center", ease: "power2.out" }, 3.4)
      .to(nodes, { scale: 1, duration: 0.1, ease: "power2.in" }, 3.5)
      .to(cursor, { opacity: 0, duration: 0.1 }, 3.5);

    const playWhenVisible = () => {
      if (document.hidden) return;
      cursorTimeline?.play();
    };

    visibilityTrigger = ScrollTrigger.create({
      trigger: card ?? asset,
      start: "top 90%",
      end: "bottom 10%",
      onEnter: playWhenVisible,
      onEnterBack: playWhenVisible,
      onLeave: () => cursorTimeline?.pause(),
      onLeaveBack: () => cursorTimeline?.pause(),
    });

    // Keep subtle ambient motion idle in background tabs.
    syncDocumentVisibility = () => {
      if (document.hidden || !visibilityTrigger?.isActive) cursorTimeline?.pause();
      else playWhenVisible();
    };
    document.addEventListener("visibilitychange", syncDocumentVisibility);
  }

  return () => {
    card?.removeEventListener("pointerenter", handlePointerEnter);
    card?.removeEventListener("focusin", redrawTrace);
    if (syncDocumentVisibility) document.removeEventListener("visibilitychange", syncDocumentVisibility);
    visibilityTrigger?.kill();
    cursorTimeline?.kill();
    drawTimeline.scrollTrigger?.kill();
    drawTimeline.kill();
    gsap.killTweensOf([...paths, ...nodes, ...(cursor ? [cursor] : [])]);
    gsap.set(paths, { strokeDashoffset: 0 });
    gsap.set(nodes, { opacity: 1, scale: 1 });
    if (cursor) gsap.set(cursor, { opacity: 0, x: 0 });
  };
}
