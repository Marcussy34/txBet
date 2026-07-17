import {
  decryptEnvelope,
  encryptEnvelope,
  type EncryptedEnvelopeV1,
  type EnvelopeKey,
} from "./envelope";

export class EnvelopeKeyring {
  readonly #activeKeyId: string;
  readonly #keys: ReadonlyMap<string, Uint8Array>;

  constructor(activeKeyId: string, keys: readonly EnvelopeKey[]) {
    const copiedKeys = new Map<string, Uint8Array>();

    for (const entry of keys) {
      if (copiedKeys.has(entry.id)) {
        throw new Error(`Duplicate envelope key ID: ${entry.id}`);
      }
      if (entry.key.byteLength !== 32) {
        throw new Error("Envelope keys must contain exactly 32 bytes");
      }
      copiedKeys.set(entry.id, new Uint8Array(entry.key));
    }

    if (!copiedKeys.has(activeKeyId)) {
      throw new Error("The active envelope key ID is missing from the keyring");
    }

    this.#activeKeyId = activeKeyId;
    this.#keys = copiedKeys;
  }

  get activeKeyId(): string {
    return this.#activeKeyId;
  }

  encrypt(plaintext: Uint8Array, aad: Uint8Array): EncryptedEnvelopeV1 {
    const key = this.#keys.get(this.#activeKeyId);
    // The constructor proves this invariant; keep the runtime guard fail-closed.
    if (!key) throw new Error("Active envelope key is unavailable");

    return encryptEnvelope(plaintext, aad, {
      id: this.#activeKeyId,
      key,
    });
  }

  decrypt(envelope: EncryptedEnvelopeV1, aad: Uint8Array): Uint8Array {
    const key = this.#keys.get(envelope.keyId);
    if (!key) {
      throw new Error(`Unknown envelope key ID: ${envelope.keyId}`);
    }

    // Select exactly the declared key; never probe historical keys.
    return decryptEnvelope(envelope, aad, key);
  }
}
