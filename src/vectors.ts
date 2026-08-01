import { bytesToHex, hexToBytes } from "./bytes.js";
import type { WitnessNetwork } from "./constants.js";
import { invariant } from "./errors.js";
import { canonicalizeContextManifest, contextHash } from "./manifest.js";
import { encodeMarkerScript } from "./marker.js";
import { deriveLineageId } from "./state.js";
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
}

export function verifyGoldenCircleVector(value: GoldenCircleVector): {
  readonly valid: true;
  readonly name: string;
  readonly txid: string;
  readonly participantCount: number;
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
  invariant(
    bytesToHex(
      encodeMarkerScript({
        network: value.network,
        participantCount: value.prevouts.length,
        contextHash: value.contextHash,
      }),
    ) === value.markerScript,
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
  return {
    valid: true,
    name: value.name,
    txid: validated.txid,
    participantCount: validated.members.length,
  };
}
