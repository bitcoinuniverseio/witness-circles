import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { schnorr } from "@noble/curves/secp256k1.js";
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
  validateCircle,
  WitnessStateEngine,
} from "../src/index.js";

function key(index: number): Uint8Array {
  const value = new Uint8Array(32);
  value[31] = index + 1;
  return value;
}

function sign(
  transaction: BitcoinTransaction,
  prevouts: readonly CirclePrevout[],
  keys: readonly Uint8Array[],
): BitcoinTransaction {
  return {
    ...transaction,
    inputs: transaction.inputs.map((input, index) => {
      const privateKey = keys[index];
      if (!privateKey) throw new Error("Missing lifecycle fixture key");
      return {
        ...input,
        witness: [
          schnorr.sign(
            taprootKeyPathSighash(transaction, index, prevouts),
            privateKey,
            new Uint8Array(32),
          ),
        ],
      };
    }),
  };
}

const golden = JSON.parse(
  readFileSync(resolve("test-vectors/v1/golden-circle.json"), "utf8"),
) as GoldenCircleVector;
const genesisPrevouts: CirclePrevout[] = golden.prevouts.map((prevout) => ({
  txid: prevout.txid,
  vout: prevout.vout,
  value: BigInt(prevout.valueSats),
  scriptPubKey: hexToBytes(prevout.scriptPubKey),
  blockHeight: prevout.blockHeight,
}));
const genesis = validateCircle(decodeTransaction(golden.rawTransaction), {
  network: golden.network,
  currentBlockHeight: golden.currentBlockHeight,
  prevouts: genesisPrevouts,
});
const state = new WitnessStateEngine();
const genesisResult = state.apply({
  txid: genesis.txid,
  spentOutpoints: genesis.members.map((member) => member.input),
  blockHeight: golden.stateTransition.blockHeight,
  blockHash: golden.stateTransition.blockHash,
  transactionIndex: golden.stateTransition.transactionIndex,
  circle: genesis,
});

const continuationManifest: CircleContextManifest = {
  protocol: "witc",
  version: 1,
  kind: "circle",
  nonce: "11111111111111111111111111111111",
  title: "Golden lineage continuation",
  created: "2026-08-01T20:00:00Z",
  expires: "2026-08-01T21:00:00Z",
};
const continuationPlan = buildCirclePlan({
  network: "signet",
  manifest: continuationManifest,
  participants: genesis.members.slice(0, 2).map((member) => ({
    txid: member.successor.txid,
    vout: member.successor.vout,
    value: member.successorValue,
    scriptPubKey: member.scriptPubKey,
    blockHeight: 200,
    maximumFeeShare: 2_000n,
  })),
  feeRateSatsPerVbyte: 5n,
});
const continuationPrevouts: CirclePrevout[] = continuationPlan.participants.map((participant) => ({
  txid: participant.txid,
  vout: participant.vout,
  value: participant.value,
  scriptPubKey: participant.scriptPubKey,
  blockHeight: participant.blockHeight,
}));
const continuationTransaction = decodeTransaction(
  encodeTransaction(
    sign(continuationPlan.unsignedTransaction, continuationPrevouts, [key(0), key(1)]),
    true,
  ),
);
const continuation = validateCircle(continuationTransaction, {
  network: "signet",
  currentBlockHeight: 201,
  prevouts: continuationPrevouts,
});
const closingMember = continuation.members[0];
if (closingMember === undefined) throw new Error("Lifecycle fixture has no member to close");
const continuationResult = state.apply({
  txid: continuation.txid,
  spentOutpoints: continuation.members.map((member) => member.input),
  blockHeight: 201,
  blockHash: "bb".repeat(32),
  transactionIndex: 1,
  circle: continuation,
});
const closingTxid = "dd".repeat(32);
const closureResult = state.apply({
  txid: closingTxid,
  spentOutpoints: [closingMember.successor],
  blockHeight: 202,
  blockHash: "cc".repeat(32),
  transactionIndex: 2,
  circle: null,
});
const rollbackHashes = [
  state.rollbackLast(closingTxid),
  state.rollbackLast(continuation.txid),
  state.rollbackLast(genesis.txid),
];

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      name: "fresh-continuation-closure-rollback",
      genesis: {
        source: "golden-circle.json",
        expectedStateHash: genesisResult.stateHash,
      },
      continuation: {
        manifest: continuationManifest,
        rawTransaction: Buffer.from(encodeTransaction(continuationTransaction, true)).toString(
          "hex",
        ),
        txid: continuation.txid,
        wtxid: continuation.wtxid,
        feeSats: continuation.fee.toString(),
        virtualBytes: continuation.metrics.virtualBytes,
        currentBlockHeight: 201,
        prevouts: continuationPrevouts.map((prevout) => ({
          txid: prevout.txid,
          vout: prevout.vout,
          valueSats: prevout.value.toString(),
          scriptPubKey: Buffer.from(prevout.scriptPubKey).toString("hex"),
          blockHeight: prevout.blockHeight,
        })),
        blockHeight: 201,
        blockHash: "bb".repeat(32),
        transactionIndex: 1,
        expectedStateHash: continuationResult.stateHash,
      },
      closure: {
        txid: closingTxid,
        spentOutpoints: [closingMember.successor],
        blockHeight: 202,
        blockHash: "cc".repeat(32),
        transactionIndex: 2,
        expectedStateHash: closureResult.stateHash,
      },
      rollbackExpectedStateHashes: rollbackHashes,
    },
    null,
    2,
  )}\n`,
);
