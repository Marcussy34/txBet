import type { LiveVenueId } from "@/contracts/venues";

import type { LiveVenueAdapter } from "./types";

/** DFlow cannot be added through runtime configuration while its docs gate is closed. */
export function createLiveVenueRegistry(
  adapters: readonly LiveVenueAdapter[],
) {
  const byId = new Map<LiveVenueId, LiveVenueAdapter>();
  for (const adapter of adapters) {
    if (adapter.id === "kalshi-dflow") {
      throw new Error("Kalshi-through-DFlow is structurally shadow-only");
    }
    if (byId.has(adapter.id)) {
      throw new Error(`Duplicate live venue adapter: ${adapter.id}`);
    }
    byId.set(adapter.id, adapter);
  }

  return Object.freeze({
    ids(): readonly LiveVenueId[] {
      return Object.freeze([...byId.keys()]);
    },
    get(venueId: LiveVenueId): LiveVenueAdapter {
      const adapter = byId.get(venueId);
      if (adapter === undefined) {
        throw new Error(`Live venue adapter is not registered: ${venueId}`);
      }
      return adapter;
    },
  });
}
