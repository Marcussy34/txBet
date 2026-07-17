import { z } from "zod";

const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PRIVY_DID_PATTERN = /^did:privy:[A-Za-z0-9._:-]{1,500}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,512}$/;
const MAX_ACCESS_TOKEN_LENGTH = 8_192;
const MAX_CLOCK_SKEW_SECONDS = 30;
const emailSchema = z.email().max(320);

export class AuthenticationError extends Error {
  readonly code = "UNAUTHORIZED" as const;

  constructor() {
    super("Unauthorized");
    this.name = "AuthenticationError";
  }
}

export interface VerifiedPrivyAccessToken {
  readonly appId: string;
  readonly issuer: string;
  readonly issuedAt: number;
  readonly expiration: number;
  readonly sessionId: string;
  readonly userId: string;
}

export interface PrivyAccessTokenVerifier {
  verify(accessToken: string): Promise<VerifiedPrivyAccessToken>;
}

export interface PrivyUserRecord {
  readonly id: string;
  readonly linkedAccounts: readonly Readonly<Record<string, unknown>>[];
}

export interface PrivyUserReader {
  get(userId: string): Promise<PrivyUserRecord>;
}

export interface VerifiedPrivySession {
  readonly privyDid: string;
  readonly sessionId: string;
  readonly verifiedGoogleEmail: string;
  readonly isOperator: boolean;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export interface VerifyPrivySessionInput {
  readonly authorization: string | null | undefined;
  readonly expectedAppId: string;
  readonly nowSeconds: number;
  readonly operatorEmails: readonly string[];
  readonly verifier: PrivyAccessTokenVerifier;
  readonly users: PrivyUserReader;
}

/** Extracts one Privy access-token JWT from the Authorization header only. */
export function extractBearerAccessToken(
  authorization: string | null | undefined,
): string {
  if (
    typeof authorization !== "string" ||
    authorization.length > MAX_ACCESS_TOKEN_LENGTH + 7 ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new AuthenticationError();
  }

  const token = authorization.slice(7);
  if (
    token.length === 0 ||
    token.length > MAX_ACCESS_TOKEN_LENGTH ||
    !ACCESS_TOKEN_PATTERN.test(token)
  ) {
    throw new AuthenticationError();
  }

  return token;
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!emailSchema.safeParse(normalized).success) {
    throw new Error("Operator emails must be valid email addresses");
  }
  return normalized;
}

export function parseOperatorEmails(value: string): readonly string[] {
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => entry.length === 0)) {
    throw new Error("Operator emails must be a non-empty comma-separated list");
  }

  return Object.freeze([...new Set(entries.map(normalizeEmail))].sort());
}

function validIntegerTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function assertValidClaims(
  claims: VerifiedPrivyAccessToken,
  expectedAppId: string,
  nowSeconds: number,
): void {
  if (
    claims.appId !== expectedAppId ||
    claims.issuer !== "privy.io" ||
    !validIntegerTimestamp(claims.issuedAt) ||
    !validIntegerTimestamp(claims.expiration) ||
    claims.issuedAt > nowSeconds + MAX_CLOCK_SKEW_SECONDS ||
    claims.expiration <= nowSeconds ||
    claims.issuedAt >= claims.expiration ||
    !SESSION_ID_PATTERN.test(claims.sessionId) ||
    !PRIVY_DID_PATTERN.test(claims.userId)
  ) {
    throw new AuthenticationError();
  }
}

function verifiedGoogleEmail(
  linkedAccounts: readonly Readonly<Record<string, unknown>>[],
  nowSeconds: number,
): string {
  const googleAccounts = linkedAccounts.filter(
    (account) => account.type === "google_oauth",
  );
  if (googleAccounts.length !== 1) throw new AuthenticationError();

  const [account] = googleAccounts;
  if (
    typeof account.email !== "string" ||
    typeof account.subject !== "string" ||
    account.subject.length === 0 ||
    account.subject.length > 512 ||
    !validIntegerTimestamp(account.verified_at) ||
    account.verified_at > nowSeconds
  ) {
    throw new AuthenticationError();
  }

  try {
    return normalizeEmail(account.email);
  } catch {
    throw new AuthenticationError();
  }
}

/** Verifies a Privy bearer session and binds it to one verified Google identity. */
export async function verifyPrivySession(
  input: VerifyPrivySessionInput,
): Promise<VerifiedPrivySession> {
  const accessToken = extractBearerAccessToken(input.authorization);
  if (
    !Number.isSafeInteger(input.nowSeconds) ||
    input.nowSeconds <= 0 ||
    input.expectedAppId.length === 0
  ) {
    throw new AuthenticationError();
  }

  let claims: VerifiedPrivyAccessToken;
  try {
    claims = await input.verifier.verify(accessToken);
  } catch {
    // Never propagate SDK errors because they may contain bearer-token material.
    throw new AuthenticationError();
  }
  assertValidClaims(claims, input.expectedAppId, input.nowSeconds);

  let user: PrivyUserRecord;
  try {
    user = await input.users.get(claims.userId);
  } catch {
    throw new AuthenticationError();
  }
  if (user.id !== claims.userId || !Array.isArray(user.linkedAccounts)) {
    throw new AuthenticationError();
  }

  const email = verifiedGoogleEmail(user.linkedAccounts, input.nowSeconds);
  let operators: Set<string>;
  try {
    operators = new Set(input.operatorEmails.map(normalizeEmail));
  } catch {
    throw new AuthenticationError();
  }

  return Object.freeze({
    privyDid: claims.userId,
    sessionId: claims.sessionId,
    verifiedGoogleEmail: email,
    isOperator: operators.has(email),
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiration,
  });
}
