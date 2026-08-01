import { bytesToHex, hexToBytes, utf8Bytes } from "./bytes.js";
import { invariant } from "./errors.js";
import { sha256 } from "./hash.js";
import { canonicalizeJson, type JsonValue } from "./jcs.js";

export interface ManifestAlias {
  readonly key: string;
  readonly label: string;
}

export interface CircleContextManifest {
  readonly protocol: "witc";
  readonly version: 1;
  readonly kind: "circle";
  readonly nonce: string;
  readonly title: string;
  readonly created: string;
  readonly expires: string;
  readonly orbit?: string;
  readonly host?: string;
  readonly media?: string;
  readonly aliases?: readonly ManifestAlias[];
  readonly description?: string;
  readonly renderer?: string;
}

const MANIFEST_KEYS = new Set([
  "protocol",
  "version",
  "kind",
  "nonce",
  "title",
  "created",
  "expires",
  "orbit",
  "host",
  "media",
  "aliases",
  "description",
  "renderer",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertBoundedString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): asserts value is string {
  invariant(typeof value === "string", "INVALID_CONTEXT_MANIFEST", `${field} must be a string`);
  const bytes = utf8Bytes(value).length;
  invariant(
    bytes >= minimum && bytes <= maximum,
    "INVALID_CONTEXT_MANIFEST",
    `${field} has an invalid UTF-8 byte length`,
    {
      field,
      minimum,
      maximum,
      actual: bytes,
    },
  );
}

function parseUtc(value: string, field: string): number {
  invariant(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),
    "INVALID_CONTEXT_MANIFEST",
    `${field} must be an RFC 3339 UTC timestamp`,
  );
  const parsed = Date.parse(value);
  invariant(
    Number.isFinite(parsed),
    "INVALID_CONTEXT_MANIFEST",
    `${field} is not a valid timestamp`,
  );
  return parsed;
}

export function validateContextManifest(value: unknown): CircleContextManifest {
  invariant(isRecord(value), "INVALID_CONTEXT_MANIFEST", "Context manifest must be an object");
  for (const key of Object.keys(value)) {
    invariant(MANIFEST_KEYS.has(key), "INVALID_CONTEXT_MANIFEST", "Unknown v1 context field", {
      key,
    });
  }
  invariant(value["protocol"] === "witc", "INVALID_CONTEXT_MANIFEST", "protocol must be witc");
  invariant(value["version"] === 1, "INVALID_CONTEXT_MANIFEST", "version must be 1");
  invariant(value["kind"] === "circle", "INVALID_CONTEXT_MANIFEST", "kind must be circle");
  invariant(
    typeof value["nonce"] === "string" && /^[0-9a-f]{32}$/.test(value["nonce"]),
    "INVALID_CONTEXT_MANIFEST",
    "nonce must be 16 bytes of lowercase hex",
  );
  assertBoundedString(value["title"], "title", 1, 120);
  assertBoundedString(value["created"], "created", 20, 24);
  assertBoundedString(value["expires"], "expires", 20, 24);
  const created = parseUtc(value["created"], "created");
  const expires = parseUtc(value["expires"], "expires");
  invariant(expires > created, "INVALID_CONTEXT_MANIFEST", "expires must be later than created");
  if (value["orbit"] !== undefined) assertBoundedString(value["orbit"], "orbit", 1, 96);
  if (value["host"] !== undefined) assertBoundedString(value["host"], "host", 1, 256);
  if (value["media"] !== undefined) assertBoundedString(value["media"], "media", 1, 512);
  if (value["description"] !== undefined)
    assertBoundedString(value["description"], "description", 1, 1_024);
  if (value["renderer"] !== undefined) assertBoundedString(value["renderer"], "renderer", 1, 256);
  if (value["aliases"] !== undefined) {
    invariant(
      Array.isArray(value["aliases"]),
      "INVALID_CONTEXT_MANIFEST",
      "aliases must be an array",
    );
    invariant(
      value["aliases"].length <= 16,
      "INVALID_CONTEXT_MANIFEST",
      "aliases may contain at most 16 entries",
    );
    const keys = new Set<string>();
    for (const alias of value["aliases"]) {
      invariant(isRecord(alias), "INVALID_CONTEXT_MANIFEST", "Each alias must be an object");
      invariant(
        Object.keys(alias).every((key) => key === "key" || key === "label"),
        "INVALID_CONTEXT_MANIFEST",
        "Alias contains an unknown field",
      );
      invariant(
        typeof alias["key"] === "string",
        "INVALID_CONTEXT_MANIFEST",
        "Alias key must be a string",
      );
      hexToBytes(alias["key"], 32);
      assertBoundedString(alias["label"], "alias.label", 1, 48);
      invariant(!keys.has(alias["key"]), "INVALID_CONTEXT_MANIFEST", "Alias keys must be unique");
      keys.add(alias["key"]);
    }
  }
  return value as unknown as CircleContextManifest;
}

export function canonicalizeContextManifest(value: unknown): string {
  const manifest = validateContextManifest(value);
  return canonicalizeJson(manifest as unknown as JsonValue);
}

export function contextHash(value: unknown): string {
  return bytesToHex(sha256(utf8Bytes(canonicalizeContextManifest(value))));
}
