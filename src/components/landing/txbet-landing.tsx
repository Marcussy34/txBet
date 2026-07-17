"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
} from "motion/react";

import {
  TxBetLockup,
} from "@/components/brand/txbet-brand";
import { BrandSplash } from "@/components/landing/sections/brand-splash";
import { DeliverySection, FinalCta } from "@/components/landing/sections/delivery";
import { AgentSection } from "@/components/landing/sections/agents";
import { ProofSection } from "@/components/landing/sections/proof";
import { ProtocolSection } from "@/components/landing/sections/protocol";
import { SystemIntro } from "@/components/landing/sections/system-intro";
import { TensionSection } from "@/components/landing/sections/tension";
import { VenueSection } from "@/components/landing/sections/venues";
import { useLandingMotion } from "@/components/landing/use-landing-motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/82 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="txBet home" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <TxBetLockup compact />
        </Link>
        <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-5">
          <a href="#protocol" className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground md:block">
            Protocol
          </a>
          <a href="#agents" className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground md:block">
            Agents
          </a>
          <a href="#proof" className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground md:block">
            Proof
          </a>
          <Link
            href="/console"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-9 rounded-md px-4 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em]",
            )}
          >
            Launch app
            <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-7 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <TxBetLockup compact />
        <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[0.6875rem] uppercase tracking-[0.11em] text-muted-foreground">
          <span>TxLINE smoke boundary</span>
          <span>Model venue books</span>
          <span>Operator-gated execution</span>
          <span>MIT licensed</span>
        </div>
      </div>
    </footer>
  );
}

export function TxBetLanding() {
  const landingRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 180, damping: 28, mass: 0.35 });
  useLandingMotion({ scope: landingRef });

  return (
    <div ref={landingRef} className="min-h-screen overflow-x-clip text-foreground">
      <motion.div
        aria-hidden="true"
        style={{ scaleX: progress, originX: 0 }}
        className="fixed inset-x-0 top-0 z-[60] h-0.5 bg-primary"
      />
      <LandingHeader />
      <main>
        <BrandSplash />
        <SystemIntro />
        <TensionSection />
        <VenueSection />
        <ProtocolSection />
        <AgentSection />
        <ProofSection />
        <DeliverySection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
