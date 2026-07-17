import { AGENTS } from "@/agents/definitions";
import { AgentTelemetry } from "@/components/brand/txbet-brand";
import { MicroLabel, Reveal } from "@/components/landing/shared";

const AGENT_WINDOWS_MS = {
  "red-card": 800,
  injury: 1200,
  "penalty-var": 1000,
  "goal-reaction": 700,
  "corner-pressure": 1600,
  "dangerous-free-kick": 900,
} satisfies Record<(typeof AGENTS)[number]["id"], number>;

export function AgentSection() {
  return (
    <section id="agents" className="border-b border-border py-24 sm:py-32">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <MicroLabel className="text-primary">04 / match-trading agents</MicroLabel>
          <h2 className="mt-5 font-serif text-[clamp(4rem,7.5vw,7.6rem)] font-normal leading-[0.84] tracking-[-0.045em]">
            Pick the agent.
            <span className="block text-muted-foreground">It trades the match.</span>
          </h2>
        </Reveal>

        <div className="relative mt-16">
          {/* One baseline field makes the six operators read as a single instrument bank. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground),transparent_95%)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--foreground),transparent_95%)_1px,transparent_1px)] bg-[size:24px_24px]"
          />
          <div className="relative grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {AGENTS.map((agent, index) => (
              <div key={agent.id} className="h-full">
                <article
                  data-gsap-agent-index={index}
                  tabIndex={0}
                  className="group flex h-full flex-col overflow-hidden border border-b-0 border-border bg-card/85 motion-safe:transition-colors motion-safe:duration-150 hover:border-foreground/35 focus-within:border-foreground/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <AgentTelemetry agent={agent.id} className="aspect-[4/5] border-0 border-b border-border" />
                  <div className="flex-1 p-3">
                    <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">Agent 0{index + 1}</div>
                    <h3 className="mt-2 text-xs font-semibold leading-4 text-foreground">{agent.shortName}</h3>
                  </div>
                  <footer className="border-t border-border p-3">
                    <div className="flex min-h-10 flex-wrap content-start items-center gap-x-1 gap-y-0.5 font-mono text-[0.625rem] uppercase leading-4 tracking-[0.08em] text-muted-foreground opacity-0 translate-y-1 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-out [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
                      <span>WINDOW {AGENT_WINDOWS_MS[agent.id]}MS</span>
                      <span aria-hidden="true">·</span>
                      <span>COMPLEMENTS {agent.marketFamilies.length}</span>
                      <span aria-hidden="true">·</span>
                      <span>GATE SHARED</span>
                    </div>
                    <div className="mt-2 inline-flex max-w-full flex-wrap items-center gap-x-1 border border-border bg-background/80 px-2 py-1 font-mono text-[0.625rem] uppercase leading-4 tracking-[0.08em] text-muted-foreground">
                      <span>ARMED</span>
                      <span aria-hidden="true">/</span>
                      <span>DETERMINISTIC</span>
                    </div>
                  </footer>
                </article>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-5 font-mono text-[0.6875rem] uppercase leading-5 tracking-[0.1em] text-muted-foreground">
          deterministic odds + dominance model / live momentum feed pending
        </p>
      </div>
    </section>
  );
}
