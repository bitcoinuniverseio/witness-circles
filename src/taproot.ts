import { schnorr } from "@noble/curves/secp256k1";
import { concatBytes, uint32LE, uint64LE } from "./bytes.js";
import { SIGHASH_ALL, SIGHASH_DEFAULT } from "./constants.js";
import { invariant } from "./errors.js";
import { sha256, taggedHash } from "./hash.js";
import {
  type BitcoinTransaction,
  encodeCompactSize,
  p2trOutputKey,
  serializeOutpoint,
  serializeOutput,
} from "./transaction.js";

export interface SignaturePrevout {
  readonly value: bigint;
  readonly scriptPubKey: Uint8Array;
}

function hashConcat(parts: readonly Uint8Array[]): Uint8Array {
  return sha256(concatBytes(...parts));
}

export function taprootKeyPathSighash(
  transaction: BitcoinTransaction,
  inputIndex: number,
  prevouts: readonly SignaturePrevout[],
  hashType: typeof SIGHASH_DEFAULT | typeof SIGHASH_ALL = SIGHASH_DEFAULT,
): Uint8Array {
  invariant(
    inputIndex >= 0 && inputIndex < transaction.inputs.length,
    "INVALID_SIGNATURE",
    "Signature input index is out of range",
  );
  invariant(
    prevouts.length === transaction.inputs.length,
    "INPUT_PREVOUT_MISSING",
    "Every input needs a prevout for Taproot signature hashing",
  );
  invariant(
    hashType === SIGHASH_DEFAULT || hashType === SIGHASH_ALL,
    "SIGHASH_UNSAFE",
    "Only SIGHASH_DEFAULT and SIGHASH_ALL are supported",
  );

  const shaPrevouts = hashConcat(transaction.inputs.map(serializeOutpoint));
  const shaAmounts = hashConcat(prevouts.map((prevout) => uint64LE(prevout.value)));
  const shaScriptPubKeys = hashConcat(
    prevouts.map((prevout) =>
      concatBytes(encodeCompactSize(prevout.scriptPubKey.length), prevout.scriptPubKey),
    ),
  );
  const shaSequences = hashConcat(transaction.inputs.map((input) => uint32LE(input.sequence)));
  const shaOutputs = hashConcat(transaction.outputs.map(serializeOutput));
  const message = concatBytes(
    Uint8Array.of(hashType),
    uint32LE(transaction.version),
    uint32LE(transaction.lockTime),
    shaPrevouts,
    shaAmounts,
    shaScriptPubKeys,
    shaSequences,
    shaOutputs,
    Uint8Array.of(0x00),
    uint32LE(inputIndex),
  );
  return taggedHash("TapSighash", concatBytes(Uint8Array.of(0x00), message));
}

export function decodeCircleSignature(witness: readonly Uint8Array[]): {
  readonly signature: Uint8Array;
  readonly hashType: typeof SIGHASH_DEFAULT | typeof SIGHASH_ALL;
} {
  invariant(
    witness.length === 1,
    "WITNESS_SHAPE",
    "Circle inputs require exactly one key-path witness item",
  );
  const item = witness[0];
  invariant(
    item !== undefined && (item.length === 64 || item.length === 65),
    "WITNESS_SHAPE",
    "Circle signature must be 64 or 65 bytes",
  );
  if (item.length === 64) return { signature: item, hashType: SIGHASH_DEFAULT };
  invariant(
    item[64] === SIGHASH_ALL,
    "SIGHASH_UNSAFE",
    "Only explicit SIGHASH_ALL is permitted on 65-byte signatures",
    { hashType: item[64] },
  );
  return { signature: item.slice(0, 64), hashType: SIGHASH_ALL };
}

export function verifyTaprootKeyPathSignature(
  transaction: BitcoinTransaction,
  inputIndex: number,
  prevouts: readonly SignaturePrevout[],
): boolean {
  const input = transaction.inputs[inputIndex];
  const prevout = prevouts[inputIndex];
  invariant(
    input !== undefined && prevout !== undefined,
    "INPUT_PREVOUT_MISSING",
    "Input or prevout is missing",
  );
  const { signature, hashType } = decodeCircleSignature(input.witness);
  const message = taprootKeyPathSighash(transaction, inputIndex, prevouts, hashType);
  try {
    return schnorr.verify(signature, message, p2trOutputKey(prevout.scriptPubKey));
  } catch {
    return false;
  }
}
