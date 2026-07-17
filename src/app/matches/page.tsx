import type { Metadata } from "next";

import { MatchBacktestView } from "@/components/matches/match-backtest-view";

export const metadata: Metadata = {
  title: "Past matches — txBet",
  description:
    "Agent backtests over real World Cup matches: TxLINE events, real venue books, settled PnL.",
};

export default function MatchesPage() {
  return <MatchBacktestView />;
}
