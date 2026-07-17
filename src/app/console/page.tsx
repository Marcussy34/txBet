import type { Metadata } from "next";

import { ConsoleAccessGate } from "@/components/auth/console-access-gate";
import { TxBetConsole } from "@/components/dashboard/txbet-console";

export const metadata: Metadata = {
  title: "Console",
  description: "Launch txBet's live match agents across World Cup fixtures.",
};

export default function ConsolePage() {
  return (
    <ConsoleAccessGate>
      <TxBetConsole />
    </ConsoleAccessGate>
  );
}
