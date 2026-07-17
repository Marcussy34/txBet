export const REDACTED = "[REDACTED]" as const;
const CIRCULAR = "[CIRCULAR]" as const;
const UNSUPPORTED_OBJECT = "[UNSUPPORTED OBJECT]" as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);

  return (
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized === "cookie" ||
    normalized === "setcookie" ||
    normalized.includes("hmac") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("privatekey") ||
    normalized.endsWith("secretkey") ||
    normalized.endsWith("password") ||
    normalized.endsWith("passphrase") ||
    normalized.endsWith("keybase64") ||
    normalized.endsWith("keybytes") ||
    normalized.includes("envelopekeyring") ||
    normalized.endsWith("seedphrase") ||
    normalized.endsWith("mnemonic") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("signature") ||
    normalized.endsWith("token") ||
    normalized.endsWith("signedpayload")
  );
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Returns a credential-safe clone suitable for structured logs and audit metadata. */
export function redactSensitive(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof Headers !== "undefined" && value instanceof Headers) {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, entry] of value.entries()) {
      result[key] = isSensitiveKey(key) ? REDACTED : entry;
    }
    return result;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return CIRCULAR;
    seen.add(value);
    const result =
      value.length === 2 && typeof value[0] === "string" && isSensitiveKey(value[0])
        ? [value[0], REDACTED]
        : value.map((entry) => redactValue(entry, seen));
    seen.delete(value);
    return result;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }
  if (!isPlainRecord(value)) return UNSUPPORTED_OBJECT;

  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  // A null prototype prevents an attacker-controlled __proto__ key from mutating the clone.
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, entry] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactValue(entry, seen);
  }

  seen.delete(value);
  return result;
}
