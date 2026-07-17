import { createPrivySessionAdapters } from "@/server/auth/privy-adapter";
import {
  verifyPrivySession,
  type VerifiedPrivySession,
} from "@/server/auth/privy-session";
import {
  loadVercelWebEnv,
  type VercelWebEnv,
} from "@/server/config/env";

export interface VercelRequestContext {
  readonly env: VercelWebEnv;
  readonly session: VerifiedPrivySession;
}

/** Verifies a bearer-only Privy session for a Vercel route without loading SQL config. */
export async function verifyVercelPrivyRequest(
  request: Request,
  source: Readonly<Record<string, string | undefined>> = process.env,
): Promise<VercelRequestContext> {
  const env = loadVercelWebEnv(source);
  const adapters = createPrivySessionAdapters({
    appId: env.PRIVY_APP_ID,
    appSecret: env.PRIVY_APP_SECRET,
    verificationKey: env.PRIVY_VERIFICATION_KEY,
  });
  const session = await verifyPrivySession({
    authorization: request.headers.get("authorization"),
    expectedAppId: env.PRIVY_APP_ID,
    nowSeconds: Math.floor(Date.now() / 1_000),
    operatorEmails: env.operatorEmails,
    verifier: adapters.verifier,
    users: adapters.users,
  });
  return Object.freeze({ env, session });
}
