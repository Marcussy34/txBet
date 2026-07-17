import {
  BlobPreconditionFailedError,
  get,
  list,
  put,
} from "@vercel/blob";

import {
  BlobJournalConflictError,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";

interface BlobGetResult {
  readonly statusCode: 200 | 304;
  readonly stream: ReadableStream<Uint8Array> | null;
  readonly etag: string;
}

interface BlobPutOptions {
  readonly access: "private";
  readonly addRandomSuffix: false;
  readonly allowOverwrite: boolean;
  readonly cacheControlMaxAge: 60;
  readonly contentType: "application/json";
  readonly ifMatch?: string;
}

export interface VercelBlobSdkBoundary {
  get(
    pathname: string,
    options: Readonly<{ access: "private"; useCache: false }>,
  ): Promise<BlobGetResult | null>;
  put(
    pathname: string,
    body: string,
    options: BlobPutOptions,
  ): Promise<Readonly<{ etag: string }>>;
  isPreconditionFailure(error: unknown): boolean;
}

export interface VercelBlobListSdkBoundary {
  list(options: Readonly<{
    prefix: "txbet/execution/";
    limit: 1_000;
    cursor?: string;
  }>): Promise<Readonly<{
    blobs: readonly Readonly<{ pathname: string }>[];
    hasMore: boolean;
    cursor?: string;
  }>>;
}

const officialVercelBlobSdk: VercelBlobSdkBoundary = {
  async get(pathname, options) {
    const result = await get(pathname, options);
    if (result === null) return null;
    return {
      statusCode: result.statusCode,
      stream: result.stream,
      etag: result.blob.etag,
    };
  },
  put,
  isPreconditionFailure(error) {
    return error instanceof BlobPreconditionFailedError;
  },
};

const officialVercelBlobListSdk: VercelBlobListSdkBoundary = {
  list: (options) => list(options),
};

const PROFILE_ID = /^did:privy:[A-Za-z0-9._:-]{1,500}$/;
const JOURNAL_PATH = /^txbet\/execution\/([^/]+)\/journal\.json$/;
const MAX_LIST_PAGES = 100;

function profileIdFromPathname(pathname: string): string | null {
  const segment = JOURNAL_PATH.exec(pathname)?.[1];
  if (segment === undefined) return null;
  let profileId: string;
  try {
    profileId = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (
    !PROFILE_ID.test(profileId) ||
    encodeURIComponent(profileId) !== segment
  ) {
    return null;
  }
  return profileId;
}

/** Lists the private journals that define the profiles Vercel Cron may wake. */
export async function listVercelExecutionProfileIds(
  sdk: VercelBlobListSdkBoundary = officialVercelBlobListSdk,
): Promise<readonly string[]> {
  const profiles = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await sdk.list({
      prefix: "txbet/execution/",
      limit: 1_000,
      ...(cursor === undefined ? {} : { cursor }),
    });
    for (const blob of result.blobs) {
      const profileId = profileIdFromPathname(blob.pathname);
      if (profileId !== null) profiles.add(profileId);
    }
    if (!result.hasMore) {
      return Object.freeze([...profiles].sort());
    }
    if (result.cursor === undefined || result.cursor.trim().length === 0) {
      throw new Error("Vercel Blob profile listing omitted its next cursor");
    }
    cursor = result.cursor;
  }
  throw new Error("Vercel Blob profile listing exceeded its page limit");
}

function putOptions(expectedEtag?: string): BlobPutOptions {
  return {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: expectedEtag !== undefined,
    cacheControlMaxAge: 60,
    contentType: "application/json",
    ...(expectedEtag === undefined ? {} : { ifMatch: expectedEtag }),
  };
}

async function write(
  sdk: VercelBlobSdkBoundary,
  pathname: string,
  body: string,
  expectedEtag?: string,
): Promise<Readonly<{ etag: string }>> {
  try {
    const result = await sdk.put(pathname, body, putOptions(expectedEtag));
    if (result.etag.trim().length === 0) {
      throw new Error("Vercel Blob write returned no ETag");
    }
    return Object.freeze({ etag: result.etag });
  } catch (error) {
    if (sdk.isPreconditionFailure(error)) {
      throw new BlobJournalConflictError();
    }
    throw error;
  }
}

/** Production private-Blob adapter. It always bypasses CDN cache before a CAS write. */
export function createVercelBlobJournalStore(
  sdk: VercelBlobSdkBoundary = officialVercelBlobSdk,
): BlobJournalObjectStore {
  return Object.freeze({
    async read(pathname: string) {
      const result = await sdk.get(pathname, {
        access: "private",
        useCache: false,
      });
      if (result === null) return null;
      if (result.statusCode !== 200 || result.stream === null) {
        throw new Error("Vercel Blob returned an unexpected conditional response");
      }
      if (result.etag.trim().length === 0) {
        throw new Error("Vercel Blob read returned no ETag");
      }
      return Object.freeze({
        body: await new Response(result.stream).text(),
        etag: result.etag,
      });
    },
    create(pathname: string, body: string) {
      return write(sdk, pathname, body);
    },
    replace(pathname: string, body: string, expectedEtag: string) {
      if (expectedEtag.trim().length === 0) {
        throw new Error("Vercel Blob replacement requires an ETag");
      }
      return write(sdk, pathname, body, expectedEtag);
    },
  });
}
