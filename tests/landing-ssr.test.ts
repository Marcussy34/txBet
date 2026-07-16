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
    expect(markup).toContain("See the gap");
    expect(markup).toContain("Speed finds it");
    expect(markup).toContain('data-gsap-beam="true"');
    expect(markup).toContain('data-gsap-reveal="true"');
    expect(markup).toContain("Quote convergence window");
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).not.toContain("opacity:0");
  });

  it("keeps the reduced-motion first render aligned with the server stage", () => {
    const markup = renderToStaticMarkup(createElement(TxBetLanding));

    expect(markup).toContain('style="transform:scaleX(0.72) scaleY(0.58)"');
  });
});
