import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (importOriginal) => {
  const motion = await importOriginal<typeof import("motion/react")>();

  return {
    ...motion,
    useReducedMotion: () => true,
  };
});

import nextConfig from "../next.config";
import { TxBetLanding } from "../src/components/landing/txbet-landing";

describe("landing page resilience", () => {
  it("allows the loopback address used by the local preview", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });

  it("keeps core content visible before client hydration", () => {
    const markup = renderToStaticMarkup(createElement(TxBetLanding));

    expect(markup).toContain("The match moves");
    expect(markup).toContain("TxLINE smoke boundary");
    expect(markup).toContain('href="#system"');
    expect(markup).toContain("Event in.");
    expect(markup).toContain("Event-to-edge route");
    expect(markup).toContain('data-gsap-loop="event-edge"');
    expect(markup).toContain('data-section-language="reaction-tape"');
    expect(markup).toContain('data-gsap-live-status="true"');
    expect(markup).toContain("loop ready");
    expect(markup).toContain('aria-label="Pause event loop"');
    expect(markup).toContain("Speed finds it");
    expect(markup).toContain("Execution protocol route");
    expect(markup).toContain('data-gsap-loop="execution-protocol"');
    expect(markup).toContain('data-section-language="execution-interlock"');
    expect(markup.match(/data-gsap-asset="execution-protocol"/g)).toHaveLength(1);
    expect(markup.match(/data-gsap-protocol-view="true"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Pause protocol loop"');
    expect(markup).toContain('id="protocol"');
    expect(markup).toContain('data-gsap-beam="true"');
    expect(markup).toContain('data-gsap-flank="match"');
    expect(markup).toContain('data-gsap-flank="reprice"');
    expect(markup).toContain("T+800");
    expect(markup).not.toContain("data-gsap-beam-arcs");
    expect(markup).toContain('data-gsap-reveal="true"');
    expect(markup).toContain("Quote convergence window");
    expect(markup).toContain('data-gsap-loop="quote-window"');
    expect(markup).toContain('data-section-language="timing-corridor"');
    expect(markup).toContain('data-section-language="venue-coverage"');
    expect(markup).toContain("Polymarket");
    expect(markup).toContain("Hyperliquid");
    expect(markup).not.toContain("Hydromancer");
    expect(markup).not.toContain(">Rain<");
    expect(markup).toContain('aria-label="Pause quote loop"');
    expect(markup).toContain('id="market-window"');
    expect(markup).not.toContain("TxLINE smoke boundary / 001");
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).not.toContain("opacity:0");
  });

  it("keeps the reduced-motion first render aligned with the server stage", () => {
    const markup = renderToStaticMarkup(createElement(TxBetLanding));

    expect(markup).toContain('style="transform:scaleX(0.72) scaleY(0.58)"');
  });
});
