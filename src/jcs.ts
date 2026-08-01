import { bytesToHex, utf8Bytes } from "./bytes.js";
import { invariant } from "./errors.js";
import { sha256 } from "./hash.js";

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      invariant(
        next >= 0xdc00 && next <= 0xdfff,
        "INVALID_CONTEXT_MANIFEST",
        "String contains an unpaired high surrogate",
      );
      index += 1;
    } else {
      invariant(
        !(code >= 0xdc00 && code <= 0xdfff),
        "INVALID_CONTEXT_MANIFEST",
        "String contains an unpaired low surrogate",
      );
    }
  }
}

function serialize(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "INVALID_CONTEXT_MANIFEST", "JCS numbers must be finite");
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertValidUnicode(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(",")}]`;
  }
  invariant(typeof value === "object", "INVALID_CONTEXT_MANIFEST", "Unsupported JSON value");
  const object = value as { readonly [key: string]: JsonValue };
  const keys = Object.keys(object).sort();
  return `{${keys
    .map((key) => {
      assertValidUnicode(key);
      const child = object[key];
      invariant(child !== undefined, "INVALID_CONTEXT_MANIFEST", "Undefined is not valid JSON");
      return `${JSON.stringify(key)}:${serialize(child)}`;
    })
    .join(",")}}`;
}

export function canonicalizeJson(value: JsonValue): string {
  return serialize(value);
}

export function parseCanonicalJson(source: string): JsonValue {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new TypeError(
      `Invalid JSON: ${error instanceof Error ? error.message : "parse failure"}`,
    );
  }
  const canonical = canonicalizeJson(value as JsonValue);
  invariant(source === canonical, "NON_CANONICAL_JSON", "JSON is not in RFC 8785 canonical form", {
    canonical,
  });
  return value as JsonValue;
}

export function hashCanonicalJson(value: JsonValue): string {
  return bytesToHex(sha256(utf8Bytes(canonicalizeJson(value))));
}
