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

type MotionCleanup = () => void;

type LiveLoopTimeline = ReturnType<typeof gsap.timeline>;

type LiveLoopName = "event-edge" | "quote-window" | "execution-protocol";

type LiveLoopUi = {
  panel: HTMLElement | null;
  status: HTMLElement | null;
  clock: HTMLElement | null;
  liveDot: HTMLElement | null;
  toggle: HTMLButtonElement | null;
  pauseIcon: SVGElement | null;
  playIcon: SVGElement | null;
  setReadout: (status: string, clock: string) => void;
};

function getLiveLoopUi(asset: SVGSVGElement, loopName: LiveLoopName): LiveLoopUi {
  const panel = asset.closest<HTMLElement>(`[data-gsap-loop="${loopName}"]`);
  const status = panel?.querySelector<HTMLElement>("[data-gsap-live-status]") ?? null;
  const clock = panel?.querySelector<HTMLElement>("[data-gsap-live-clock]") ?? null;
  const liveDot = panel?.querySelector<HTMLElement>("[data-gsap-live-dot]") ?? null;
  const toggle = panel?.querySelector<HTMLButtonElement>("[data-gsap-live-toggle]") ?? null;
  const pauseIcon = toggle?.querySelector<SVGElement>("[data-gsap-live-pause]") ?? null;
  const playIcon = toggle?.querySelector<SVGElement>("[data-gsap-live-play]") ?? null;

  const setReadout = (nextStatus: string, nextClock: string) => {
    if (status) status.textContent = nextStatus;
    if (clock) clock.textContent = nextClock;
  };

  return { panel, status, clock, liveDot, toggle, pauseIcon, playIcon, setReadout };
}

function connectLiveLoop(
  asset: SVGSVGElement,
  timeline: LiveLoopTimeline,
  ui: LiveLoopUi,
  initialStatus = "loop ready",
  initialClock = "synthetic",
): MotionCleanup {
  const pauseLabel = ui.toggle?.getAttribute("aria-label") ?? "Pause animation";
  const resumeLabel = pauseLabel.startsWith("Pause ") ? `Resume ${pauseLabel.slice(6)}` : "Resume animation";

  let hasStarted = false;
  let userPaused = false;
  const playWhenVisible = () => {
    if (document.hidden || userPaused) return;
    if (!hasStarted) {
      hasStarted = true;
      timeline.restart();
      return;
    }
    timeline.play();
  };

  const visibilityTrigger = ScrollTrigger.create({
    trigger: ui.panel ?? asset,
    start: "top 90%",
    end: "bottom 10%",
    onEnter: playWhenVisible,
    onEnterBack: playWhenVisible,
    onLeave: () => timeline.pause(),
    onLeaveBack: () => timeline.pause(),
  });

  const syncDocumentVisibility = () => {
    if (document.hidden || !visibilityTrigger.isActive) timeline.pause();
    else playWhenVisible();
  };

  const syncToggle = () => {
    if (!ui.toggle) return;
    ui.toggle.setAttribute("aria-label", userPaused ? resumeLabel : pauseLabel);
    ui.pauseIcon?.classList.toggle("hidden", userPaused);
    ui.playIcon?.classList.toggle("hidden", !userPaused);
  };

  const handleToggle = () => {
    userPaused = !userPaused;
    syncToggle();
    if (userPaused) timeline.pause();
    else if (visibilityTrigger.isActive) playWhenVisible();
  };

  syncToggle();
  document.addEventListener("visibilitychange", syncDocumentVisibility);
  ui.toggle?.addEventListener("click", handleToggle);

  return () => {
    document.removeEventListener("visibilitychange", syncDocumentVisibility);
    ui.toggle?.removeEventListener("click", handleToggle);
    visibilityTrigger.kill();
    timeline.kill();
    userPaused = false;
    syncToggle();
    ui.setReadout(initialStatus, initialClock);
  };
}

function animateEventEdgeRoute(asset: SVGSVGElement): MotionCleanup {
  const ui = getLiveLoopUi(asset, "event-edge");
  const paths = Array.from(asset.querySelectorAll<SVGPathElement>("[data-gsap-draw]"));
  const nodes = Array.from(asset.querySelectorAll<SVGGraphicsElement>("[data-gsap-node]"));
  const eventNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="event"]');
  const quoteNodes = Array.from(asset.querySelectorAll<SVGGraphicsElement>('[data-gsap-stage="quote"]'));
  const pairNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="pair"]');
  const passNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="pass"]');
  const triggerMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="trigger"]');
  const pairMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="pair"]');
  const edgeMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="edge"]');
  const metrics = [triggerMetric, pairMetric, edgeMetric].filter((metric): metric is HTMLElement => Boolean(metric));

  const timeline = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.8, defaults: { ease: "power2.out" } });
  timeline.set(nodes, { opacity: 0.24, scale: 0.72, transformOrigin: "center center" }, 0);
  timeline.set(metrics, { opacity: 0.38 }, 0);
  if (ui.liveDot) timeline.set(ui.liveDot, { opacity: 0.45, scale: 0.72 }, 0);

  paths.forEach((path, index) => {
    const length = path.getTotalLength();
    timeline.set(path, { strokeDasharray: length, strokeDashoffset: length * 0.76, opacity: 0.34 }, 0);
    timeline.to(path, { strokeDashoffset: 0, opacity: 1, duration: 0.78 }, 0.2 + index * 0.08);
  });

  timeline.call(() => ui.setReadout("event received", "T+000ms"), [], 0);
  if (eventNode) timeline.to(eventNode, { opacity: 1, scale: 1.35, duration: 0.18, repeat: 1, yoyo: true }, 0.04);
  if (triggerMetric) timeline.to(triggerMetric, { opacity: 1, duration: 0.22 }, 0.08);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.35, duration: 0.2, repeat: 1, yoyo: true }, 0.06);

  timeline.call(() => ui.setReadout("scanning", "T+184ms"), [], 0.52);
  if (quoteNodes.length > 0) timeline.to(quoteNodes, { opacity: 1, scale: 1, duration: 0.28, stagger: 0.08 }, 0.54);

  timeline.call(() => ui.setReadout("pair matched", "T+326ms"), [], 1.08);
  if (pairNode) timeline.to(pairNode, { opacity: 1, scale: 1.5, duration: 0.2, repeat: 1, yoyo: true }, 1.08);
  if (pairMetric) timeline.to(pairMetric, { opacity: 1, duration: 0.24 }, 1.12);

  timeline.call(() => ui.setReadout("gate passed", "T+412ms"), [], 1.58);
  if (passNode) timeline.to(passNode, { opacity: 1, scale: 1.45, duration: 0.2, repeat: 1, yoyo: true }, 1.58);
  if (edgeMetric) timeline.to(edgeMetric, { opacity: 1, duration: 0.24 }, 1.62);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.2, duration: 0.38, repeat: 3, yoyo: true }, 1.58);

  timeline.call(() => ui.setReadout("listening", "replay loop"), [], 3.18);
  timeline.to(nodes, { opacity: 0.42, duration: 0.34 }, 3.18);

  return connectLiveLoop(asset, timeline, ui);
}

function animateQuoteWindow(asset: SVGSVGElement): MotionCleanup {
  const ui = getLiveLoopUi(asset, "quote-window");
  const paths = Array.from(asset.querySelectorAll<SVGPathElement>("[data-gsap-draw]"));
  const nodes = Array.from(asset.querySelectorAll<SVGGraphicsElement>("[data-gsap-node]"));
  const eventNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="event"]');
  const captureNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="capture"]');
  const normalizedNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="normalized"]');
  const captureSurface = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage-surface="capture"]');
  const eventMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="event"]');
  const captureMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="capture"]');
  const normalizedMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="normalized"]');
  const metrics = [eventMetric, captureMetric, normalizedMetric].filter((metric): metric is HTMLElement => Boolean(metric));

  const timeline = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.8, defaults: { ease: "power2.out" } });
  timeline.set(nodes, { opacity: 0.24, scale: 0.72, transformOrigin: "center center" }, 0);
  timeline.set(metrics, { opacity: 0.38 }, 0);
  if (captureSurface) timeline.set(captureSurface, { opacity: 0.28 }, 0);
  if (ui.liveDot) timeline.set(ui.liveDot, { opacity: 0.45, scale: 0.72 }, 0);

  paths.forEach((path, index) => {
    const length = path.getTotalLength();
    timeline.set(path, { strokeDasharray: length, strokeDashoffset: length * 0.8, opacity: 0.32 }, 0);
    timeline.to(path, { strokeDashoffset: 0, opacity: 1, duration: 0.94 }, 0.18 + index * 0.08);
  });

  timeline.call(() => ui.setReadout("event received", "T+000ms"), [], 0);
  if (eventNode) timeline.to(eventNode, { opacity: 1, scale: 1.35, duration: 0.2, repeat: 1, yoyo: true }, 0.04);
  if (eventMetric) timeline.to(eventMetric, { opacity: 1, duration: 0.24 }, 0.08);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.35, duration: 0.2, repeat: 1, yoyo: true }, 0.06);

  timeline.call(() => ui.setReadout("capture open", "T+800ms"), [], 0.82);
  if (captureNode) timeline.to(captureNode, { opacity: 1, scale: 1.5, duration: 0.22, repeat: 1, yoyo: true }, 0.82);
  if (captureSurface) timeline.to(captureSurface, { opacity: 1, duration: 0.28, repeat: 1, yoyo: true }, 0.76);
  if (captureMetric) timeline.to(captureMetric, { opacity: 1, duration: 0.24 }, 0.86);

  timeline.call(() => ui.setReadout("pair normalized", "T+3,000ms"), [], 1.64);
  if (normalizedNode) timeline.to(normalizedNode, { opacity: 1, scale: 1.45, duration: 0.22, repeat: 1, yoyo: true }, 1.64);
  if (normalizedMetric) timeline.to(normalizedMetric, { opacity: 1, duration: 0.24 }, 1.68);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.2, duration: 0.36, repeat: 3, yoyo: true }, 1.64);

  timeline.call(() => ui.setReadout("listening", "replay loop"), [], 3.04);
  timeline.to(nodes, { opacity: 0.42, duration: 0.34 }, 3.04);

  return connectLiveLoop(asset, timeline, ui);
}

function animateExecutionProtocol(asset: SVGSVGElement): MotionCleanup {
  const ui = getLiveLoopUi(asset, "execution-protocol");
  const stages = ["wake", "verify", "pair", "guard"] as const;
  const views = Array.from(ui.panel?.querySelectorAll<SVGSVGElement>("[data-gsap-protocol-view]") ?? [asset]);
  const segmentNames = ["wake-verify", "verify-pair", "pair-guard"] as const;
  const segments = segmentNames.map((name) =>
    views.flatMap((view) => Array.from(view.querySelectorAll<SVGPathElement>(`[data-gsap-protocol-segment="${name}"]`))),
  );
  const stageNodes = stages.map((stage) =>
    views.flatMap((view) => Array.from(view.querySelectorAll<SVGGraphicsElement>(`[data-gsap-stage="${stage}"]`))),
  );
  const metrics = stages.map((stage) => ui.panel?.querySelector<HTMLElement>(`[data-gsap-live-metric="${stage}"]`) ?? null);
  const visibleNodes = stageNodes.flat();
  const visibleMetrics = metrics.filter((metric): metric is HTMLElement => Boolean(metric));
  const results = views.flatMap((view) => Array.from(view.querySelectorAll<SVGGraphicsElement>("[data-gsap-protocol-result]")));

  const timeline = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.8, defaults: { ease: "power2.out" } });
  timeline.set(visibleNodes, { opacity: 0.24, scale: 0.76, transformOrigin: "center center" }, 0);
  timeline.set(visibleMetrics, { opacity: 0.38 }, 0);
  timeline.set(results, { opacity: 0.18, x: -8 }, 0);
  if (ui.liveDot) timeline.set(ui.liveDot, { opacity: 0.45, scale: 0.72 }, 0);

  segments.flat().forEach((segment) => {
    const length = segment.getTotalLength();
    timeline.set(segment, { strokeDasharray: length, strokeDashoffset: length, opacity: 0.28 }, 0);
  });

  const activateStage = (index: number, status: string, position: number) => {
    timeline.call(() => ui.setReadout(status, `0${index + 1} / 04`), [], position);
    const nodes = stageNodes[index];
    const metric = metrics[index];
    if (nodes?.length) timeline.to(nodes, { opacity: 1, scale: 1.18, duration: 0.2, repeat: 1, yoyo: true }, position + 0.02);
    if (metric) timeline.to(metric, { opacity: 1, duration: 0.24 }, position + 0.04);
    if (index === 0 && ui.liveDot) {
      timeline.to(ui.liveDot, { opacity: 1, scale: 1.35, duration: 0.2, repeat: 1, yoyo: true }, position + 0.02);
    }
  };

  const drawSegment = (index: number, position: number) => {
    const stageSegments = segments[index];
    if (stageSegments?.length) timeline.to(stageSegments, { strokeDashoffset: 0, opacity: 1, duration: 0.46 }, position);
  };

  activateStage(0, "event received", 0);
  drawSegment(0, 0.34);
  activateStage(1, "terms aligned", 0.82);
  drawSegment(1, 1.16);
  activateStage(2, "depth locked", 1.64);
  drawSegment(2, 1.98);
  activateStage(3, "guard passed", 2.46);

  timeline.to(results, { opacity: 1, x: 0, duration: 0.32 }, 2.54);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.2, duration: 0.34, repeat: 3, yoyo: true }, 2.48);

  timeline.call(() => ui.setReadout("listening", "replay loop"), [], 3.7);
  timeline.to(visibleNodes, { opacity: 0.42, duration: 0.34 }, 3.7);

  return connectLiveLoop(asset, timeline, ui, "loop ready", "sequence idle");
}

function animateAsset(asset: SVGSVGElement): MotionCleanup {
  if (asset.dataset.gsapAsset === "event-edge-route") return animateEventEdgeRoute(asset);
  if (asset.dataset.gsapAsset === "quote-window") return animateQuoteWindow(asset);
  if (asset.dataset.gsapAsset === "execution-protocol") return animateExecutionProtocol(asset);

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

  return () => {
    timeline.scrollTrigger?.kill();
    timeline.kill();
  };
}

function setupLandingMotion(root: HTMLDivElement): MotionCleanup {
  let motionCleanups: MotionCleanup[] = [];
  const context = gsap.context(() => {
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

    motionCleanups = Array.from(root.querySelectorAll<SVGSVGElement>("[data-gsap-asset]")).map(animateAsset);
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
