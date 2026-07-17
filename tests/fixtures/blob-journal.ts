import {
  canonicalJson,
  sha256Canonical,
  type JsonValue,
} from "@/core/canonical-json";
import type { BlobJournalEventInput } from "@/server/execution/blob-journal";

/** Builds a hash-valid stored journal directly for high boundary tests. */
export function blobJournalFixture(
  profileId: string,
  inputs: readonly BlobJournalEventInput[],
): string {
  let previousHash: string | null = null;
  const events = inputs.map((event) => {
    const eventHash = `sha256:${sha256Canonical({
      hashDomain: "txbet:blob-journal-event:v1",
      profileId,
      id: event.id,
      kind: event.kind,
      occurredAtMs: event.occurredAtMs,
      payload: event.payload,
      previousHash,
    })}`;
    const stored = {
      ...event,
      previousHash,
      eventHash,
    };
    previousHash = eventHash;
    return stored;
  });

  return canonicalJson({
    schemaVersion: "txbet-blob-journal-v1",
    profileId,
    revision: events.length,
    events,
  } as unknown as JsonValue);
}
