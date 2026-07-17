import { Pause, Play } from "lucide-react";

import {
  ExecutionProtocolGraphic,
  ExecutionProtocolMobileGraphic,
  StatusGlyph,
} from "@/components/brand/txbet-brand";
import { MicroLabel, Reveal } from "@/components/landing/shared";
import { cn } from "@/lib/utils";

export const protocol = [
  {
    index: "01",
    title: "Wake",
    signal: "momentum signal",
    tone: "text-primary",
  },
  {
    index: "02",
    title: "Verify",
    signal: "exact terms",
    tone: "text-signal",
  },
  {
    index: "03",
    title: "Pair",
    signal: "equal depth",
    tone: "text-success",
  },
  {
    index: "04",
    title: "Guard",
    signal: "net edge",
    tone: "text-foreground",
  },
] as const;

export function ProtocolSection() {
  return (
    <section
      id="protocol"
      data-section-language="execution-interlock"
      className="scroll-mt-[4.5rem] border-b border-border bg-card/25 lg:flex lg:min-h-[calc(100svh-4.5rem)] lg:items-center"
    >
      <div className="mx-auto grid w-full max-w-[1500px] items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,0.72fr)_minmax(580px,1.28fr)] lg:gap-16 lg:px-8 lg:py-12 xl:gap-20">
        <Reveal className="max-w-[600px]">
          <MicroLabel className="text-signal">03 / execution protocol</MicroLabel>
          <h2 className="mt-6 font-serif text-[clamp(4.2rem,6.5vw,7rem)] font-normal leading-[0.84] tracking-[-0.045em]">
            Speed finds it.
            <span className="block text-muted-foreground">Rules decide it.</span>
          </h2>
          <div className="mt-10 hidden border-t border-border lg:block">
            <div className="flex items-center justify-between border-b border-border py-3">
              <MicroLabel className="text-foreground">Live protocol ledger</MicroLabel>
              <span className="border border-border bg-background/80 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
                04 checks
              </span>
            </div>
            <ol>
              {protocol.map((step) => {
                const stage = step.title.toLowerCase();

                return (
                  <li
                    key={step.index}
                    data-gsap-protocol-ledger-row={stage}
                    className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 py-3 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    <span className={step.tone}>{step.index}</span>
                    <span className="text-foreground">{step.title}</span>
                    <span className="relative grid size-5 place-items-center">
                      <span data-gsap-protocol-ledger-pass className="text-success">
                        <StatusGlyph state="locked" />
                      </span>
                      {stage === "guard" && (
                        <span data-gsap-protocol-ledger-warning className="absolute inset-0 grid place-items-center text-warning opacity-0">
                          <StatusGlyph state="risk" />
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </Reveal>

        <Reveal className="min-w-0">
          <div
            data-gsap-loop="execution-protocol"
            className="overflow-hidden rounded-xl border border-border bg-background/82"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
              <div className="flex shrink-0 items-center gap-2">
                <span className="size-2 bg-primary" />
                <MicroLabel className="text-foreground">Execution interlock</MicroLabel>
              </div>
              <div className="flex w-full items-center gap-2 border-t border-border/60 pt-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground sm:w-auto sm:border-0 sm:pt-0 sm:text-[0.6875rem]">
                <button
                  type="button"
                  data-gsap-live-toggle
                  aria-label="Pause execution loop"
                  className="grid size-11 shrink-0 place-items-center rounded-sm border border-border/80 text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hidden sm:size-7"
                >
                  <Pause data-gsap-live-pause aria-hidden="true" className="size-4 sm:size-3" />
                  <Play data-gsap-live-play aria-hidden="true" className="hidden size-4 sm:size-3" />
                </button>
                <span data-gsap-live-dot aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
                <span data-gsap-live-status="true" className="whitespace-nowrap">loop ready</span>
                <span className="shrink-0 sm:hidden">/ model</span>
                <span className="hidden shrink-0 sm:inline">/ model</span>
              </div>
            </div>

            <div className="border-b border-border bg-card/45 px-3 py-5 sm:px-5 sm:py-6">
              <ExecutionProtocolGraphic className="hidden h-auto max-h-60 sm:block" />
              <ExecutionProtocolMobileGraphic className="mx-auto h-auto max-h-[25rem] sm:hidden" />
            </div>

            <ol className="hidden grid-cols-4 gap-px bg-border sm:grid">
              {protocol.map((step) => (
                <li
                  key={step.index}
                  data-gsap-live-metric={step.title.toLowerCase()}
                  className="bg-background px-3 py-4 sm:px-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("font-mono text-[0.6875rem]", step.tone)}>{step.index}</span>
                    {step.title === "Guard" ? (
                      <span className="relative h-5 w-[4.75rem]">
                        <span
                          data-gsap-protocol-card-pass
                          className="absolute inset-0 grid place-items-center border border-success/50 bg-success/10 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-success"
                        >
                          passed
                        </span>
                        <span
                          data-gsap-protocol-card-warning
                          className="absolute inset-0 grid place-items-center border border-warning/50 bg-warning/10 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-warning opacity-0"
                        >
                          refused
                        </span>
                      </span>
                    ) : (
                      <span className="h-px w-8 bg-border" />
                    )}
                  </div>
                  <div className="mt-3 font-serif text-2xl leading-none sm:text-3xl">{step.title}</div>
                  <MicroLabel className="mt-2 text-[0.625rem] tracking-[0.12em]">{step.signal}</MicroLabel>
                </li>
              ))}
            </ol>

            <div className="flex items-center justify-between gap-4 border-t border-border bg-background/80 px-4 py-3 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground sm:text-[0.6875rem]">
              <span>rule-gated sequence</span>
              <span className="text-right"><span data-gsap-live-clock>sequence idle</span> / operator-gated</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
