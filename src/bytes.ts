import { invariant } from "./errors.js";

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string, expectedLength?: number): Uint8Array {
  invariant(/^(?:[0-9a-fA-F]{2})*$/.test(hex), "INVALID_HEX", "Hex must contain full bytes");
  const bytes = Uint8Array.from(hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  if (expectedLength !== undefined) {
    invariant(bytes.length === expectedLength, "INVALID_HEX", "Hex has an unexpected length", {
      expectedLength,
      actualLength: bytes.length,
    });
  }
  return bytes;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function reverseBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes).reverse();
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function readUint32LE(bytes: Uint8Array, offset: number): number {
  invariant(
    offset >= 0 && offset + 4 <= bytes.length,
    "INVALID_TRANSACTION",
    "uint32 is truncated",
  );
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

export function uint32LE(value: number): Uint8Array {
  invariant(
    Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff,
    "INTEGER_RANGE",
    "uint32 is out of range",
    { value },
  );
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

export function uint64LE(value: bigint): Uint8Array {
  invariant(
    value >= 0n && value <= 0xffff_ffff_ffff_ffffn,
    "INTEGER_RANGE",
    "uint64 is out of range",
    { value: value.toString() },
  );
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

export function readUint64LE(bytes: Uint8Array, offset: number): bigint {
  invariant(
    offset >= 0 && offset + 8 <= bytes.length,
    "INVALID_TRANSACTION",
    "uint64 is truncated",
  );
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);
}

export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left - right;
  }
  return a.length - b.length;
}
