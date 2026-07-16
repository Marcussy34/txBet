import { gsap } from "gsap";

import {
  connectLiveLoop,
  getLiveLoopUi,
  type MotionCleanup,
} from "@/components/landing/motion/live-loop";

type VenueOutcome = "IN WINDOW" | "LATE";

type VenueMotionRow = {
  element: HTMLElement;
  fill: HTMLElement | null;
  readout: HTMLElement | null;
  chip: HTMLElement | null;
  flash: HTMLElement | null;
  snapMs: number;
  outcome: VenueOutcome;
};

function formatMilliseconds(value: number) {
  return `${Math.round(value).toLocaleString("en-US")}ms`;
}

export function animateQuoteWindow(asset: SVGSVGElement): MotionCleanup {
  const ui = getLiveLoopUi(asset, "quote-window");
  const paths = Array.from(asset.querySelectorAll<SVGPathElement>("[data-gsap-draw]"));
  const graphic = asset.parentElement;
  const nodes = Array.from(graphic?.querySelectorAll<HTMLElement>("[data-gsap-node]") ?? []);
  const eventNode = graphic?.querySelector<HTMLElement>('[data-gsap-stage="event"]') ?? null;
  const captureNode = graphic?.querySelector<HTMLElement>('[data-gsap-stage="capture"]') ?? null;
  const normalizedNode = graphic?.querySelector<HTMLElement>('[data-gsap-stage="normalized"]') ?? null;
  const captureBand = ui.panel?.querySelector<HTMLElement>("[data-gsap-capture-band]") ?? null;
  const eventMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="event"]') ?? null;
  const captureMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="capture"]') ?? null;
  const normalizedMetric = ui.panel?.querySelector<HTMLElement>('[data-gsap-live-metric="normalized"]') ?? null;
  const metrics = [eventMetric, captureMetric, normalizedMetric].filter((metric): metric is HTMLElement => Boolean(metric));

  const venueRows: VenueMotionRow[] = Array.from(ui.panel?.querySelectorAll<HTMLElement>("[data-gsap-venue-row]") ?? []).map((element) => ({
    element,
    fill: element.querySelector<HTMLElement>("[data-gsap-venue-fill]"),
    readout: element.querySelector<HTMLElement>("[data-gsap-venue-readout]"),
    chip: element.querySelector<HTMLElement>("[data-gsap-venue-chip]"),
    flash: element.querySelector<HTMLElement>("[data-gsap-venue-flash]"),
    snapMs: Number(element.dataset.venueMs),
    outcome: element.dataset.venueOutcome === "IN WINDOW" ? "IN WINDOW" : "LATE",
  }));

  const timeline = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.9, defaults: { ease: "power2.out" } });
  timeline.set(nodes, { opacity: 0.24, scale: 0.72, transformOrigin: "center center" }, 0);
  timeline.set(metrics, { opacity: 0.42 }, 0);
  timeline.set(venueRows.map((row) => row.fill).filter(Boolean), { scaleX: 0, transformOrigin: "left center" }, 0);
  timeline.set(venueRows.map((row) => row.chip).filter(Boolean), { opacity: 0.24 }, 0);
  timeline.set(venueRows.map((row) => row.flash).filter(Boolean), { opacity: 0 }, 0);
  if (captureBand) timeline.set(captureBand, { opacity: 0.55 }, 0);
  if (ui.liveDot) timeline.set(ui.liveDot, { opacity: 0.45, scale: 0.72 }, 0);

  // Rewind only after the gated loop starts; server HTML remains fully resolved.
  timeline.call(() => {
    venueRows.forEach((row) => {
      if (row.readout) row.readout.textContent = "0ms";
      if (row.chip) row.chip.textContent = "WAITING";
    });
  }, [], 0);

  paths.forEach((path, index) => {
    const length = path.getTotalLength();
    timeline.set(path, { strokeDasharray: length, strokeDashoffset: length, opacity: 0.28 }, 0);
    timeline.to(path, { strokeDashoffset: 0, opacity: 1, duration: 0.88 }, 0.16 + index * 0.08);
  });

  timeline.call(() => ui.setReadout("event received", "T+000ms"), [], 0);
  if (eventNode) timeline.to(eventNode, { opacity: 1, scale: 1.35, duration: 0.075, repeat: 1, yoyo: true }, 0.04);
  if (eventMetric) timeline.to(eventMetric, { opacity: 1, duration: 0.15 }, 0.04);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.35, duration: 0.075, repeat: 1, yoyo: true }, 0.04);

  // One shared wall clock: every row counts at the ruler rate (3,000ms over 3.6s)
  // from a common origin, so readouts agree at any instant and stop at their snap.
  const sweepStart = 0.08;
  const sweepDuration = 3.6;
  const captureOpen = sweepStart + (600 / 3000) * sweepDuration;
  const captureClosed = sweepStart + (1100 / 3000) * sweepDuration;
  timeline.call(() => ui.setReadout("capture open", "T+600ms"), [], captureOpen);
  if (captureNode) timeline.to(captureNode, { opacity: 1, scale: 1.45, duration: 0.075, repeat: 1, yoyo: true }, captureOpen);
  if (captureBand) timeline.to(captureBand, { opacity: 1, duration: 0.075, repeat: 1, yoyo: true }, captureOpen);

  venueRows.forEach((row, index) => {
    const snapPosition = sweepStart + (row.snapMs / 3000) * sweepDuration;
    const countProxy = { value: 0 };

    if (row.fill) {
      timeline.to(row.fill, { scaleX: 1, duration: snapPosition - sweepStart, ease: "none" }, sweepStart);
    }

    timeline.to(countProxy, {
      value: row.snapMs,
      duration: snapPosition - sweepStart,
      ease: "none",
      onUpdate: () => {
        if (row.readout) row.readout.textContent = formatMilliseconds(countProxy.value);
      },
    }, sweepStart);

    const resolvePosition = row.outcome === "IN WINDOW" ? snapPosition : captureClosed;
    timeline.call(() => {
      if (row.chip) row.chip.textContent = row.outcome;
    }, [], resolvePosition);
    if (row.chip) timeline.to(row.chip, { opacity: 1, duration: 0.15 }, resolvePosition);
    if (row.flash) timeline.to(row.flash, { opacity: 1, duration: 0.075, repeat: 1, yoyo: true }, snapPosition);

    timeline.call(
      () => ui.setReadout(row.outcome === "IN WINDOW" ? `${row.element.dataset.gsapVenueRow} captured` : `${row.element.dataset.gsapVenueRow} repriced late`, formatMilliseconds(row.snapMs)),
      [],
      snapPosition + index * 0.01,
    );
  });

  timeline.call(() => ui.setReadout("capture closed", "T+1,100ms"), [], captureClosed);

  const animateMetric = (metric: HTMLElement | null, value: number, position: number) => {
    const valueElement = metric?.querySelector<HTMLElement>("[data-gsap-live-metric-value]") ?? null;
    const flash = metric?.querySelector<HTMLElement>("[data-gsap-live-metric-flash]") ?? null;
    const proxy = { value: 0 };
    if (!valueElement) return;

    timeline.call(() => {
      valueElement.textContent = "0 ms";
    }, [], 0);
    timeline.to(proxy, {
      value,
      duration: value === 0 ? 0.01 : 0.52,
      ease: "power2.out",
      onUpdate: () => {
        valueElement.textContent = `${Math.round(proxy.value).toLocaleString("en-US")} ms`;
      },
    }, position);
    if (flash) timeline.to(flash, { opacity: 1, duration: 0.075, repeat: 1, yoyo: true }, position + (value === 0 ? 0 : 0.52));
    timeline.to(metric, { opacity: 1, duration: 0.15 }, position);
  };

  animateMetric(eventMetric, 0, 0.04);
  animateMetric(captureMetric, 800, sweepStart + (800 / 3000) * sweepDuration - 0.52);
  animateMetric(normalizedMetric, 3000, sweepStart + sweepDuration - 0.52);

  timeline.call(() => ui.setReadout("pair normalized", "T+3,000ms"), [], 3.66);
  if (normalizedNode) timeline.to(normalizedNode, { opacity: 1, scale: 1.45, duration: 0.075, repeat: 1, yoyo: true }, 3.66);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.22, duration: 0.075, repeat: 1, yoyo: true }, 3.66);

  // Hold the complete state before the replay gap.
  timeline.call(() => ui.setReadout("listening", "replay loop"), [], 4.2);
  timeline.to(nodes, { opacity: 0.62, duration: 0.15 }, 4.2);
  timeline.call(() => undefined, [], 4.35);

  return connectLiveLoop(asset, timeline, ui);
}
