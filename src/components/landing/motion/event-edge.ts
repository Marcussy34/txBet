import { gsap } from "gsap";

import {
  connectLiveLoop,
  getLiveLoopUi,
  type MotionCleanup,
} from "@/components/landing/motion/live-loop";

type MetricName = "trigger" | "pair" | "fees" | "edge";

const metricTargets: Record<MetricName, number> = {
  trigger: 63,
  pair: 0.94,
  // Published Jul 2026 schedules: Polymarket 0.05 + Kalshi 0.07 p(1−p) curves on the two legs.
  fees: 0.029,
  edge: 0.031,
};

function formatMetric(name: MetricName, value: number) {
  if (name === "trigger") return `${Math.round(value).toString().padStart(2, "0")}:00`;
  if (name === "pair" || name === "fees") return `$${value.toFixed(3)}`;
  return `+$${value.toFixed(3)}`;
}

function setMetricTone(metric: HTMLElement, active: boolean) {
  metric.classList.toggle("text-success", active);
  metric.classList.toggle("text-foreground", !active);
}

export function animateEventEdgeRoute(asset: SVGSVGElement): MotionCleanup {
  const ui = getLiveLoopUi(asset, "event-edge");
  const paths = Array.from(asset.querySelectorAll<SVGPathElement>("[data-gsap-draw]"));
  const nodes = Array.from(asset.querySelectorAll<SVGGraphicsElement>("[data-gsap-node]"));
  const packets = Array.from(asset.querySelectorAll<SVGPathElement>("[data-gsap-packet]"));
  const trails = Array.from(asset.querySelectorAll<SVGPathElement>("[data-gsap-packet-trail]"));
  const eventNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="event"]');
  const splitNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="split"]');
  const quoteNodes = Array.from(asset.querySelectorAll<SVGGraphicsElement>('[data-gsap-stage="quote"]'));
  const pairNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="pair"]');
  const gateNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="gate"]');
  const passNode = asset.querySelector<SVGGraphicsElement>('[data-gsap-stage="pass"]');
  const desktopLedger = ui.panel?.querySelector<HTMLElement>('[data-gsap-ledger="desktop"]');
  const ledgerRows = Array.from(desktopLedger?.querySelectorAll<HTMLElement>("[data-gsap-ledger-row]") ?? []);
  const qualifyingRows = Array.from(ui.panel?.querySelectorAll<HTMLElement>('[data-gsap-ledger-row="qualifying"]') ?? []);
  const statusGlyph = ui.panel?.querySelector<HTMLElement>("[data-gsap-status-glyph]") ?? null;
  const sparkline = ui.panel?.querySelector<SVGPolylineElement>("[data-gsap-edge-sparkline]") ?? null;
  const metricValues: Record<MetricName, HTMLElement | null> = {
    trigger: ui.panel?.querySelector<HTMLElement>('[data-gsap-metric-value="trigger"]') ?? null,
    pair: ui.panel?.querySelector<HTMLElement>('[data-gsap-metric-value="pair"]') ?? null,
    fees: ui.panel?.querySelector<HTMLElement>('[data-gsap-metric-value="fees"]') ?? null,
    edge: ui.panel?.querySelector<HTMLElement>('[data-gsap-metric-value="edge"]') ?? null,
  };
  const metrics = Object.values(metricValues).filter((metric): metric is HTMLElement => Boolean(metric));

  const timeline = gsap.timeline({
    paused: true,
    repeat: -1,
    repeatDelay: 0.9,
    defaults: { ease: "power2.out" },
  });
  let sparklineTween: ReturnType<typeof gsap.fromTo> | null = null;

  // Success outcome markers stay legible at rest; only waypoint nodes dim fully.
  const outcomeNodes = [pairNode, passNode].filter((node): node is SVGGraphicsElement => Boolean(node));
  const transientNodes = nodes.filter((node) => !outcomeNodes.includes(node));

  timeline.set(transientNodes, { opacity: 0.24, scale: 0.72, transformOrigin: "center center" }, 0);
  timeline.set(outcomeNodes, { opacity: 0.4, scale: 0.85, transformOrigin: "center center" }, 0);
  timeline.set(metrics, { opacity: 0.48 }, 0);
  timeline.set(ledgerRows, { opacity: 0.4 }, 0);
  timeline.set(qualifyingRows, { opacity: 0.4 }, 0);
  timeline.set([...packets, ...trails], { opacity: 0 }, 0);
  if (statusGlyph) timeline.set(statusGlyph, { scale: 1, transformOrigin: "center center" }, 0);
  if (ui.liveDot) timeline.set(ui.liveDot, { opacity: 0.45, scale: 0.72 }, 0);

  // The tape advances one deterministic row every 90ms and holds the trigger.
  ledgerRows.forEach((row, index) => {
    const at = 0.04 + index * 0.09;
    const qualifying = row.dataset.gsapLedgerRow === "qualifying";
    timeline.to(row, { opacity: 1, duration: 0.06 }, at);
    if (!qualifying) timeline.to(row, { opacity: 0.4, duration: 0.03 }, at + 0.06);
  });
  timeline.to(qualifyingRows, { opacity: 1, duration: 0.08 }, 0.49);

  paths.forEach((path, index) => {
    const length = path.getTotalLength();
    timeline.set(path, { strokeDasharray: length, strokeDashoffset: length * 0.78, opacity: 0.32 }, 0);
    timeline.to(path, { strokeDashoffset: 0, opacity: 1, duration: 0.88 }, 0.64 + index * 0.06);
  });

  const addCourier = (name: string, start: number, duration: number, ease: string) => {
    const packet = packets.find((candidate) => candidate.dataset.gsapPacket === name);
    const trail = trails.find((candidate) => candidate.dataset.gsapPacketTrail === name);
    if (!packet || !trail) return;

    const length = packet.getTotalLength();
    timeline.set(packet, {
      strokeDasharray: `16 ${length + 16}`,
      strokeDashoffset: 16,
      opacity: 1,
    }, start);
    timeline.set(trail, {
      strokeDasharray: `30 ${length + 30}`,
      strokeDashoffset: 30,
      opacity: 0.34,
    }, start);
    timeline.to(packet, { strokeDashoffset: -length, duration, ease }, start);
    timeline.to(trail, { strokeDashoffset: -length, duration: duration + 0.05, ease }, start);
    timeline.to(packet, { opacity: 0, duration: 0.08 }, start + duration - 0.08);
    timeline.to(trail, { opacity: 0, duration: 0.12 }, start + duration - 0.04);
  };

  addCourier("source", 0.62, 0.28, "power2.in");
  addCourier("yes", 0.9, 0.72, "power2.in");
  addCourier("no", 0.9, 0.72, "power2.in");
  addCourier("gate", 1.64, 0.38, "power2.out");

  const addMetricCount = (name: MetricName, start: number) => {
    const metric = metricValues[name];
    if (!metric) return;

    const counter = { value: 0 };
    timeline.call(() => {
      metric.textContent = formatMetric(name, 0);
      setMetricTone(metric, true);
    }, [], start);
    timeline.to(counter, {
      value: metricTargets[name],
      duration: 0.5,
      ease: "power2.out",
      onUpdate: () => {
        metric.textContent = formatMetric(name, counter.value);
      },
    }, start);
    timeline.call(() => setMetricTone(metric, false), [], start + 0.26);
  };

  timeline.call(() => ui.setReadout("event locked", "T+000ms"), [], 0.5);
  if (eventNode) timeline.to(eventNode, { opacity: 1, scale: 1.35, duration: 0.18, repeat: 1, yoyo: true }, 0.5);
  if (splitNode) timeline.to(splitNode, { opacity: 1, scale: 1.2, duration: 0.16, repeat: 1, yoyo: true }, 0.78);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.35, duration: 0.18, repeat: 1, yoyo: true }, 0.5);
  addMetricCount("trigger", 0.52);

  timeline.call(() => ui.setReadout("complements scanning", "T+184ms"), [], 0.92);
  if (quoteNodes.length > 0) timeline.to(quoteNodes, { opacity: 1, scale: 1, duration: 0.24, stagger: 0.08 }, 0.94);

  timeline.call(() => ui.setReadout("pair matched", "T+326ms"), [], 1.58);
  if (pairNode) {
    timeline.to(pairNode, { opacity: 1, scale: 1.5, duration: 0.18 }, 1.58);
    timeline.to(pairNode, { scale: 1, duration: 0.16 }, 1.76);
  }
  addMetricCount("pair", 1.54);

  addMetricCount("fees", 1.7);
  timeline.call(() => ui.setReadout("cost gate passed", "T+412ms"), [], 1.9);
  if (gateNode) timeline.to(gateNode, { opacity: 1, scale: 1.08, duration: 0.16, repeat: 1, yoyo: true }, 1.82);
  if (passNode) {
    timeline.to(passNode, { opacity: 1, scale: 1.45, duration: 0.18 }, 1.96);
    timeline.to(passNode, { scale: 1, duration: 0.16 }, 2.14);
  }
  if (statusGlyph) timeline.to(statusGlyph, { scale: 1.2, duration: 0.1, repeat: 1, yoyo: true }, 1.96);
  if (ui.liveDot) timeline.to(ui.liveDot, { opacity: 1, scale: 1.2, duration: 0.18, repeat: 1, yoyo: true }, 1.96);
  addMetricCount("edge", 1.88);

  // The edge trace draws once, on its first visible loop, then remains complete.
  timeline.call(() => {
    if (!sparkline || sparklineTween) return;
    const length = sparkline.getTotalLength();
    sparklineTween = gsap.fromTo(
      sparkline,
      { strokeDasharray: length, strokeDashoffset: length },
      { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" },
    );
  }, [], 1.88);

  timeline.call(() => ui.setReadout("listening", "replay loop"), [], 3.75);
  timeline.to(transientNodes, { opacity: 0.42, duration: 0.35 }, 3.75);

  const disconnect = connectLiveLoop(asset, timeline, ui);
  return () => {
    sparklineTween?.kill();
    disconnect();
    metrics.forEach((metric) => {
      const name = metric.dataset.gsapMetricValue as MetricName;
      metric.textContent = formatMetric(name, metricTargets[name]);
      setMetricTone(metric, false);
    });
    gsap.set([...paths, ...nodes, ...packets, ...trails, ...ledgerRows, ...qualifyingRows, ...metrics], {
      clearProps: "opacity,transform,strokeDasharray,strokeDashoffset",
    });
    if (statusGlyph) gsap.set(statusGlyph, { clearProps: "transform" });
    if (sparkline) gsap.set(sparkline, { clearProps: "strokeDasharray,strokeDashoffset" });
  };
}
