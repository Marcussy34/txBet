# Envelope key rotation

txBet encrypts venue credentials and replayable execution artifacts with AES-256-GCM.
Each envelope records a key ID; decryption selects that key directly and never probes the
rest of the keyring. Key material belongs only in the execution-worker secret store.

## Keyring shape

`TXBET_ENVELOPE_KEYRING_JSON` is strict JSON. Every key is canonical base64 that decodes
to exactly 32 bytes. IDs are unique, and `TXBET_ENVELOPE_ACTIVE_KEY_ID` must name one of
them.

```json
{
  "keys": [
    { "id": "2026-08-active", "keyBase64": "<32-byte-base64>" },
    { "id": "2026-07-decrypt-only", "keyBase64": "<32-byte-base64>" }
  ]
}
```

Generate key bytes with an approved cryptographic random source. Never paste a key into
logs, tickets, chat, source control, database rows, or deployment output.

## Rotation procedure

1. Create a new 32-byte key and a new non-secret key ID.
2. Add the new key to the execution-worker secret store while retaining every old key.
3. Set the new ID as active and deploy the execution worker. New writes now use it; old
   keys are decrypt-only.
4. Verify worker startup, one new encrypted write, and decryption of representative old
   envelopes. A startup parse error is a failed rotation; do not remove any old key.
5. Start the crash-safe re-encryption job. It claims one row, decrypts by the recorded old
   key ID, re-encrypts with the active key using the identical semantic AAD, and updates
   with an optimistic row version. A conflict is re-read, not overwritten.
6. Resume the same job after any crash. A crash before the versioned update leaves the old
   envelope valid. A crash after it leaves the new envelope valid. Concurrent workers may
   race, but only one matching row version can win.
7. Keep old keys until database checks show zero references in venue credentials,
   prepared or signed artifacts, pending/reconciling/cancellation/compensation/redemption
   attempts, and unresolved `UNKNOWN` operations.
8. Remove one unreferenced old key, deploy, and repeat the startup and decryption checks.

Never rotate by rewriting every row in one transaction. Never change AAD to make a failed
decrypt pass. AAD mismatch is an integrity failure that pauses the affected venue/account.

## Rollback

If the new active key cannot be used, redeploy the prior keyring with the old key active
and the new key retained as decrypt-only. Rows already rewritten with the new key remain
readable. Do not restore an old database snapshot or delete new-key rows.

## Removal gate

The removal check must fail closed when the database is unavailable or when any key-ID
reference count is uncertain. It must include, at minimum:

- encrypted venue credential rows;
- every prepared and signed `execution_artifacts` row;
- pending, submitting, reconciling, cancel, compensation, and redemption attempts;
- unresolved `UNKNOWN` records and their immutable audit artifacts.

Before the rotation job can ship, its release gate must add automated tests for
crash-before-update, crash-after-update, concurrent optimistic conflicts, rollback to the
previous active key, and refusal to remove a referenced key.
