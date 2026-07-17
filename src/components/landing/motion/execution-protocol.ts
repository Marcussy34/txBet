import { gsap } from "gsap";

import {
  connectLiveLoop,
  getLiveLoopUi,
  type MotionCleanup,
} from "@/components/landing/motion/live-loop";

const stages = ["wake", "verify", "pair", "guard"] as const;
const gateCodes = ["01", "02", "03", "04"] as const;

// The cadence survives timeline invalidation so every fourth visible loop refuses.
let protocolCycle = 0;

export function animateExecutionProtocol(asset: SVGSVGElement): MotionCleanup {
  const ui = getLiveLoopUi(asset, "execution-protocol");
  const section = asset.closest<HTMLElement>("#protocol") ?? ui.panel;
  const views = Array.from(ui.panel?.querySelectorAll<SVGSVGElement>("[data-gsap-protocol-view]") ?? [asset]);
  const queryViews = <ElementType extends Element>(selector: string) =>
    views.flatMap((view) => Array.from(view.querySelectorAll<ElementType>(selector)));

  const segmentNames = ["wake-verify", "verify-pair", "pair-guard"] as const;
  const segments = segmentNames.map((name) => queryViews<SVGPathElement>(`[data-gsap-protocol-segment="${name}"]`));
  const gates = gateCodes.map((code) => queryViews<SVGGraphicsElement>(`[data-gsap-gate="${code}"]`));
  const leftSlabs = gates.map((stageGates) =>
    stageGates.flatMap((gate) => Array.from(gate.querySelectorAll<SVGGraphicsElement>('[data-gsap-gate-slab="left"]'))),
  );
  const rightSlabs = gates.map((stageGates) =>
    stageGates.flatMap((gate) => Array.from(gate.querySelectorAll<SVGGraphicsElement>('[data-gsap-gate-slab="right"]'))),
  );
  const chips = gates.map((stageGates) =>
    stageGates.flatMap((gate) => Array.from(gate.querySelectorAll<SVGGraphicsElement>("[data-gsap-gate-chip]"))),
  );
  const metrics = stages.map((stage) => ui.panel?.querySelector<HTMLElement>(`[data-gsap-live-metric="${stage}"]`) ?? null);
  const ledgerRows = stages.map(
    (stage) => section?.querySelector<HTMLElement>(`[data-gsap-protocol-ledger-row="${stage}"]`) ?? null,
  );
  const ledgerPassGlyphs = ledgerRows.map(
    (row) => row?.querySelector<HTMLElement>("[data-gsap-protocol-ledger-pass]") ?? null,
  );
  const guardLedgerWarning = ledgerRows[3]?.querySelector<HTMLElement>("[data-gsap-protocol-ledger-warning]") ?? null;
  const guardCardPass = ui.panel?.querySelector<HTMLElement>("[data-gsap-protocol-card-pass]") ?? null;
  const guardCardWarning = ui.panel?.querySelector<HTMLElement>("[data-gsap-protocol-card-warning]") ?? null;
  const packets = queryViews<SVGPathElement>("[data-gsap-protocol-packet]");
  const results = queryViews<SVGGraphicsElement>("[data-gsap-protocol-result]");
  const refusals = queryViews<SVGGraphicsElement>("[data-gsap-refusal]");
  const refusalPackets = queryViews<SVGPathElement>("[data-gsap-refusal-packet]");
  const visibleMetrics = metrics.filter((metric): metric is HTMLElement => Boolean(metric));
  const visibleLedgerRows = ledgerRows.filter((row): row is HTMLElement => Boolean(row));
  const visibleLedgerPassGlyphs = ledgerPassGlyphs.filter((glyph): glyph is HTMLElement => Boolean(glyph));
  const isRefusal = () => protocolCycle % 4 === 3;

  const timeline = gsap.timeline({
    paused: true,
    repeat: -1,
    repeatDelay: 0.9,
    defaults: { ease: "power2.out" },
    onRepeat: () => {
      protocolCycle += 1;
      timeline.invalidate();
    },
  });

  timeline.set(gates.flat(), { opacity: 0.42 }, 0);
  timeline.set(leftSlabs.flat(), { x: 5 }, 0);
  timeline.set(rightSlabs.flat(), { x: -5 }, 0);
  timeline.set(chips.flat(), { opacity: 0 }, 0);
  timeline.set(visibleMetrics, { opacity: 0.34 }, 0);
  timeline.set(visibleLedgerRows, { opacity: 0.34, x: -3 }, 0);
  timeline.set(visibleLedgerPassGlyphs, { opacity: 0 }, 0);
  timeline.set(results, { opacity: 0, x: -8 }, 0);
  // The refusal exit is invisible on pass cycles; it exists only while the guard refuses.
  timeline.set(refusals, { opacity: 0 }, 0);
  timeline.set(refusalPackets, { opacity: 0, strokeDashoffset: 0 }, 0);
  if (guardLedgerWarning) timeline.set(guardLedgerWarning, { opacity: 0 }, 0);
  if (guardCardPass) timeline.set(guardCardPass, { opacity: 0 }, 0);
  if (guardCardWarning) timeline.set(guardCardWarning, { opacity: 0 }, 0);
  if (ui.liveDot) timeline.set(ui.liveDot, { opacity: 0.45, scale: 0.72 }, 0);

  segments.flat().forEach((segment) => {
    const length = segment.getTotalLength();
    timeline.set(segment, { strokeDasharray: length, strokeDashoffset: length, opacity: 0.24 }, 0);
  });
  packets.forEach((packet) => {
    const length = packet.getTotalLength();
    timeline.set(packet, { strokeDasharray: `28 ${length}`, strokeDashoffset: 0, opacity: 0.92 }, 0);
  });
  refusalPackets.forEach((packet) => {
    const length = packet.getTotalLength();
    timeline.set(packet, { strokeDasharray: `24 ${length}`, strokeDashoffset: 0 }, 0);
  });

  const activateStage = (index: number, status: string, position: number) => {
    const refusalAware = index === 3;
    const stageGates = gates[index];
    const stageLeftSlabs = leftSlabs[index];
    const stageRightSlabs = rightSlabs[index];
    const stageChips = chips[index];
    const metric = metrics[index];
    const ledgerRow = ledgerRows[index];
    const ledgerPassGlyph = ledgerPassGlyphs[index];

    timeline.call(
      () => ui.setReadout(refusalAware && isRefusal() ? "guard refused" : status, `0${index + 1} / 04`),
      [],
      position,
    );
    timeline.to(stageGates, { opacity: 1, duration: 0.15 }, position);
    timeline.to(
      stageLeftSlabs,
      { x: () => (refusalAware && isRefusal() ? 5 : 0), duration: 0.15 },
      position,
    );
    timeline.to(
      stageRightSlabs,
      { x: () => (refusalAware && isRefusal() ? -5 : 0), duration: 0.15 },
      position,
    );
    timeline.to(
      stageChips,
      { opacity: () => (refusalAware && isRefusal() ? 0 : 1), duration: 0.2 },
      position + 0.06,
    );
    if (metric) {
      timeline.to(metric, { opacity: () => (refusalAware && isRefusal() ? 0.44 : 1), duration: 0.22 }, position + 0.04);
    }
    if (ledgerRow) timeline.to(ledgerRow, { opacity: 1, x: 0, duration: 0.2 }, position + 0.02);
    if (ledgerPassGlyph) {
      timeline.to(
        ledgerPassGlyph,
        { opacity: () => (refusalAware && isRefusal() ? 0 : 1), duration: 0.18 },
        position + 0.04,
      );
    }
    if (index === 0 && ui.liveDot) {
      timeline.to(ui.liveDot, { opacity: 1, scale: 1.35, duration: 0.18, repeat: 1, yoyo: true }, position);
    }
  };

  const drawSegment = (index: number, position: number, duration: number) => {
    const stageSegments = segments[index];
    timeline.to(
      stageSegments,
      {
        strokeDashoffset: (_targetIndex, target: SVGPathElement) =>
          index === 2 && isRefusal() ? target.getTotalLength() * 0.1 : 0,
        opacity: 1,
        duration,
        ease: "none",
      },
      position,
    );
  };

  timeline.to(
    packets,
    {
      strokeDashoffset: (_targetIndex, target: SVGPathElement) => -target.getTotalLength() * 0.7,
      duration: 2.35,
      ease: "none",
    },
    0.08,
  );
  timeline.to(
    packets,
    {
      strokeDashoffset: (_targetIndex, target: SVGPathElement) =>
        -target.getTotalLength() * (isRefusal() ? Number(target.dataset.gsapProtocolStop ?? 0.88) : 1),
      duration: 0.64,
      ease: "power2.out",
    },
    2.43,
  );

  activateStage(0, "event received", 0.14);
  drawSegment(0, 0.2, 0.8);
  activateStage(1, "terms aligned", 1.04);
  drawSegment(1, 1.1, 0.92);
  activateStage(2, "depth locked", 2.06);
  drawSegment(2, 2.12, 0.7);
  activateStage(3, "guard passed", 2.84);

  timeline.to(
    results,
    { opacity: () => (isRefusal() ? 0 : 1), x: () => (isRefusal() ? -8 : 0), duration: 0.28 },
    2.94,
  );
  timeline.to(refusals, { opacity: () => (isRefusal() ? 1 : 0), duration: 0.24 }, 2.98);
  timeline.to(
    refusalPackets,
    {
      opacity: () => (isRefusal() ? 1 : 0),
      strokeDashoffset: (_targetIndex, target: SVGPathElement) => (isRefusal() ? -target.getTotalLength() : 0),
      duration: 0.56,
      ease: "power2.out",
    },
    3.02,
  );
  if (guardLedgerWarning) {
    timeline.to(guardLedgerWarning, { opacity: () => (isRefusal() ? 1 : 0), duration: 0.18 }, 2.88);
  }
  if (guardCardPass) {
    timeline.to(guardCardPass, { opacity: () => (isRefusal() ? 0 : 1), duration: 0.18 }, 2.88);
  }
  if (guardCardWarning) {
    timeline.to(guardCardWarning, { opacity: () => (isRefusal() ? 1 : 0), duration: 0.18 }, 2.88);
  }
  if (ui.liveDot) {
    timeline.to(
      ui.liveDot,
      { opacity: 1, scale: () => (isRefusal() ? 0.9 : 1.2), duration: 0.26, repeat: 2, yoyo: true },
      2.9,
    );
  }

  // The courier fades once delivered so no dash is left parked beside gate 04.
  timeline.to(packets, { opacity: 0, duration: 0.28, ease: "power2.in" }, 3.3);

  timeline.call(
    () => ui.setReadout(isRefusal() ? "guard refused" : "route passed", "04 / 04"),
    [],
    3.48,
  );
  // Hold the resolved state long enough to inspect before repeatDelay begins.
  timeline.call(() => undefined, [], 4.1);

  return connectLiveLoop(asset, timeline, ui, "loop ready", "sequence idle");
}
