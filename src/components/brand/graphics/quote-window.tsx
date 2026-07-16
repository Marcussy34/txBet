import { cn } from "@/lib/utils";

const traceLabelClassName = "border border-border bg-background/85 px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em]";

export function QuoteWindowGraphic({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full overflow-hidden text-foreground", className)}>
      <svg
        data-gsap-asset="quote-window"
        viewBox="0 0 1200 144"
        preserveAspectRatio="none"
        role="img"
        aria-labelledby="quote-window-title quote-window-description"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="quote-window-title">Quote convergence window for synthetic venues</title>
        <desc id="quote-window-description">
          Two synthetic quote traces begin apart, converge between 600 and 1,100 milliseconds, then settle together by 3,000 milliseconds.
        </desc>

        <path d="M0 36H1200M0 72H1200M0 108H1200" stroke="currentColor" strokeOpacity="0.10" vectorEffect="non-scaling-stroke" />
        <path d="M100 0V144M600 0V144M1100 0V144" stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />

        <path
          data-gsap-draw
          d="M24 30C112 30 176 35 232 48C270 57 304 64 330 72C492 72 706 73 1176 73"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
        />
        <path
          data-gsap-draw
          d="M24 114C114 114 174 106 230 94C270 85 304 78 330 72C492 72 706 78 1176 78"
          stroke="currentColor"
          strokeOpacity="0.58"
          strokeWidth="2.5"
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
        />

      </svg>

      <span data-gsap-node data-gsap-stage="event" aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute left-[2%] top-[20.8333%] size-3 -translate-x-1/2 -translate-y-1/2 bg-foreground" />
        <span className="absolute left-[2%] top-[79.1667%] size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-foreground" />
      </span>
      <span data-gsap-node data-gsap-stage="capture" aria-hidden="true" className="pointer-events-none absolute left-[27.5%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 bg-foreground outline outline-1 outline-offset-[5px] outline-foreground/30" />
      <span data-gsap-node data-gsap-stage="normalized" aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute right-[2%] top-[50.6944%] size-3 translate-x-1/2 -translate-y-1/2 bg-foreground" />
        <span className="absolute right-[2%] top-[54.1667%] size-3 translate-x-1/2 -translate-y-1/2 border-2 border-foreground" />
      </span>

      {/* HTML chips stay readable when the trace field compresses on mobile. */}
      <span className={`${traceLabelClassName} pointer-events-none absolute left-2 top-2`}>
        <span className="sm:hidden">T+0</span>
        <span className="hidden sm:inline">EVENT / T+0</span>
      </span>
      <span className={`${traceLabelClassName} pointer-events-none absolute bottom-2 left-[27.5%] -translate-x-1/2`}>
        <span className="sm:hidden">SYNC</span>
        <span className="hidden sm:inline">QUOTES CONVERGE</span>
      </span>
      <span className={`${traceLabelClassName} pointer-events-none absolute right-2 top-2`}>
        <span className="sm:hidden">SETTLED</span>
        <span className="hidden sm:inline">PAIR NORMALIZED</span>
      </span>
    </div>
  );
}
