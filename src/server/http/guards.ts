import type { z } from "zod";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;

export class HttpGuardError extends Error {
  override readonly name = "HttpGuardError";
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function bearerToken(request: Request): string {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) {
    throw new HttpGuardError(401, "BEARER_REQUIRED", "A valid bearer token is required");
  }
  return match[1];
}

function assertJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType?.toLowerCase() !== "application/json") {
    throw new HttpGuardError(415, "JSON_REQUIRED", "Mutation body must use JSON");
  }
}

function assertSameOrigin(request: Request, expectedOrigin: string): void {
  let canonicalExpected: string;
  try {
    const parsed = new URL(expectedOrigin);
    canonicalExpected = parsed.origin;
    if (canonicalExpected !== expectedOrigin || !["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("noncanonical");
    }
  } catch {
    throw new Error("Configured mutation origin is invalid");
  }

  const supplied = request.headers.get("origin");
  if (supplied === null || supplied !== canonicalExpected) {
    throw new HttpGuardError(403, "ORIGIN_MISMATCH", "Mutation origin is not allowed");
  }
}

export interface JsonMutationOptions<Body> {
  readonly expectedOrigin: string;
  readonly schema: z.ZodType<Body>;
  readonly requireIdempotencyKey: boolean;
}

export interface GuardedJsonMutation<Body> {
  readonly accessToken: string;
  readonly body: Body;
  readonly idempotencyKey: string | null;
}

export async function requireJsonMutation<Body>(
  request: Request,
  options: JsonMutationOptions<Body>,
): Promise<GuardedJsonMutation<Body>> {
  const accessToken = bearerToken(request);
  assertJsonContentType(request);
  assertSameOrigin(request, options.expectedOrigin);

  const suppliedKey = request.headers.get("idempotency-key");
  if (
    options.requireIdempotencyKey &&
    (suppliedKey === null || !IDEMPOTENCY_KEY.test(suppliedKey))
  ) {
    throw new HttpGuardError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A bounded idempotency key is required",
    );
  }
  if (suppliedKey !== null && !IDEMPOTENCY_KEY.test(suppliedKey)) {
    throw new HttpGuardError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency key is invalid");
  }

  let body: Body;
  try {
    body = options.schema.parse(await request.json());
  } catch {
    throw new HttpGuardError(400, "INVALID_BODY", "Request body is invalid");
  }

  return Object.freeze({
    accessToken,
    body,
    idempotencyKey: suppliedKey,
  });
}

export function assertResourceOwner(
  sessionProfileId: string,
  resourceProfileId: string,
): void {
  if (
    sessionProfileId.trim().length === 0 ||
    resourceProfileId.trim().length === 0 ||
    sessionProfileId !== resourceProfileId
  ) {
    throw new HttpGuardError(403, "OWNERSHIP_MISMATCH", "Resource ownership check failed");
  }
}
