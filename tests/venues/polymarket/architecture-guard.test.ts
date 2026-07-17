import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FORBIDDEN_ONE_SHOT_MUTATIONS = [
  "setupTradingApprovals",
  "prepareTradingApprovals",
  "deployDepositWallet",
  "placeMarketOrder",
  "placeLimitOrder",
  "splitMarketPosition",
  "splitComboPosition",
  "splitPosition",
  "mergeMarketPosition",
  "mergeComboPosition",
  "mergePositions",
  "redeemPositions",
  "approveErc20",
  "approveErc1155ForAll",
  "transferErc20",
  "completeWith",
  "createAndPostOrder",
  "createAndPostMarketOrder",
] as const;

describe("Polymarket production-lane architecture guard", () => {
  it("does not reference SDK helpers that hide mutation or retries", async () => {
    const productionRoot = path.join(ROOT, "src/venues/polymarket");
    const productionFiles = (await readdir(productionRoot, { recursive: true }))
      .filter((relativePath) => relativePath.endsWith(".ts"))
      .map((relativePath) => path.join("src/venues/polymarket", relativePath));

    for (const relativePath of productionFiles) {
      const source = await readFile(path.join(ROOT, relativePath), "utf8");
      for (const helper of FORBIDDEN_ONE_SHOT_MUTATIONS) {
        const identifier = new RegExp(`\\b${helper}\\b`, "u");
        expect(source, `${relativePath} must not reference ${helper}`).not.toMatch(
          identifier,
        );
      }
    }
  });

  it("pins the audited SDK source shape that yields before every retry submit", async () => {
    const packageJson = JSON.parse(
      await readFile(
        path.join(ROOT, "node_modules/@polymarket/client/package.json"),
        "utf8",
      ),
    ) as { version?: unknown };
    expect(packageJson.version).toBe("0.1.0-beta.16");

    const sourceMap = JSON.parse(
      await readFile(
        path.join(ROOT, "node_modules/@polymarket/client/dist/chunk-IBUXKB4V.js.map"),
        "utf8",
      ),
    ) as { sources?: unknown; sourcesContent?: unknown };
    expect(Array.isArray(sourceMap.sources)).toBe(true);
    expect(Array.isArray(sourceMap.sourcesContent)).toBe(true);
    const sources = sourceMap.sources as string[];
    const contents = sourceMap.sourcesContent as string[];
    const index = sources.indexOf("../src/actions/gasless.ts");
    expect(index).toBeGreaterThanOrEqual(0);
    const gaslessSource = contents[index] ?? "";

    expect(gaslessSource).toContain("const GASLESS_SUBMIT_RETRY_ATTEMPTS = 10;");
    expect(gaslessSource).toMatch(
      /yield signGaslessTypedData[\s\S]*return executeGasless\(client, payload\)/u,
    );
    expect(gaslessSource).toMatch(
      /yield signGaslessMessage[\s\S]*return executeGasless\(client,/u,
    );
    expect(createHash("sha256").update(gaslessSource).digest("hex")).toBe(
      "7f2e78c855c184154e42a6096ab1cd9bef89183626ec1f393492a6b168fcb46c",
    );
  });
});
