import { animateAgentTelemetry } from "@/components/landing/motion/agent-telemetry";
import { animateEventEdgeRoute } from "@/components/landing/motion/event-edge";
import { animateExecutionProtocol } from "@/components/landing/motion/execution-protocol";
import type { MotionCleanup } from "@/components/landing/motion/live-loop";
import { animateQuoteWindow } from "@/components/landing/motion/quote-window";

export const LOOP_REGISTRY: Record<string, (asset: SVGSVGElement) => MotionCleanup> = {
  "event-edge-route": animateEventEdgeRoute,
  "quote-window": animateQuoteWindow,
  "execution-protocol": animateExecutionProtocol,
  "agent-telemetry": animateAgentTelemetry,
};
