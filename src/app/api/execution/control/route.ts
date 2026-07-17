import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { verifyVercelPrivyRequest } from "@/server/auth/vercel-request";
import { AuthenticationError } from "@/server/auth/privy-session";
import {
  ExecutionControlConflictError,
  executionControlInputSchema,
  readVercelExecutionControl,
  updateVercelExecutionControl,
} from "@/server/execution/vercel-control";
import { createVercelBlobJournalStore } from "@/server/execution/vercel-blob-store";
import { HttpGuardError, requireJsonMutation } from "@/server/http/guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED" } },
      { status: 401 },
    );
  }
  if (error instanceof HttpGuardError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_CONTROL" } },
      { status: 400 },
    );
  }
  if (error instanceof ExecutionControlConflictError) {
    return NextResponse.json(
      { ok: false, error: { code: "CONTROL_CONFLICT" } },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { ok: false, error: { code: "CONTROL_UNAVAILABLE" } },
    { status: 503 },
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { session } = await verifyVercelPrivyRequest(request);
    const control = await readVercelExecutionControl(
      createVercelBlobJournalStore(),
      session.privyDid,
      Date.now(),
    );
    return NextResponse.json({ ok: true, control }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const context = await verifyVercelPrivyRequest(request);
    const mutation = await requireJsonMutation(request, {
      expectedOrigin: context.env.NEXT_PUBLIC_SITE_URL,
      schema: executionControlInputSchema,
      requireIdempotencyKey: true,
    });
    const control = await updateVercelExecutionControl({
      store: createVercelBlobJournalStore(),
      profileId: context.session.privyDid,
      nowMs: Date.now(),
      input: mutation.body,
    });
    return NextResponse.json({ ok: true, control }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
