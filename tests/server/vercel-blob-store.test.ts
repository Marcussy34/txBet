import { describe, expect, it, vi } from "vitest";

import { BlobJournalConflictError } from "@/server/execution/blob-journal";
import {
  createVercelBlobJournalStore,
  listVercelExecutionProfileIds,
  type VercelBlobListSdkBoundary,
  type VercelBlobSdkBoundary,
} from "@/server/execution/vercel-blob-store";

function stream(body: string): ReadableStream<Uint8Array> {
  return new Response(body).body as ReadableStream<Uint8Array>;
}

describe("Vercel Blob journal store", () => {
  it("reads private content directly from origin with its ETag", async () => {
    const sdk: VercelBlobSdkBoundary = {
      get: vi.fn(async () => ({
        statusCode: 200 as const,
        stream: stream('{"safe":true}'),
        etag: "etag-1",
      })),
      put: vi.fn(),
      isPreconditionFailure: vi.fn(() => false),
    };
    const store = createVercelBlobJournalStore(sdk);

    await expect(store.read("txbet/execution/a/journal.json")).resolves.toEqual({
      body: '{"safe":true}',
      etag: "etag-1",
    });
    expect(sdk.get).toHaveBeenCalledWith("txbet/execution/a/journal.json", {
      access: "private",
      useCache: false,
    });
  });

  it("uses create-only and ETag-conditional replacement writes", async () => {
    const put = vi
      .fn()
      .mockResolvedValueOnce({ etag: "etag-1" })
      .mockResolvedValueOnce({ etag: "etag-2" });
    const sdk: VercelBlobSdkBoundary = {
      get: vi.fn(async () => null),
      put,
      isPreconditionFailure: vi.fn(() => false),
    };
    const store = createVercelBlobJournalStore(sdk);

    await expect(store.create("journal.json", "first")).resolves.toEqual({
      etag: "etag-1",
    });
    await expect(store.replace("journal.json", "second", "etag-1")).resolves.toEqual({
      etag: "etag-2",
    });
    expect(put).toHaveBeenNthCalledWith(1, "journal.json", "first", {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType: "application/json",
    });
    expect(put).toHaveBeenNthCalledWith(2, "journal.json", "second", {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json",
      ifMatch: "etag-1",
    });
  });

  it("maps only official precondition failures to retryable CAS conflicts", async () => {
    const conflict = new Error("official precondition failure");
    const sdk: VercelBlobSdkBoundary = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => Promise.reject(conflict)),
      isPreconditionFailure: vi.fn((error) => error === conflict),
    };
    const store = createVercelBlobJournalStore(sdk);

    await expect(store.create("journal.json", "body")).rejects.toBeInstanceOf(
      BlobJournalConflictError,
    );
    await expect(store.replace("journal.json", "body", "etag-1")).rejects.toBeInstanceOf(
      BlobJournalConflictError,
    );
  });

  it("paginates only exact execution journals into unique Privy profile IDs", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        blobs: [
          { pathname: "txbet/execution/did%3Aprivy%3Auser-2/journal.json" },
          { pathname: "txbet/execution/not-a-profile/journal.json" },
          { pathname: "txbet/other.json" },
        ],
        cursor: "page-2",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        blobs: [
          { pathname: "txbet/execution/did%3Aprivy%3Auser-1/journal.json" },
          { pathname: "txbet/execution/did%3Aprivy%3Auser-2/journal.json" },
        ],
        hasMore: false,
      });
    const sdk: VercelBlobListSdkBoundary = { list };

    await expect(listVercelExecutionProfileIds(sdk)).resolves.toEqual([
      "did:privy:user-1",
      "did:privy:user-2",
    ]);
    expect(list).toHaveBeenNthCalledWith(1, {
      prefix: "txbet/execution/",
      limit: 1_000,
    });
    expect(list).toHaveBeenNthCalledWith(2, {
      prefix: "txbet/execution/",
      limit: 1_000,
      cursor: "page-2",
    });
  });
});
