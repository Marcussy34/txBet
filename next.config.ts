import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Codex preview may open the dev server through the loopback IP instead of localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // Keep Turbopack scoped to txBet even when a parent directory has another workspace file.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
