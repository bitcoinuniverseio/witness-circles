import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { concatBytes, utf8Bytes } from "./bytes.js";

export function sha256(bytes: Uint8Array): Uint8Array {
  return nobleSha256(bytes);
}

export function doubleSha256(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes));
}

export function taggedHash(tag: string, message: Uint8Array): Uint8Array {
  const tagHash = sha256(utf8Bytes(tag));
  return sha256(concatBytes(tagHash, tagHash, message));
}
