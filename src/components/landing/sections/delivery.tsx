import Link from "next/link";

import { TxBetMark } from "@/components/brand/txbet-brand";
import { MicroLabel, Reveal } from "@/components/landing/shared";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const deliveryStatus = [
  ["Strategy core", "implemented", "good"],
  ["Browser + terminal replay", "implemented", "good"],
  ["TxLINE auth / snapshot / SSE", "smoke boundary", "feed"],
  ["Live stream → strategy loop", "not wired", "open"],
  ["Venue books + fills", "synthetic", "open"],
  ["Live-money execution", "not included", "open"],
] as const;

export function DeliverySection() {
  return (
    <section className="border-b border-border py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1500px] gap-14 px-4 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
        <Reveal>
          <MicroLabel className="text-signal">05 / honest boundary</MicroLabel>
          <h2 className="mt-5 font-serif text-[clamp(3.8rem,6.8vw,6.8rem)] font-normal leading-[0.86] tracking-[-0.04em]">
            Built now.
            <span className="block text-muted-foreground">Wired next.</span>
          </h2>
        </Reveal>
        <Reveal>
          <div className="border border-border bg-card/55">
            {deliveryStatus.map(([label, status, tone]) => (
              <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-4 last:border-0 sm:px-5">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={cn(
                  "font-mono text-[0.6875rem] uppercase tracking-[0.1em]",
                  tone === "good" && "text-success",
                  tone === "feed" && "text-signal",
                  tone === "open" && "text-warning",
                )}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden py-28 sm:py-40">
      <Reveal className="mx-auto max-w-[1500px] px-4 text-center sm:px-6 lg:px-8">
        <div className="mx-auto grid size-20 place-items-center rounded-lg border border-border bg-card"><TxBetMark className="size-12" /></div>
        <MicroLabel className="mt-8 text-primary">Replay the whole decision</MicroLabel>
        <h2 className="mx-auto mt-5 max-w-6xl font-serif text-[clamp(4.5rem,9vw,9rem)] font-normal leading-[0.82] tracking-[-0.05em]">
          The tape is ready.
        </h2>
        <p className="mx-auto mt-8 max-w-xl text-sm leading-7 text-muted-foreground">
          Three outcomes. One core. Full disclosure.
        </p>
        <Link
          href="/console"
          className={cn(
            buttonVariants({ variant: "default" }),
            "mt-9 h-12 rounded-md px-7 font-mono text-xs font-semibold uppercase tracking-[0.14em]",
          )}
        >
          Launch txBet console <span aria-hidden="true">↗</span>
        </Link>
      </Reveal>
    </section>
  );
}
