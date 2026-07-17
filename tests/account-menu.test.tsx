import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountMenuBalanceList } from "@/components/auth/account-menu";

describe("account menu balances", () => {
  it("marks unobserved venue balances as not loaded instead of reporting zero cash", () => {
    const markup = renderToStaticMarkup(createElement(AccountMenuBalanceList));

    expect(markup).toContain("Available cash");
    expect(markup).toContain("Polymarket balance not loaded");
    expect(markup).toContain("Kalshi balance not loaded");
    expect(markup).toContain("Not loaded");
    expect(markup).not.toContain("$0.00");
  });
});
