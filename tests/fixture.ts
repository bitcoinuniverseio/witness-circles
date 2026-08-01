import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { schnorr } from "@noble/curves/secp256k1";
import {
  type BitcoinTransaction,
  buildCirclePlan,
  type CircleContextManifest,
  type CirclePrevout,
  decodeTransaction,
  encodeTransaction,
  type GoldenCircleVector,
  hexToBytes,
  taprootKeyPathSighash,
  type ValidatedCircle,
  validateCircle,
} from "../src/index.js";

export function loadGolden(): GoldenCircleVector {
  return JSON.parse(
    readFileSync(resolve("test-vectors/v1/golden-circle.json"), "utf8"),
  ) as GoldenCircleVector;
}

export function goldenContext(vector = loadGolden()): {
  readonly transaction: BitcoinTransaction;
  readonly prevouts: readonly CirclePrevout[];
  readonly validated: ValidatedCircle;
} {
  const transaction = decodeTransaction(vector.rawTransaction);
  const prevouts: CirclePrevout[] = vector.prevouts.map((prevout) => ({
    txid: prevout.txid,
    vout: prevout.vout,
    value: BigInt(prevout.valueSats),
    scriptPubKey: hexToBytes(prevout.scriptPubKey),
    blockHeight: prevout.blockHeight,
  }));
  return {
    transaction,
    prevouts,
    validated: validateCircle(transaction, {
      network: vector.network,
      currentBlockHeight: vector.currentBlockHeight,
      prevouts,
    }),
  };
}

export function privateKey(index: number): Uint8Array {
  const key = new Uint8Array(32);
  key[31] = index + 1;
  return key;
}

export function signTransaction(
  unsigned: BitcoinTransaction,
  prevouts: readonly CirclePrevout[],
  keys: readonly Uint8Array[],
): BitcoinTransaction {
  return {
    ...unsigned,
    inputs: unsigned.inputs.map((input, index) => {
      const key = keys[index];
      if (key === undefined) throw new Error("Fixture key missing");
      const message = taprootKeyPathSighash(unsigned, index, prevouts);
      return { ...input, witness: [schnorr.sign(message, key, new Uint8Array(32))] };
    }),
  };
}

export function createTwoParticipantCircle(
  height: number,
  nonce: string,
): {
  readonly transaction: BitcoinTransaction;
  readonly prevouts: readonly CirclePrevout[];
  readonly validated: ValidatedCircle;
  readonly manifest: CircleContextManifest;
} {
  const keys = [privateKey(0), privateKey(1)];
  const manifest: CircleContextManifest = {
    protocol: "witc",
    version: 1,
    kind: "circle",
    nonce,
    title: "Test circle",
    created: "2026-08-01T18:00:00Z",
    expires: "2026-08-01T19:00:00Z",
  };
  const participants = keys.map((key, index) => ({
    txid: `${index + 7}`.repeat(64),
    vout: index,
    value: 20_000n + BigInt(index) * 10_000n,
    scriptPubKey: new Uint8Array([0x51, 0x20, ...schnorr.getPublicKey(key)]),
    blockHeight: height - 1,
    maximumFeeShare: 10_000n,
  }));
  const plan = buildCirclePlan({
    network: "signet",
    manifest,
    participants,
    feeRateSatsPerVbyte: 5n,
  });
  const prevouts: CirclePrevout[] = plan.participants.map((participant) => ({
    txid: participant.txid,
    vout: participant.vout,
    value: participant.value,
    scriptPubKey: participant.scriptPubKey,
    blockHeight: participant.blockHeight,
  }));
  const transaction = signTransaction(plan.unsignedTransaction, prevouts, keys);
  const decoded = decodeTransaction(encodeTransaction(transaction, true));
  return {
    transaction: decoded,
    prevouts,
    validated: validateCircle(decoded, { network: "signet", currentBlockHeight: height, prevouts }),
    manifest,
  };
}
