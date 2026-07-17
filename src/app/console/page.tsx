import type { Metadata } from "next";

import { ConsoleAccessGate } from "@/components/auth/console-access-gate";
import { TxBetConsole } from "@/components/dashboard/txbet-console";

export const metadata: Metadata = {
  title: "Replay console",
  description: "Step through txBet's deterministic matched, no-trade, and partial-fill prediction-market scenarios.",
};

export default function ConsolePage() {
  return (
    <ConsoleAccessGate>
      <TxBetConsole />
    </ConsoleAccessGate>
  );
}
