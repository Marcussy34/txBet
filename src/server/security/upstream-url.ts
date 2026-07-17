export interface UpstreamPolicy {
  readonly protocols: readonly string[];
  readonly hosts: readonly string[];
}

const SECURE_UPSTREAM_PROTOCOLS = new Set(["https:", "wss:"]);

/**
 * Validates a fully qualified upstream before a caller attaches credentials.
 * Hosts are exact matches; configured hosts never authorize subdomains.
 */
export function assertAllowedUpstream(
  input: string | URL,
  policy: UpstreamPolicy,
): URL {
  let url: URL;

  try {
    // Clone URL inputs so callers cannot mutate the validated instance later.
    url = new URL(input.toString());
  } catch {
    throw new Error("A valid upstream URL is required");
  }

  if (url.username || url.password) {
    throw new Error("Upstream URL credentials are forbidden");
  }

  // A caller policy can narrow secure transports, but can never add plaintext ones.
  if (!SECURE_UPSTREAM_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Upstream must use a secure protocol: ${url.protocol}`);
  }

  if (!policy.protocols.includes(url.protocol)) {
    throw new Error(`Upstream protocol is not allowed: ${url.protocol}`);
  }

  const allowedHosts = new Set(policy.hosts.map((host) => host.toLowerCase()));
  if (!allowedHosts.has(url.host.toLowerCase())) {
    throw new Error(`Upstream host is not allowed: ${url.host}`);
  }

  return url;
}

/**
 * The single credential-bearing fetch boundary. Redirects are errors so a
 * credential cannot be forwarded to a location that was never validated.
 */
export async function fetchCredentialed(
  input: string | URL,
  init: RequestInit,
  policy: UpstreamPolicy,
  fetchImplementation: typeof fetch = fetch,
): Promise<Response> {
  const url = assertAllowedUpstream(input, policy);
  if (url.protocol !== "https:") {
    throw new Error("Credential-bearing fetch requires HTTPS");
  }

  return fetchImplementation(url, {
    ...init,
    redirect: "error",
  });
}
