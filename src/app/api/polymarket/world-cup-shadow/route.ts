import { NextResponse } from "next/server";

import { readCachedPolymarketWorldCupShadowStatus } from "@/server/polymarket/world-cup-shadow";

export const dynamic = "force-dynamic";

/** Exposes only credential-free public-book and deterministic shadow-scan evidence. */
export async function GET(): Promise<NextResponse> {
  const status = await readCachedPolymarketWorldCupShadowStatus();

  return NextResponse.json(status, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
