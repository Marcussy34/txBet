import { NextResponse } from "next/server";

import { readCachedWorldCupStatus } from "@/server/txline/world-cup-status";

export const dynamic = "force-dynamic";

/** Exposes only normalized, credential-safe World Cup feed status. */
export async function GET(): Promise<NextResponse> {
  const status = await readCachedWorldCupStatus();

  return NextResponse.json(status, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
