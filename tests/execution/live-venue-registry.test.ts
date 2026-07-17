import { describe, expect, it } from "vitest";

import { createLiveVenueRegistry } from "@/execution/live-venue-registry";
import type { LiveVenueAdapter } from "@/execution/types";

function adapter(id: LiveVenueAdapter["id"]): LiveVenueAdapter {
  return { id } as LiveVenueAdapter;
}

describe("live venue adapter registry", () => {
  it("registers an explicit adapter without implying certification", () => {
    const polymarket = adapter("polymarket");
    const registry = createLiveVenueRegistry([polymarket]);
    expect(registry.ids()).toEqual(["polymarket"]);
    expect(registry.get("polymarket")).toBe(polymarket);
  });

  it("structurally refuses a DFlow live adapter", () => {
    expect(() =>
      createLiveVenueRegistry([adapter("kalshi-dflow")]),
    ).toThrow(/shadow-only/i);
  });

  it("rejects duplicate adapters and missing lookups", () => {
    expect(() =>
      createLiveVenueRegistry([adapter("polymarket"), adapter("polymarket")]),
    ).toThrow(/duplicate/i);
    expect(() => createLiveVenueRegistry([]).get("polymarket")).toThrow(
      /not registered/i,
    );
  });
});
