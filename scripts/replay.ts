import { runBacktest } from "../src/core/backtest";
import { simulateBundleExecution, settlementBranches } from "../src/core/executor";
import { formatBps, formatUsd } from "../src/core/money";
import { runPipeline } from "../src/core/pipeline";
import {
  DEMO_SCENARIOS,
  DEMO_SETTINGS,
  SYNTHETIC_BACKTEST_WINDOWS,
} from "../src/fixtures/demo-tapes";

for (const scenario of DEMO_SCENARIOS) {
  console.log(`\nTXBET / ${scenario.name.toUpperCase()}`);
  for (const [index, frame] of scenario.frames.entries()) {
    const result = runPipeline({
      agentId: scenario.defaultAgent,
      event: frame.event,
      quotes: frame.quotes,
      settings: DEMO_SETTINGS,
      now: frame.now,
    });
    const label = String(index + 1).padStart(2, "0");
    if (!result.trigger.active) {
      console.log(`${label} ${frame.clock} ARMED     ${result.trigger.reason}`);
      continue;
    }
    if (!result.scan.candidate) {
      console.log(`${label} ${frame.clock} NO TRADE  ${result.scan.reasons.join(", ")}`);
      continue;
    }
    const candidate = result.scan.candidate;
    console.log(
      `${label} ${frame.clock} CANDIDATE ${candidate.quantity} pairs · ${formatUsd(candidate.netProfitMicros)} net · ${formatBps(candidate.netReturnBps)}`,
    );
    if (frame.execution) {
      const execution = simulateBundleExecution(
        candidate,
        frame.execution === "matched" ? {} : frame.execution,
      );
      console.log(`   execution=${execution.state} matched=${execution.matchedQuantity} residual=${execution.residualQuantity}`);
      if (frame.settlement && execution.state === "MATCHED") {
        const branches = settlementBranches(candidate, execution.matchedQuantity);
        console.log(`   YES settles: ${formatUsd(branches[0]!.modeledProfitMicros)} · NO settles: ${formatUsd(branches[1]!.modeledProfitMicros)}`);
      }
    }
  }
}

const backtest = runBacktest(SYNTHETIC_BACKTEST_WINDOWS, DEMO_SETTINGS);
console.log("\nTXBET / SYNTHETIC BACKTEST + LATENCY LAB");
console.log(
  `${backtest.windows} windows · ${backtest.matchedCount} matched · ${backtest.noTradeCount} no trade · ${backtest.unhedgedCount} unhedged`,
);
console.log(
  `locked replay P&L=${formatUsd(backtest.lockedProfitMicros)} · locked return=${formatBps(backtest.lockedReturnBps)}`,
);
for (const trace of backtest.traces) {
  const state = trace.execution?.state ?? trace.scan.decision;
  console.log(`${String(trace.latencyMs).padStart(4, " ")}ms  ${state.padEnd(9, " ")} ${trace.label}`);
}

console.log("\nDisclosure: synthetic TxLINE-format replay; all venue books and executions are simulated.");
