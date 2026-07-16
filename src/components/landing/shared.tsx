import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  // Core content stays visible in server HTML; motion is progressive enhancement only.
  return <div data-gsap-reveal="true" className={className}>{children}</div>;
}

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground", className)}>
      {children}
    </div>
  );
}
