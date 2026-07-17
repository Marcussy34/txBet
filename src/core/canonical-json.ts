import { createHash } from "node:crypto";

export type JsonValue =
  | null
  | boolean
  | string
  | number
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Canonical JSON for hashes: sorted object keys and safe integer numbers only. */
export function canonicalJson(value: JsonValue): string {
  return serialize(value, new WeakSet<object>());
}

/** Hash only the canonical representation so property insertion order cannot affect evidence. */
export function sha256Canonical(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON numbers must be finite");
    if (!Number.isSafeInteger(value)) {
      throw new Error("JSON numbers used for execution hashes must be safe integers");
    }
    // Reject rather than normalize a second representation of zero in authorization evidence.
    if (Object.is(value, -0)) throw new Error("Canonical JSON cannot contain negative zero");
    return String(value);
  }
  if (typeof value !== "object") {
    throw new Error("Value is not valid canonical JSON");
  }

  if (seen.has(value)) throw new Error("Canonical JSON cannot contain cycles");
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) throw new Error("Canonical JSON arrays cannot be sparse");
        items.push(serialize(value[index], seen));
      }
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Canonical JSON objects must be plain records");
    }

    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw new Error("Canonical JSON cannot contain symbol keys");
    }

    const entries = (keys as string[]).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error("Canonical JSON requires enumerable data properties");
      }
      return `${JSON.stringify(key)}:${serialize(descriptor.value, seen)}`;
    });
    return `{${entries.join(",")}}`;
  } finally {
    seen.delete(value);
  }
}
