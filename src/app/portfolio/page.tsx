import type { Metadata } from "next";

import { ConsoleAccessGate } from "@/components/auth/console-access-gate";
import { TxBetPortfolio } from "@/components/dashboard/txbet-portfolio";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Operator portfolio: identity, honest live boundaries, and synthetic replay P&L.",
};

export default function PortfolioPage() {
  return (
    <ConsoleAccessGate>
      <TxBetPortfolio />
    </ConsoleAccessGate>
  );
}
