import { describe, expect, it } from "vitest";

import {
  LIVE_VENUE_IDS,
  isLiveVenueId,
  liveVenueIdSchema,
} from "@/contracts/venues";

describe("live venue registry", () => {
  it("defines one immutable canonical registry for every approved adapter", () => {
    expect(LIVE_VENUE_IDS).toEqual([
      "polymarket",
      "kalshi-dflow",
      "opinion",
      "predict-fun",
      "limitless",
      "sx-bet",
      "hydromancer",
    ]);
    expect(Object.isFrozen(LIVE_VENUE_IDS)).toBe(true);
  });

  it("accepts only exact canonical venue IDs", () => {
    for (const venue of LIVE_VENUE_IDS) {
      expect(isLiveVenueId(venue)).toBe(true);
      expect(liveVenueIdSchema.parse(venue)).toBe(venue);
    }

    for (const value of ["kalshi", "Polymarket", "sxbet", "hyperliquid", "", null]) {
      expect(isLiveVenueId(value)).toBe(false);
      expect(liveVenueIdSchema.safeParse(value).success).toBe(false);
    }
  });
});
