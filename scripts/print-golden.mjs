import { schnorr } from "@noble/curves/secp256k1.js";
import {
  buildCirclePlan,
  bytesToHex,
  canonicalizeContextManifest,
  contextHash,
  deriveLineageId,
  encodeTransaction,
  taprootKeyPathSighash,
  transactionId,
  transactionMetrics,
  witnessTransactionId,
} from "../dist/index.js";

const manifest = {
  created: "2026-08-01T18:00:00Z",
  expires: "2026-08-01T19:00:00Z",
  kind: "circle",
  nonce: "90e8f5cf27f04c89a6657bc9c60e3021",
  orbit: "signet-builders",
  protocol: "witc",
  title: "Reference genesis circle",
  version: 1,
};

const privateKeys = [1, 2, 3].map((lastByte) => {
  const key = new Uint8Array(32);
  key[31] = lastByte;
  return key;
});

const participants = privateKeys.map((privateKey, index) => ({
  txid: String(index + 1).repeat(64),
  vout: index,
  value: BigInt(30_000 + index * 10_000),
  scriptPubKey: new Uint8Array([0x51, 0x20, ...schnorr.getPublicKey(privateKey)]),
  blockHeight: 199,
  maximumFeeShare: 2_000n,
}));

const plan = buildCirclePlan({
  network: "signet",
  manifest,
  participants,
  feeRateSatsPerVbyte: 10n,
});

const signaturePrevouts = plan.participants.map((participant) => ({
  value: participant.value,
  scriptPubKey: participant.scriptPubKey,
}));

const signed = {
  ...plan.unsignedTransaction,
  inputs: plan.unsignedTransaction.inputs.map((input, index) => {
    const privateKey = privateKeys[index];
    if (privateKey === undefined) throw new Error("Missing fixture private key");
    const message = taprootKeyPathSighash(plan.unsignedTransaction, index, signaturePrevouts);
    const signature = schnorr.sign(message, privateKey, new Uint8Array(32));
    return { ...input, witness: [signature] };
  }),
};

const rawTransaction = bytesToHex(encodeTransaction(signed, true));
const fixture = {
  schemaVersion: 1,
  name: "three-participant-signet-circle",
  network: "signet",
  currentBlockHeight: 200,
  manifest,
  canonicalManifest: canonicalizeContextManifest(manifest),
  contextHash: contextHash(manifest),
  markerScript: bytesToHex(plan.unsignedTransaction.outputs[0].scriptPubKey),
  rawTransaction,
  txid: transactionId(signed),
  wtxid: witnessTransactionId(signed),
  feeSats: plan.totalFee.toString(),
  virtualBytes: transactionMetrics(signed).virtualBytes,
  prevouts: plan.participants.map((participant) => ({
    txid: participant.txid,
    vout: participant.vout,
    valueSats: participant.value.toString(),
    scriptPubKey: bytesToHex(participant.scriptPubKey),
    blockHeight: participant.blockHeight,
  })),
  expectedLineageIds: plan.participants.map((participant) => deriveLineageId(participant)),
};

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
