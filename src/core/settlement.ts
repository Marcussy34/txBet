import type { CanonicalContract, SettlementSpec } from "./types";

export type SettlementMismatchCode =
  | "FIXTURE"
  | "PROPOSITION"
  | "SUBJECT"
  | "PERIOD"
  | "SCOPE"
  | "LINE"
  | "RESOLUTION_RULE"
  | "VOID_RULE"
  | "CLOSE_TIME"
  | "CURRENCY"
  | "PAYOUT"
  | "OUTCOME";

const settlementFields: ReadonlyArray<keyof SettlementSpec> = [
  "fixtureId",
  "proposition",
  "subject",
  "period",
  "scope",
  "line",
  "resolutionRuleId",
  "voidRuleId",
  "closesAt",
  "payoutCurrency",
  "payoutMicros",
];

export function settlementKey(spec: SettlementSpec): string {
  const ordered = settlementFields.map((field) => [field, spec[field]]);
  return JSON.stringify(ordered);
}

export function compareContracts(
  left: CanonicalContract,
  right: CanonicalContract,
): { matches: boolean; reasons: readonly SettlementMismatchCode[] } {
  const reasons: SettlementMismatchCode[] = [];
  const a = left.settlement;
  const b = right.settlement;

  if (a.fixtureId !== b.fixtureId) reasons.push("FIXTURE");
  if (a.proposition !== b.proposition) reasons.push("PROPOSITION");
  if (a.subject !== b.subject) reasons.push("SUBJECT");
  if (a.period !== b.period) reasons.push("PERIOD");
  if (a.scope !== b.scope) reasons.push("SCOPE");
  if (a.line !== b.line) reasons.push("LINE");
  if (a.resolutionRuleId !== b.resolutionRuleId) reasons.push("RESOLUTION_RULE");
  if (a.voidRuleId !== b.voidRuleId) reasons.push("VOID_RULE");
  if (a.closesAt !== b.closesAt) reasons.push("CLOSE_TIME");
  if (a.payoutCurrency !== b.payoutCurrency) reasons.push("CURRENCY");
  if (a.payoutMicros !== b.payoutMicros) reasons.push("PAYOUT");
  if (left.outcome === right.outcome) reasons.push("OUTCOME");

  return { matches: reasons.length === 0, reasons };
}
