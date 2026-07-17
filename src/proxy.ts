import { NextResponse, type NextRequest } from "next/server";

import {
  buildSecurityHeaders,
  createRequestNonce,
  type CspEnforcement,
} from "@/server/security/headers";

function enforcementMode(): CspEnforcement {
  return process.env.CSP_ENFORCEMENT_MODE === "enforce"
    ? "enforce"
    : "report-only";
}

/** Security only. Route handlers remain the authorization boundary. */
export function proxy(request: NextRequest): NextResponse {
  const nonce = createRequestNonce();
  const securityHeaders = buildSecurityHeaders(nonce, {
    enforcement: enforcementMode(),
    development: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  for (const [name, value] of securityHeaders) requestHeaders.set(name, value);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of securityHeaders) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
