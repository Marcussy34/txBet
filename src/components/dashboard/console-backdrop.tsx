"use client";

import { useEffect, useState } from "react";

import { FlickeringGrid } from "@/components/ui/flickering-grid";

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const query = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const updatePreference = () => setReducedMotion(query?.matches ?? false);
    const timer = window.setTimeout(updatePreference, 0);

    query?.addEventListener?.("change", updatePreference);
    return () => {
      window.clearTimeout(timer);
      query?.removeEventListener?.("change", updatePreference);
    };
  }, []);

  return reducedMotion;
}

export function ConsoleBackdrop() {
  const reducedMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [color, setColor] = useState("#9E9E9E");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Resolve the brand token so the canvas stays on the monochrome palette.
      const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      setColor(primary || "#9E9E9E");
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  // Reduced motion kills the effect; the grid pauses off-screen and hidden-tab rAF pauses natively.
  if (!mounted || reducedMotion || typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") {
    return null;
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {/* The radial mask keeps whisper contrast near the hero and away from dense panels. */}
      <FlickeringGrid
        className="size-full [mask-image:radial-gradient(ellipse_120%_70%_at_50%_-10%,#000_30%,transparent_78%)]"
        color={color}
        squareSize={3}
        gridGap={8}
        flickerChance={0.08}
        maxOpacity={0.12}
      />
    </div>
  );
}
