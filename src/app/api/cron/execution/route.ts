import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { loadVercelCronEnv } from "@/server/config/env";
import { runVercelCronCycle } from "@/server/execution/vercel-cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameSecret(authorization: string | null, secret: string): boolean {
  if (authorization === null) return false;
  const supplied = Buffer.from(authorization, "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return supplied.byteLength === expected.byteLength &&
    timingSafeEqual(supplied, expected);
}

/** Vercel Cron supplies CRON_SECRET as a bearer token on every scheduled GET. */
export async function GET(request: Request): Promise<NextResponse> {
  const env = loadVercelCronEnv();
  if (!sameSecret(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED_CRON" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const cycle = await runVercelCronCycle();
    return NextResponse.json(
      { ok: true, cycle },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "CYCLE_UNAVAILABLE" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
