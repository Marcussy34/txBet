import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AuthenticationError } from "@/server/auth/privy-session";
import { verifyVercelPrivyRequest } from "@/server/auth/vercel-request";
import { loadVercelDflowCanaryEnv } from "@/server/config/env";
import {
  DflowCanaryError,
  dflowCanaryOrderInputSchema,
  submitDflowCanaryOrder,
} from "@/server/execution/dflow-canary-service";
import { createDflowPrivySigner } from "@/server/execution/dflow-privy-signer";
import { createVercelBlobJournalStore } from "@/server/execution/vercel-blob-store";
import { HttpGuardError, requireJsonMutation } from "@/server/http/guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    return json({ ok: false, error: { code: "UNAUTHORIZED" } }, 401);
  }
  if (error instanceof HttpGuardError) {
    return json({ ok: false, error: { code: error.code } }, error.status);
  }
  if (error instanceof DflowCanaryError) {
    return json({ ok: false, error: { code: error.code } }, error.status);
  }
  if (error instanceof ZodError) {
    return json({ ok: false, error: { code: "INVALID_BODY" } }, 400);
  }
  // Never expose Privy, DFlow, Blob, RPC, or environment details.
  return json({ ok: false, error: { code: "DFLOW_CANARY_UNAVAILABLE" } }, 503);
}

/** Authenticated manual canary; no scheduled or paired-agent code calls this route. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const context = await verifyVercelPrivyRequest(request);
    const mutation = await requireJsonMutation(request, {
      expectedOrigin: context.env.NEXT_PUBLIC_SITE_URL,
      schema: dflowCanaryOrderInputSchema,
      requireIdempotencyKey: true,
    });
    const env = loadVercelDflowCanaryEnv();
    const signer = createDflowPrivySigner({
      appId: env.PRIVY_APP_ID,
      appSecret: env.PRIVY_APP_SECRET,
      authorizationPrivateKey: env.PRIVY_AUTHORIZATION_PRIVATE_KEY,
      keyQuorumId: env.PRIVY_KEY_QUORUM_ID,
      dflowPolicyId: env.PRIVY_DFLOW_POLICY_ID,
    });
    const order = await submitDflowCanaryOrder({
      store: createVercelBlobJournalStore(),
      env,
      signer,
      profileId: context.session.privyDid,
      idempotencyKey: mutation.idempotencyKey!,
      order: mutation.body,
    });
    return json({ ok: true, order }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
