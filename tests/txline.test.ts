import type { EventSourceFetchInit } from "eventsource";
import { describe, expect, it, vi } from "vitest";
import {
  buildOddsStreamUrl,
  buildScoreSnapshotUrl,
  buildScoreStreamUrl,
  createTxLineStreamFetch,
  fetchScoreSnapshot,
  startGuestSession,
} from "../src/lib/txline/client";
import { normalizeTxLineEvent } from "../src/lib/txline/normalize";

describe("TxLINE boundary", () => {
  it("normalizes a PascalCase red-card payload", () => {
    expect(normalizeTxLineEvent({
      FixtureId: 18218149,
      MessageId: "msg-1",
      Action: "Red Card",
      IncidentParticipant: "Spain",
      Minute: "63",
      Ts: 1_800_000_000_000,
      Confirmed: true,
    })).toMatchObject({
      id: "msg-1",
      fixtureId: "18218149",
      action: "red_card",
      team: "Spain",
      minute: 63,
      confirmed: true,
    });
  });

  it("fails closed when confirmation is absent", () => {
    expect(normalizeTxLineEvent({ FixtureId: 1, Action: "Goal" })?.confirmed).toBe(false);
  });

  it("ignores score actions outside the supported trigger contract", () => {
    expect(normalizeTxLineEvent({ FixtureId: 1, Action: "Throw In" })).toBeNull();
  });

  it("builds the documented score endpoints", () => {
    expect(buildScoreSnapshotUrl("https://txline.txodds.com", "123")).toBe(
      "https://txline.txodds.com/api/scores/snapshot/123",
    );
    expect(buildScoreStreamUrl("https://txline.txodds.com", "123")).toBe(
      "https://txline.txodds.com/api/scores/stream?fixtureId=123",
    );
    expect(buildOddsStreamUrl("https://txline.txodds.com", "123")).toBe(
      "https://txline.txodds.com/api/odds/stream?fixtureId=123",
    );
  });

  it("preserves EventSource headers while adding stream authentication", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const streamFetch = createTxLineStreamFetch("guest-jwt", "api-token", fetcher);
    const init = {
      cache: "no-store",
      headers: {
        Accept: "text/event-stream",
        Authorization: "Bearer stale-credential",
        "Last-Event-ID": "event-42",
        "X-Api-Token": "stale-token",
        "X-EventSource-Trace": "keep-me",
      },
      mode: "cors",
      redirect: "follow",
      signal: new AbortController().signal,
    } satisfies EventSourceFetchInit;

    await streamFetch("https://txline.txodds.com/api/scores/stream", init);

    const requestInit = fetcher.mock.calls[0]?.[1];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("last-event-id")).toBe("event-42");
    expect(headers.get("x-eventsource-trace")).toBe("keep-me");
    expect(headers.get("authorization")).toBe("Bearer guest-jwt");
    expect(headers.get("x-api-token")).toBe("api-token");
  });

  it("forwards one abort signal through guest auth and snapshot body reads", async () => {
    const signal = new AbortController().signal;
    const guestFetch = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ token: "guest-jwt" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const snapshotFetch = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await startGuestSession("https://txline.txodds.com", {
      fetcher: guestFetch,
      signal,
    });
    await fetchScoreSnapshot({
      baseUrl: "https://txline.txodds.com",
      fixtureId: "123",
      guestJwt: "guest-jwt",
      apiToken: "api-token",
      fetcher: snapshotFetch,
      signal,
    });

    expect(guestFetch.mock.calls[0]?.[1]?.signal).toBe(signal);
    expect(snapshotFetch.mock.calls[0]?.[1]?.signal).toBe(signal);
  });
});
