type DeploymentEnv = Readonly<Record<string, string | undefined>>;

function parseHttpUrl(value: string): URL {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported scheme");
    }
    return url;
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid http or https URL");
  }
}

export function resolveMetadataBase(env: DeploymentEnv): URL {
  const configured = env.NEXT_PUBLIC_SITE_URL;
  if (configured) return parseHttpUrl(configured);
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL;
  if (vercelHost) return parseHttpUrl(vercelHost);
  return new URL("http://localhost:3000");
}
