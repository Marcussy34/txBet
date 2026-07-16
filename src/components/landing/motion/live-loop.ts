import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export type MotionCleanup = () => void;

export type LiveLoopTimeline = ReturnType<typeof gsap.timeline>;

export type LiveLoopName = "event-edge" | "quote-window" | "execution-protocol";

export type LiveLoopUi = {
  panel: HTMLElement | null;
  status: HTMLElement | null;
  clock: HTMLElement | null;
  liveDot: HTMLElement | null;
  toggle: HTMLButtonElement | null;
  pauseIcon: SVGElement | null;
  playIcon: SVGElement | null;
  setReadout: (status: string, clock: string) => void;
};

export function getLiveLoopUi(asset: SVGSVGElement, loopName: LiveLoopName): LiveLoopUi {
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

export function connectLiveLoop(
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
