import { defineConfig } from "@playwright/test";

import { sanitizeTestServerEnvironment } from "./src/server/security/test-environment";

// Spawn the test server without inheriting production credentials. Empty values also
// prevent Next.js dotenv loading from restoring a credential with the same name.
const webServerEnv = sanitizeTestServerEnvironment(process.env);

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    env: webServerEnv,
    reuseExistingServer: false,
    url: "http://127.0.0.1:3000",
  },
});
