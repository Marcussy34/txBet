import { PrivyClient, verifyAccessToken as verifyPrivyAccessToken } from "@privy-io/node";

import type {
  PrivyAccessTokenVerifier,
  PrivyUserReader,
} from "@/server/auth/privy-session";

export const PRIVY_API_HOST = "https://api.privy.io" as const;

interface PrivySdkToken {
  readonly app_id: string;
  readonly issuer: string;
  readonly issued_at: number;
  readonly expiration: number;
  readonly session_id: string;
  readonly user_id: string;
}

interface PrivySdkClientConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly apiUrl: typeof PRIVY_API_HOST;
  readonly maxRetries: 1;
  readonly timeout: 5_000;
}

interface PrivySdkClient {
  getUser(userId: string): Promise<unknown>;
}

export interface PrivySdkBoundary {
  verifyAccessToken(input: {
    readonly access_token: string;
    readonly app_id: string;
    readonly verification_key: string;
  }): Promise<PrivySdkToken>;
  createClient(config: PrivySdkClientConfig): PrivySdkClient;
}

export interface PrivySessionAdapterConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly verificationKey: string;
}

export interface PrivySessionAdapters {
  readonly verifier: PrivyAccessTokenVerifier;
  readonly users: PrivyUserReader;
}

const officialSdkBoundary: PrivySdkBoundary = {
  verifyAccessToken: verifyPrivyAccessToken,
  createClient(config) {
    const client = new PrivyClient(config);
    return {
      getUser: (userId) => client.users()._get(userId),
    };
  },
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mapSdkUser(value: unknown) {
  if (
    !isPlainRecord(value) ||
    typeof value.id !== "string" ||
    !Array.isArray(value.linked_accounts) ||
    !value.linked_accounts.every(isPlainRecord)
  ) {
    throw new Error("Invalid Privy user response");
  }

  return Object.freeze({
    id: value.id,
    linkedAccounts: Object.freeze(
      value.linked_accounts.map((account) => Object.freeze({ ...account })),
    ),
  });
}

/** Creates the narrow official-SDK adapters used by the bearer-session boundary. */
export function createPrivySessionAdapters(
  config: PrivySessionAdapterConfig,
  sdk: PrivySdkBoundary = officialSdkBoundary,
): PrivySessionAdapters {
  if (
    config.appId.trim().length === 0 ||
    config.appSecret.trim().length === 0 ||
    config.verificationKey.trim().length === 0
  ) {
    throw new Error("Invalid Privy session adapter configuration");
  }

  const client = sdk.createClient({
    appId: config.appId,
    appSecret: config.appSecret,
    apiUrl: PRIVY_API_HOST,
    maxRetries: 1,
    timeout: 5_000,
  });

  return Object.freeze({
    verifier: Object.freeze({
      async verify(accessToken: string) {
        const token = await sdk.verifyAccessToken({
          access_token: accessToken,
          app_id: config.appId,
          verification_key: config.verificationKey,
        });
        return Object.freeze({
          appId: token.app_id,
          issuer: token.issuer,
          issuedAt: token.issued_at,
          expiration: token.expiration,
          sessionId: token.session_id,
          userId: token.user_id,
        });
      },
    }),
    users: Object.freeze({
      async get(userId: string) {
        return mapSdkUser(await client.getUser(userId));
      },
    }),
  });
}
