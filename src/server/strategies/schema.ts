import { z } from "zod";

import {
  liveVenueIdSchema,
  type LiveVenueId,
} from "@/contracts/venues";

export const worldCupStrategyInputSchema = z.strictObject({
  enabled: z.boolean(),
  venueIds: z.array(liveVenueIdSchema).min(1),
  marketScope: z.literal("all-verified-world-cup"),
  riskLimitsVersion: z.number().int().positive().safe(),
  expectedVersion: z.number().int().nonnegative().safe(),
});

export type WorldCupStrategyInput = Readonly<
  Omit<z.infer<typeof worldCupStrategyInputSchema>, "venueIds"> & {
    readonly venueIds: readonly LiveVenueId[];
  }
>;
