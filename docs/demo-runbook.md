# Demo runbook

## 90-second flow

1. Open the **Red card / matched bundle** tape.
2. Say: “The agent stays asleep until TxLINE confirms a qualifying action.”
3. Play the tape. At the red card, show that the first books still cost more than `$1`, so no trade occurs.
4. Advance to **Gap detected**. Explain that the contracts match on fixture, proposition, scope, resolution, void rules, currency, and payout.
5. Read the calculation: `$94.00` raw cost, `$0.80` fees, roughly `$0.40` safety buffer, `$100` payout, about `$4.80` modeled profit.
6. Open **Settlement** and show that YES and NO winning model the same P&L after both simulated fills.
7. Scroll to **Synthetic replay report + latency lab**. Compare the 800 ms captured window with the 3,000 ms no-trade recheck.
8. Say that this is synthetic replay evidence: it proves the accounting and safety behavior, not historical profitability.
9. Switch to **Corner pressure / no trade** and show `$1.06` being rejected.
10. Switch to **Penalty / partial-fill risk** and show 100 versus 70 fills, 30 residual YES shares, and the kill switch.

## Exact wording

> txBet does not predict which team wins. The live match action wakes a cross-venue scan. Exact settlement matching and after-cost execution math decide whether a complementary bundle exists. No edge. No trade.

> Trading one side the moment an event happens is latency trading. txBet becomes an arbitrage system only when it can lock exact opposite outcomes across different venues below their common payout after every modeled cost.

> This screen is a deterministic synthetic TxLINE-format replay with simulated books and fills. The same engine is used by the terminal demo; the repository also includes a live TxLINE score smoke client.

Do not call an opportunity guaranteed before both legs fill equally.

Do not present the 3,000 ms route as measured PRED latency. It is a synthetic stress-test window inspired by the execution-delay risk that live venues can introduce.
