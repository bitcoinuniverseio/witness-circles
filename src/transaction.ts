import {
  bytesToHex,
  compareBytes,
  concatBytes,
  hexToBytes,
  readUint32LE,
  readUint64LE,
  reverseBytes,
  uint32LE,
  uint64LE,
} from "./bytes.js";
import { MAX_MONEY_SATS } from "./constants.js";
import { invariant } from "./errors.js";
import { doubleSha256 } from "./hash.js";

export interface OutPoint {
  readonly txid: string;
  readonly vout: number;
}

export interface TxInput extends OutPoint {
  readonly scriptSig: Uint8Array;
  readonly sequence: number;
  readonly witness: readonly Uint8Array[];
}

export interface TxOutput {
  readonly value: bigint;
  readonly scriptPubKey: Uint8Array;
}

export interface BitcoinTransaction {
  readonly version: number;
  readonly inputs: readonly TxInput[];
  readonly outputs: readonly TxOutput[];
  readonly lockTime: number;
}

export interface TransactionMetrics {
  readonly baseBytes: number;
  readonly totalBytes: number;
  readonly witnessBytes: number;
  readonly weight: number;
  readonly virtualBytes: number;
}

export function normalizeTxid(txid: string): string {
  return bytesToHex(hexToBytes(txid, 32));
}

export function outpointKey(outpoint: OutPoint): string {
  return `${normalizeTxid(outpoint.txid)}:${outpoint.vout}`;
}

export function parseOutpointKey(value: string): OutPoint {
  const match = /^([0-9a-fA-F]{64}):(\d{1,10})$/.exec(value);
  invariant(match !== null, "INVALID_OUTPOINT", "Outpoint must be txid:vout");
  const txid = normalizeTxid(match[1] ?? "");
  const vout = Number(match[2]);
  invariant(
    Number.isInteger(vout) && vout >= 0 && vout <= 0xffff_ffff,
    "INVALID_OUTPOINT",
    "Outpoint vout is out of range",
  );
  return { txid, vout };
}

export function compareOutpoints(left: OutPoint, right: OutPoint): number {
  const txidOrder = compareBytes(
    hexToBytes(normalizeTxid(left.txid)),
    hexToBytes(normalizeTxid(right.txid)),
  );
  return txidOrder !== 0 ? txidOrder : left.vout - right.vout;
}

export function serializeOutpoint(outpoint: OutPoint): Uint8Array {
  return concatBytes(
    reverseBytes(hexToBytes(normalizeTxid(outpoint.txid), 32)),
    uint32LE(outpoint.vout),
  );
}

export function encodeCompactSize(value: bigint | number): Uint8Array {
  const amount = typeof value === "number" ? BigInt(value) : value;
  invariant(
    amount >= 0n && amount <= 0xffff_ffff_ffff_ffffn,
    "INTEGER_RANGE",
    "CompactSize value is out of range",
  );
  if (amount < 0xfdn) return Uint8Array.of(Number(amount));
  if (amount <= 0xffffn) {
    return Uint8Array.of(0xfd, Number(amount & 0xffn), Number((amount >> 8n) & 0xffn));
  }
  if (amount <= 0xffff_ffffn) return concatBytes(Uint8Array.of(0xfe), uint32LE(Number(amount)));
  return concatBytes(Uint8Array.of(0xff), uint64LE(amount));
}

class ByteReader {
  readonly bytes: Uint8Array;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  read(length: number): Uint8Array {
    invariant(
      Number.isInteger(length) && length >= 0 && this.offset + length <= this.bytes.length,
      "INVALID_TRANSACTION",
      "Transaction data is truncated",
      {
        offset: this.offset,
        requested: length,
        available: this.bytes.length - this.offset,
      },
    );
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  byte(): number {
    return this.read(1)[0] ?? 0;
  }

  uint32(): number {
    const value = readUint32LE(this.bytes, this.offset);
    this.offset += 4;
    return value;
  }

  uint64(): bigint {
    const value = readUint64LE(this.bytes, this.offset);
    this.offset += 8;
    return value;
  }

  compactSize(): bigint {
    const prefix = this.byte();
    if (prefix < 0xfd) return BigInt(prefix);
    if (prefix === 0xfd) {
      const raw = this.read(2);
      const value = BigInt((raw[0] ?? 0) | ((raw[1] ?? 0) << 8));
      invariant(
        value >= 0xfdn,
        "AMBIGUOUS_ENCODING",
        "CompactSize uint16 is not minimally encoded",
      );
      return value;
    }
    if (prefix === 0xfe) {
      const value = BigInt(this.uint32());
      invariant(
        value > 0xffffn,
        "AMBIGUOUS_ENCODING",
        "CompactSize uint32 is not minimally encoded",
      );
      return value;
    }
    const value = this.uint64();
    invariant(
      value > 0xffff_ffffn,
      "AMBIGUOUS_ENCODING",
      "CompactSize uint64 is not minimally encoded",
    );
    return value;
  }

  count(label: string, maximum: number): number {
    const value = this.compactSize();
    invariant(
      value <= BigInt(maximum),
      "INVALID_TRANSACTION",
      `${label} exceeds the decoder limit`,
      { maximum, actual: value.toString() },
    );
    return Number(value);
  }
}

function serializeInput(input: TxInput): Uint8Array {
  return concatBytes(
    serializeOutpoint(input),
    encodeCompactSize(input.scriptSig.length),
    input.scriptSig,
    uint32LE(input.sequence),
  );
}

export function serializeOutput(output: TxOutput): Uint8Array {
  invariant(
    output.value >= 0n && output.value <= MAX_MONEY_SATS,
    "INTEGER_RANGE",
    "Transaction output value is out of range",
    { value: output.value.toString() },
  );
  return concatBytes(
    uint64LE(output.value),
    encodeCompactSize(output.scriptPubKey.length),
    output.scriptPubKey,
  );
}

function serializeWitness(items: readonly Uint8Array[]): Uint8Array {
  return concatBytes(
    encodeCompactSize(items.length),
    ...items.flatMap((item) => [encodeCompactSize(item.length), item]),
  );
}

export function hasWitness(transaction: BitcoinTransaction): boolean {
  return transaction.inputs.some((input) => input.witness.length > 0);
}

export function encodeTransaction(
  transaction: BitcoinTransaction,
  includeWitness = true,
): Uint8Array {
  invariant(
    transaction.inputs.length > 0,
    "INVALID_TRANSACTION",
    "Transaction must contain at least one input",
  );
  invariant(
    transaction.outputs.length > 0,
    "INVALID_TRANSACTION",
    "Transaction must contain at least one output",
  );
  const useWitness = includeWitness && hasWitness(transaction);
  return concatBytes(
    uint32LE(transaction.version),
    ...(useWitness ? [Uint8Array.of(0x00, 0x01)] : []),
    encodeCompactSize(transaction.inputs.length),
    ...transaction.inputs.map(serializeInput),
    encodeCompactSize(transaction.outputs.length),
    ...transaction.outputs.map(serializeOutput),
    ...(useWitness ? transaction.inputs.map((input) => serializeWitness(input.witness)) : []),
    uint32LE(transaction.lockTime),
  );
}

export function decodeTransaction(raw: Uint8Array | string): BitcoinTransaction {
  const bytes = typeof raw === "string" ? hexToBytes(raw) : raw;
  const reader = new ByteReader(bytes);
  const version = reader.uint32();
  let hasSegwitEncoding = false;
  let inputCount = reader.compactSize();
  if (inputCount === 0n) {
    const flag = reader.byte();
    invariant(
      flag === 1,
      "AMBIGUOUS_ENCODING",
      "Only canonical SegWit marker and flag 0001 are accepted",
    );
    hasSegwitEncoding = true;
    inputCount = reader.compactSize();
  }
  invariant(
    inputCount > 0n && inputCount <= 10_000n,
    "INVALID_TRANSACTION",
    "Input count is invalid",
  );
  const inputs: TxInput[] = [];
  for (let index = 0; index < Number(inputCount); index += 1) {
    const txid = bytesToHex(reverseBytes(reader.read(32)));
    const vout = reader.uint32();
    const scriptLength = reader.count("scriptSig length", 10_000);
    const scriptSig = reader.read(scriptLength);
    const sequence = reader.uint32();
    inputs.push({ txid, vout, scriptSig, sequence, witness: [] });
  }
  const outputCount = reader.count("output count", 10_000);
  invariant(outputCount > 0, "INVALID_TRANSACTION", "Transaction must contain at least one output");
  const outputs: TxOutput[] = [];
  for (let index = 0; index < outputCount; index += 1) {
    const value = reader.uint64();
    invariant(value <= MAX_MONEY_SATS, "INTEGER_RANGE", "Transaction output exceeds MAX_MONEY");
    const scriptLength = reader.count("scriptPubKey length", 10_000);
    outputs.push({ value, scriptPubKey: reader.read(scriptLength) });
  }
  if (hasSegwitEncoding) {
    for (let index = 0; index < inputs.length; index += 1) {
      const itemCount = reader.count("witness item count", 1_000);
      const witness: Uint8Array[] = [];
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        const itemLength = reader.count("witness item length", 1_000_000);
        witness.push(reader.read(itemLength));
      }
      const input = inputs[index];
      invariant(input !== undefined, "INVALID_TRANSACTION", "Witness input index is invalid");
      inputs[index] = { ...input, witness };
    }
    invariant(
      inputs.some((input) => input.witness.length > 0),
      "AMBIGUOUS_ENCODING",
      "Superfluous SegWit marker and flag are not accepted",
    );
  }
  const lockTime = reader.uint32();
  invariant(
    reader.offset === bytes.length,
    "TRAILING_DATA",
    "Raw transaction contains trailing data",
    { trailingBytes: bytes.length - reader.offset },
  );
  return { version, inputs, outputs, lockTime };
}

export function transactionId(transaction: BitcoinTransaction): string {
  return bytesToHex(reverseBytes(doubleSha256(encodeTransaction(transaction, false))));
}

export function witnessTransactionId(transaction: BitcoinTransaction): string {
  return bytesToHex(reverseBytes(doubleSha256(encodeTransaction(transaction, true))));
}

export function transactionMetrics(transaction: BitcoinTransaction): TransactionMetrics {
  const baseBytes = encodeTransaction(transaction, false).length;
  const totalBytes = encodeTransaction(transaction, true).length;
  const witnessBytes = totalBytes - baseBytes;
  const weight = baseBytes * 4 + witnessBytes;
  return { baseBytes, totalBytes, witnessBytes, weight, virtualBytes: Math.ceil(weight / 4) };
}

export function isNativeP2tr(scriptPubKey: Uint8Array): boolean {
  return scriptPubKey.length === 34 && scriptPubKey[0] === 0x51 && scriptPubKey[1] === 0x20;
}

export function p2trOutputKey(scriptPubKey: Uint8Array): Uint8Array {
  invariant(isNativeP2tr(scriptPubKey), "INVALID_P2TR", "scriptPubKey is not native P2TR");
  return scriptPubKey.slice(2);
}
