import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountMenuBalanceList } from "@/components/auth/account-menu";

describe("account menu balances", () => {
  it("shows $0 for venue balances until an authoritative adapter reports real cash", () => {
    const markup = renderToStaticMarkup(createElement(AccountMenuBalanceList));

    expect(markup).toContain("Available cash");
    expect(markup).toContain("Polymarket balance $0");
    expect(markup).toContain("Kalshi balance $0");
    expect(markup).toContain("$0");
    expect(markup).not.toContain("Not loaded");
  });
});
