import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to txBet even when a parent directory has another workspace file.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
