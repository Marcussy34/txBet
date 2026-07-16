"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  motion,
  useReducedMotion,
} from "motion/react";

import { TxBetMark } from "@/components/brand/txbet-brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* BRAND SPLASH STORYBOARD
 *    0ms shell, identity, and actions are visible in server HTML
 *  120ms the silver beam resolves to its full height
 *  260ms the split-gate mark settles against the center rail
 *  440ms the promise and actions settle into place
 */
export const BRAND_SPLASH_TIMING = {
  beam: 120,
  identity: 260,
  details: 440,
} as const;

export const BRAND_SPLASH_SPRING = {
  type: "spring" as const,
  stiffness: 280,
  damping: 28,
  mass: 0.8,
};

export function BrandSplash() {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      // Settle after hydration so the first client render still matches the server.
      const timer = window.setTimeout(() => setStage(3), 0);
      return () => window.clearTimeout(timer);
    }

    const timers = [
      window.setTimeout(() => setStage(1), BRAND_SPLASH_TIMING.beam),
      window.setTimeout(() => setStage(2), BRAND_SPLASH_TIMING.identity),
      window.setTimeout(() => setStage(3), BRAND_SPLASH_TIMING.details),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduceMotion]);

  const beamReady = stage >= 1;
  const identityReady = stage >= 2;
  const detailsReady = stage >= 3;
  const splashTransition = reduceMotion ? { duration: 0 } : BRAND_SPLASH_SPRING;

  return (
    <section data-brand-splash="true" aria-labelledby="brand-splash-title" className="relative isolate overflow-hidden border-b border-border">
      <div
        data-gsap-beam="true"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_0%,#000_8%,transparent_20%,transparent_80%,#000_94%,#000_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_8%,transparent_20%,transparent_80%,#000_94%,#000_100%)]"
      >
        <motion.div
          initial={false}
          animate={{ scaleY: beamReady ? 1 : 0.58, scaleX: beamReady ? 1 : 0.72 }}
          transition={splashTransition}
          className="absolute inset-y-0 left-1/2 w-[clamp(6rem,10vw,10rem)] -translate-x-1/2 bg-foreground/[0.035] shadow-[0_0_80px_32px_color-mix(in_oklch,var(--foreground),transparent_94%)]"
        />
        <motion.div
          initial={false}
          animate={{ scaleY: beamReady ? 1 : 0.3 }}
          transition={splashTransition}
          className="absolute inset-y-0 left-1/2 w-[clamp(1rem,2vw,2rem)] -translate-x-1/2 bg-foreground/[0.16] shadow-[0_0_32px_10px_color-mix(in_oklch,var(--foreground),transparent_82%)]"
        />
        <motion.div
          initial={false}
          animate={{ scaleY: beamReady ? 1 : 0.12 }}
          transition={splashTransition}
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/75 shadow-[0_0_18px_4px_color-mix(in_oklch,var(--foreground),transparent_55%)]"
        />
        <canvas
          data-gsap-beam-arcs
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 h-full w-[clamp(6rem,10vw,10rem)] -translate-x-1/2 text-foreground opacity-0"
        />
        <div
          data-gsap-beam-pulse
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-28 w-0.5 -ml-px bg-linear-to-b from-transparent via-foreground to-transparent opacity-0"
        />
        <div
          data-gsap-beam-tick
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[6%] left-1/2 h-px w-16 -ml-8 bg-foreground/50 opacity-0"
        />
      </div>

      <div className="mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-[1500px] flex-col px-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-20">
          <div className="relative z-0 flex w-full max-w-5xl flex-col items-center">
            <div data-gsap-lockup="true" className="relative isolate inline-flex items-center justify-center gap-[clamp(0.85rem,2vw,1.4rem)]">
              <div
                data-gsap-lockup-bloom
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[clamp(8rem,18vw,16rem)] w-[clamp(18rem,38vw,38rem)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--foreground),transparent_72%)_0%,transparent_70%)] opacity-0"
              />
              <motion.div
                initial={false}
                animate={{ x: identityReady ? 0 : 14 }}
                transition={splashTransition}
                className="flex shrink-0 items-center justify-center"
              >
                <TxBetMark className="size-[clamp(4.75rem,7.6vw,7.25rem)]" />
              </motion.div>
              <motion.div
                initial={false}
                animate={{ x: identityReady ? 0 : -14 }}
                transition={splashTransition}
                className="flex items-center justify-center"
              >
                <span className="font-sans text-[clamp(3.7rem,7.2vw,7rem)] font-semibold leading-none tracking-[-0.065em]">txBet</span>
              </motion.div>
            </div>

            <motion.div
              initial={false}
              animate={{ y: detailsReady ? 0 : 10 }}
              transition={splashTransition}
              className="mt-10 flex max-w-4xl flex-col items-center sm:mt-12"
            >
              <h1 id="brand-splash-title" className="font-serif text-[clamp(3rem,5vw,5.2rem)] font-normal leading-[0.92] tracking-[-0.04em]">
                The match moves.
                <span className="block text-muted-foreground">Markets follow.</span>
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                txBet models the brief gap between a TxLINE-format match event and venue repricing.
              </p>
              <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
                <Link
                  href="/console"
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "h-12 rounded-md px-6 font-mono text-xs font-semibold uppercase tracking-[0.14em]",
                  )}
                >
                  Launch replay <span aria-hidden="true">↗</span>
                </Link>
                <a
                  href="#system"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-12 rounded-md px-6 font-mono text-xs uppercase tracking-[0.14em]",
                  )}
                >
                  Explore the system <span aria-hidden="true">↓</span>
                </a>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-border/70 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground sm:grid-cols-4 sm:text-[0.6875rem]">
          {["TxLINE-format replay", "Synthetic venue books", "Simulated fills", "No live money"].map((item) => (
            <div key={item} className="border-border/70 px-2 py-3 text-center odd:border-r sm:border-r sm:last:border-r-0">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
