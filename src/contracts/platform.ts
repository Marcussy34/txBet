/** Immutable platform limits. User settings may only be stricter. */
export const PLATFORM_RISK_CEILINGS = Object.freeze({
  maxOrderMicros: 100_000_000,
  rolling24hMicros: 1_000_000_000,
  minNetReturnBps: 100,
  minNetProfitMicros: 100_000,
  emergencyLossMicros: 5_000_000,
  emergencyLossBps: 500,
  canaryAggregateMicros: 10_000_000,
});
