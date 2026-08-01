import { hexToBytes } from "./bytes.js";
import type { WitnessNetwork } from "./constants.js";
import { invariant } from "./errors.js";
import { canonicalizeContextManifest, contextHash } from "./manifest.js";
import { decodeMarkerScript } from "./marker.js";
import { deriveLineageId, WitnessStateEngine } from "./state.js";
import type { OutPoint } from "./transaction.js";
import { decodeTransaction } from "./transaction.js";
import { type CirclePrevout, validateCircle } from "./validator.js";

export interface GoldenCircleVector {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly network: WitnessNetwork;
  readonly currentBlockHeight: number;
  readonly manifest: unknown;
  readonly canonicalManifest: string;
  readonly contextHash: string;
  readonly markerScript: string;
  readonly rawTransaction: string;
  readonly txid: string;
  readonly wtxid: string;
  readonly feeSats: string;
  readonly virtualBytes: number;
  readonly prevouts: readonly {
    readonly txid: string;
    readonly vout: number;
    readonly valueSats: string;
    readonly scriptPubKey: string;
    readonly blockHeight: number;
  }[];
  readonly expectedLineageIds: readonly string[];
  readonly stateTransition: {
    readonly blockHeight: number;
    readonly blockHash: string;
    readonly transactionIndex: number;
    readonly expectedStateHash: string;
  };
}

export interface StateLifecycleVector {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly genesis: {
    readonly source: "golden-circle.json";
    readonly expectedStateHash: string;
  };
  readonly continuation: {
    readonly manifest: unknown;
    readonly rawTransaction: string;
    readonly txid: string;
    readonly wtxid: string;
    readonly feeSats: string;
    readonly virtualBytes: number;
    readonly currentBlockHeight: number;
    readonly prevouts: readonly {
      readonly txid: string;
      readonly vout: number;
      readonly valueSats: string;
      readonly scriptPubKey: string;
      readonly blockHeight: number;
    }[];
    readonly blockHeight: number;
    readonly blockHash: string;
    readonly transactionIndex: number;
    readonly expectedStateHash: string;
  };
  readonly closure: {
    readonly txid: string;
    readonly spentOutpoints: readonly OutPoint[];
    readonly blockHeight: number;
    readonly blockHash: string;
    readonly transactionIndex: number;
    readonly expectedStateHash: string;
  };
  readonly rollbackExpectedStateHashes: readonly string[];
}

export function verifyGoldenCircleVector(value: GoldenCircleVector): {
  readonly valid: true;
  readonly name: string;
  readonly txid: string;
  readonly participantCount: number;
  readonly stateHash: string;
} {
  invariant(value.schemaVersion === 1, "INVALID_VERSION", "Golden vector schema version must be 1");
  invariant(
    canonicalizeContextManifest(value.manifest) === value.canonicalManifest,
    "INVALID_CONTEXT_MANIFEST",
    "Golden canonical manifest differs",
  );
  invariant(
    contextHash(value.manifest) === value.contextHash,
    "INVALID_CONTEXT_MANIFEST",
    "Golden context hash differs",
  );
  const marker = decodeMarkerScript(hexToBytes(value.markerScript));
  invariant(
    marker.network === value.network &&
      marker.participantCount === value.prevouts.length &&
      marker.contextHash === value.contextHash,
    "INVALID_MARKER",
    "Golden marker script differs",
  );
  const prevouts: CirclePrevout[] = value.prevouts.map((prevout) => ({
    txid: prevout.txid,
    vout: prevout.vout,
    value: BigInt(prevout.valueSats),
    scriptPubKey: hexToBytes(prevout.scriptPubKey),
    blockHeight: prevout.blockHeight,
  }));
  const validated = validateCircle(decodeTransaction(value.rawTransaction), {
    network: value.network,
    currentBlockHeight: value.currentBlockHeight,
    prevouts,
    signatureMode: "verify",
  });
  invariant(validated.txid === value.txid, "INVALID_TRANSACTION", "Golden txid differs");
  invariant(validated.wtxid === value.wtxid, "INVALID_TRANSACTION", "Golden wtxid differs");
  invariant(validated.fee.toString() === value.feeSats, "OUTPUT_MAPPING", "Golden fee differs");
  invariant(
    validated.metrics.virtualBytes === value.virtualBytes,
    "INVALID_TRANSACTION",
    "Golden vsize differs",
  );
  const lineages = validated.members.map((member) => deriveLineageId(member.input));
  invariant(
    JSON.stringify(lineages) === JSON.stringify(value.expectedLineageIds),
    "INVALID_STATE",
    "Golden lineage IDs differ",
  );
  const state = new WitnessStateEngine();
  const transition = state.apply({
    txid: validated.txid,
    spentOutpoints: validated.members.map((member) => member.input),
    blockHeight: value.stateTransition.blockHeight,
    blockHash: value.stateTransition.blockHash,
    transactionIndex: value.stateTransition.transactionIndex,
    circle: validated,
  });
  invariant(
    transition.stateHash === value.stateTransition.expectedStateHash,
    "INVALID_STATE",
    "Golden state hash differs",
  );
  return {
    valid: true,
    name: value.name,
    txid: validated.txid,
    participantCount: validated.members.length,
    stateHash: transition.stateHash,
  };
}

export function verifyStateLifecycleVector(
  value: StateLifecycleVector,
  genesisVector: GoldenCircleVector,
): {
  readonly valid: true;
  readonly name: string;
  readonly continuationTxid: string;
  readonly stateHashes: readonly string[];
  readonly rollbackStateHashes: readonly string[];
} {
  invariant(value.schemaVersion === 1, "INVALID_VERSION", "Lifecycle schema version must be 1");
  invariant(
    value.genesis.source === "golden-circle.json",
    "INVALID_STATE",
    "Lifecycle genesis source is not canonical",
  );

  const genesisVerification = verifyGoldenCircleVector(genesisVector);
  invariant(
    genesisVerification.stateHash === value.genesis.expectedStateHash,
    "INVALID_STATE",
    "Lifecycle genesis state hash differs",
  );
  const genesisPrevouts: CirclePrevout[] = genesisVector.prevouts.map((prevout) => ({
    txid: prevout.txid,
    vout: prevout.vout,
    value: BigInt(prevout.valueSats),
    scriptPubKey: hexToBytes(prevout.scriptPubKey),
    blockHeight: prevout.blockHeight,
  }));
  const genesis = validateCircle(decodeTransaction(genesisVector.rawTransaction), {
    network: genesisVector.network,
    currentBlockHeight: genesisVector.currentBlockHeight,
    prevouts: genesisPrevouts,
    signatureMode: "verify",
  });
  const state = new WitnessStateEngine();
  const genesisResult = state.apply({
    txid: genesis.txid,
    spentOutpoints: genesis.members.map((member) => member.input),
    blockHeight: genesisVector.stateTransition.blockHeight,
    blockHash: genesisVector.stateTransition.blockHash,
    transactionIndex: genesisVector.stateTransition.transactionIndex,
    circle: genesis,
  });
  invariant(
    genesisResult.stateHash === value.genesis.expectedStateHash,
    "INVALID_STATE",
    "Lifecycle genesis transition differs",
  );

  const continuationPrevouts: CirclePrevout[] = value.continuation.prevouts.map((prevout) => ({
    txid: prevout.txid,
    vout: prevout.vout,
    value: BigInt(prevout.valueSats),
    scriptPubKey: hexToBytes(prevout.scriptPubKey),
    blockHeight: prevout.blockHeight,
  }));
  const continuation = validateCircle(decodeTransaction(value.continuation.rawTransaction), {
    network: genesisVector.network,
    currentBlockHeight: value.continuation.currentBlockHeight,
    prevouts: continuationPrevouts,
    signatureMode: "verify",
  });
  invariant(
    continuation.marker.contextHash === contextHash(value.continuation.manifest),
    "INVALID_CONTEXT_MANIFEST",
    "Lifecycle continuation context hash differs",
  );
  invariant(
    continuation.txid === value.continuation.txid,
    "INVALID_TRANSACTION",
    "Lifecycle continuation txid differs",
  );
  invariant(
    continuation.wtxid === value.continuation.wtxid,
    "INVALID_TRANSACTION",
    "Lifecycle continuation wtxid differs",
  );
  invariant(
    continuation.fee.toString() === value.continuation.feeSats,
    "OUTPUT_MAPPING",
    "Lifecycle continuation fee differs",
  );
  invariant(
    continuation.metrics.virtualBytes === value.continuation.virtualBytes,
    "INVALID_TRANSACTION",
    "Lifecycle continuation vsize differs",
  );
  const continuationResult = state.apply({
    txid: continuation.txid,
    spentOutpoints: continuation.members.map((member) => member.input),
    blockHeight: value.continuation.blockHeight,
    blockHash: value.continuation.blockHash,
    transactionIndex: value.continuation.transactionIndex,
    circle: continuation,
  });
  invariant(
    continuationResult.stateHash === value.continuation.expectedStateHash,
    "INVALID_STATE",
    "Lifecycle continuation state hash differs",
  );

  const closureResult = state.apply({
    txid: value.closure.txid,
    spentOutpoints: value.closure.spentOutpoints,
    blockHeight: value.closure.blockHeight,
    blockHash: value.closure.blockHash,
    transactionIndex: value.closure.transactionIndex,
    circle: null,
  });
  invariant(
    closureResult.stateHash === value.closure.expectedStateHash,
    "INVALID_STATE",
    "Lifecycle closure state hash differs",
  );

  const rollbackStateHashes = [
    state.rollbackLast(value.closure.txid),
    state.rollbackLast(value.continuation.txid),
    state.rollbackLast(genesisVector.txid),
  ];
  invariant(
    JSON.stringify(rollbackStateHashes) === JSON.stringify(value.rollbackExpectedStateHashes),
    "INVALID_STATE",
    "Lifecycle rollback state hashes differ",
  );
  return {
    valid: true,
    name: value.name,
    continuationTxid: continuation.txid,
    stateHashes: [genesisResult.stateHash, continuationResult.stateHash, closureResult.stateHash],
    rollbackStateHashes,
  };
}
