import { z } from "zod";

/** One backend registry prevents adapter and policy venue IDs from drifting. */
export const LIVE_VENUE_IDS = Object.freeze([
  "polymarket",
  "kalshi-dflow",
  "opinion",
  "predict-fun",
  "limitless",
  "sx-bet",
  "hydromancer",
] as const);

export type LiveVenueId = (typeof LIVE_VENUE_IDS)[number];

export const liveVenueIdSchema = z.enum(LIVE_VENUE_IDS);

export function isLiveVenueId(value: unknown): value is LiveVenueId {
  return liveVenueIdSchema.safeParse(value).success;
}
