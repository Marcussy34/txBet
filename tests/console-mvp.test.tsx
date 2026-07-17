import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TxBetConsole } from "@/components/dashboard/txbet-console";

describe("quick MVP console disclosures", () => {
  it("keeps replay and execution disclosures beside the live read-only boundaries", () => {
    const markup = renderToStaticMarkup(createElement(TxBetConsole));

    expect(markup).toContain("MVP live boundaries");
    expect(markup).toContain("SYNTHETIC REPLAY");
    expect(markup).toContain("SIMULATED EXECUTION");
    expect(markup).toContain("TxLINE");
    expect(markup).toContain("Polymarket");
  });
});
