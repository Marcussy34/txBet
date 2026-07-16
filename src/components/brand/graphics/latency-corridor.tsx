import { cn } from "@/lib/utils";

export function LatencyCorridor({ className }: { className?: string }) {
  return (
    <svg
      data-gsap-asset="latency-corridor"
      viewBox="0 0 720 240"
      role="img"
      aria-labelledby="latency-corridor-title latency-corridor-description"
      className={cn("w-full text-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="latency-corridor-title">Latency Corridor</title>
      <desc id="latency-corridor-description">A TxLINE-format event at T plus zero precedes three staggered synthetic venue repricing moments.</desc>
      <path d="M54 48H676M54 96H676M54 144H676M54 192H676" stroke="currentColor" strokeOpacity="0.12" />
      <path d="M150 30V210" stroke="currentColor" strokeWidth="2" />
      <path d="M310 72V120M430 120V168M560 168V216" stroke="currentColor" strokeWidth="2" strokeOpacity="0.55" />
      <path data-gsap-draw d="M150 48H310V96H430V144H560V192H676" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <rect data-gsap-node x="139" y="37" width="22" height="22" fill="currentColor" />
      <circle data-gsap-node cx="310" cy="96" r="7" fill="currentColor" />
      <circle data-gsap-node cx="430" cy="144" r="7" fill="currentColor" />
      <circle data-gsap-node cx="560" cy="192" r="7" fill="currentColor" />
      <g className="hidden sm:block" fill="currentColor" fontFamily="var(--font-data)" fontSize="18" letterSpacing="1.4">
        <text x="54" y="22">TXLINE EVENT</text>
        <text x="139" y="232">T+0</text>
        <text x="286" y="64">VENUE 01</text>
        <text x="406" y="112">VENUE 02</text>
        <text x="536" y="160">VENUE 03</text>
      </g>
      <g className="sm:hidden" fill="currentColor" fontFamily="var(--font-data)" fontSize="32" letterSpacing="1.4">
        <text x="54" y="30">EVENT</text>
        <text x="139" y="232">T+0</text>
        <text x="286" y="68">V01</text>
        <text x="406" y="116">V02</text>
        <text x="536" y="164">V03</text>
      </g>
    </svg>
  );
}
