import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Match the application alias so component-level regression tests load the same modules as Next.js.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/core/**/*.ts", "src/agents/**/*.ts", "src/lib/txline/**/*.ts"],
    },
  },
});
