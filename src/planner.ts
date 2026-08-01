import { bytesToHex, hexToBytes } from "./bytes.js";
import {
  MIN_SUCCESSOR_VALUE_SATS,
  REQUIRED_LOCK_TIME,
  REQUIRED_SEQUENCE,
  REQUIRED_TRANSACTION_VERSION,
  type WitnessNetwork,
} from "./constants.js";
import { invariant } from "./errors.js";
import { sha256 } from "./hash.js";
import {
  type CircleContextManifest,
  canonicalizeContextManifest,
  contextHash,
  validateContextManifest,
} from "./manifest.js";
import { encodeMarkerScript } from "./marker.js";
import {
  type BitcoinTransaction,
  compareOutpoints,
  encodeTransaction,
  isNativeP2tr,
  normalizeTxid,
  type OutPoint,
  transactionId,
} from "./transaction.js";
import { allocateEqualFeeShares } from "./validator.js";

export interface CircleParticipantPlanInput extends OutPoint {
  readonly value: bigint;
  readonly scriptPubKey: Uint8Array;
  readonly blockHeight: number;
  readonly maximumFeeShare: bigint;
}

export interface CirclePlanRequest {
  readonly network: WitnessNetwork;
  readonly manifest: CircleContextManifest;
  readonly participants: readonly CircleParticipantPlanInput[];
  readonly feeRateSatsPerVbyte: bigint;
}

export interface CirclePlannedParticipant extends CircleParticipantPlanInput {
  readonly slot: number;
  readonly successorVout: number;
  readonly successorValue: bigint;
  readonly feeShare: bigint;
}

export interface CirclePlan {
  readonly protocol: "witc";
  readonly version: 1;
  readonly network: WitnessNetwork;
  readonly contextHash: string;
  readonly canonicalManifest: string;
  readonly unsignedTransaction: BitcoinTransaction;
  readonly unsignedTransactionHex: string;
  readonly unsignedTxid: string;
  readonly unsignedFingerprint: string;
  readonly expectedVirtualBytes: number;
  readonly feeRateSatsPerVbyte: bigint;
  readonly totalFee: bigint;
  readonly participants: readonly CirclePlannedParticipant[];
}

export interface PsbtWitnessUtxoPlan {
  readonly amount: bigint;
  readonly scriptPubKey: Uint8Array;
}

export interface PsbtInputPlan {
  readonly outpoint: OutPoint;
  readonly witnessUtxo: PsbtWitnessUtxoPlan;
  readonly sighashType: 0;
  readonly includeTapInternalKeyForOwnerOnly: true;
  readonly includeTapBip32DerivationForOwnerOnly: true;
}

export interface CirclePsbtPlan {
  readonly psbtVersion: 0;
  readonly unsignedTransactionHex: string;
  readonly globalXpubs: readonly [];
  readonly proprietaryFields: readonly [];
  readonly inputs: readonly PsbtInputPlan[];
  readonly outputDerivationsVisibleToOwnerOnly: true;
  readonly contributionField: "PSBT_IN_TAP_KEY_SIG";
  readonly autoFinalize: false;
}

export function estimateCircleVsize(participantCount: number, explicitSighashAllCount = 0): number {
  invariant(
    Number.isInteger(participantCount) && participantCount >= 2 && participantCount <= 16,
    "INPUT_COUNT",
    "Participant count must be between 2 and 16",
  );
  invariant(
    Number.isInteger(explicitSighashAllCount) &&
      explicitSighashAllCount >= 0 &&
      explicitSighashAllCount <= participantCount,
    "INTEGER_RANGE",
    "Explicit sighash count is out of range",
  );
  const weight = 246 + 402 * participantCount + explicitSighashAllCount;
  return Math.ceil(weight / 4);
}

export function buildCirclePlan(request: CirclePlanRequest): CirclePlan {
  const manifest = validateContextManifest(request.manifest);
  invariant(
    request.participants.length >= 2 && request.participants.length <= 16,
    "INPUT_COUNT",
    "Circle requires 2 to 16 participants",
  );
  invariant(
    request.feeRateSatsPerVbyte > 0n && request.feeRateSatsPerVbyte <= 1_000_000n,
    "INTEGER_RANGE",
    "Fee rate must be between 1 and 1,000,000 sats/vB",
  );
  const participants = [...request.participants].map((participant) => ({
    ...participant,
    txid: normalizeTxid(participant.txid),
  }));
  participants.sort(compareOutpoints);
  const seenOutpoints = new Set<string>();
  const seenScripts = new Set<string>();
  for (const participant of participants) {
    const outpoint = `${participant.txid}:${participant.vout}`;
    invariant(
      !seenOutpoints.has(outpoint),
      "DUPLICATE_INPUT",
      "Planner received a duplicate input",
      { outpoint },
    );
    seenOutpoints.add(outpoint);
    invariant(
      isNativeP2tr(participant.scriptPubKey),
      "INVALID_P2TR",
      "Every participant input must be native P2TR",
    );
    const script = bytesToHex(participant.scriptPubKey);
    invariant(
      !seenScripts.has(script),
      "DUPLICATE_SCRIPT",
      "Each participant must use a distinct P2TR output key",
    );
    seenScripts.add(script);
    invariant(
      participant.blockHeight >= 0,
      "PREVOUT_HEIGHT",
      "Participant input must be confirmed",
    );
    invariant(
      participant.maximumFeeShare >= 0n,
      "FEE_CAP_EXCEEDED",
      "Maximum fee share cannot be negative",
    );
  }
  const canonicalManifest = canonicalizeContextManifest(manifest);
  const manifestHash = contextHash(manifest);
  const expectedVirtualBytes = estimateCircleVsize(participants.length);
  const totalFee = BigInt(expectedVirtualBytes) * request.feeRateSatsPerVbyte;
  const feeShares = allocateEqualFeeShares(totalFee, participants.length);
  const plannedParticipants: CirclePlannedParticipant[] = participants.map((participant, slot) => {
    const feeShare = feeShares[slot];
    invariant(feeShare !== undefined, "INVALID_STATE", "Fee share is missing");
    invariant(
      feeShare <= participant.maximumFeeShare,
      "FEE_CAP_EXCEEDED",
      "Participant fee cap would be exceeded",
      {
        slot,
        feeShare: feeShare.toString(),
        maximumFeeShare: participant.maximumFeeShare.toString(),
      },
    );
    const successorValue = participant.value - feeShare;
    invariant(
      successorValue >= MIN_SUCCESSOR_VALUE_SATS,
      "SUCCESSOR_DUST",
      "Participant input is too small after its fee share",
      {
        slot,
        successorValue: successorValue.toString(),
      },
    );
    return { ...participant, slot, successorVout: slot + 1, successorValue, feeShare };
  });
  const unsignedTransaction: BitcoinTransaction = {
    version: REQUIRED_TRANSACTION_VERSION,
    inputs: plannedParticipants.map((participant) => ({
      txid: participant.txid,
      vout: participant.vout,
      scriptSig: new Uint8Array(),
      sequence: REQUIRED_SEQUENCE,
      witness: [],
    })),
    outputs: [
      {
        value: 0n,
        scriptPubKey: encodeMarkerScript({
          network: request.network,
          participantCount: plannedParticipants.length,
          contextHash: manifestHash,
        }),
      },
      ...plannedParticipants.map((participant) => ({
        value: participant.successorValue,
        scriptPubKey: participant.scriptPubKey,
      })),
    ],
    lockTime: REQUIRED_LOCK_TIME,
  };
  const unsignedBytes = encodeTransaction(unsignedTransaction, false);
  return {
    protocol: "witc",
    version: 1,
    network: request.network,
    contextHash: manifestHash,
    canonicalManifest,
    unsignedTransaction,
    unsignedTransactionHex: bytesToHex(unsignedBytes),
    unsignedTxid: transactionId(unsignedTransaction),
    unsignedFingerprint: bytesToHex(sha256(unsignedBytes)),
    expectedVirtualBytes,
    feeRateSatsPerVbyte: request.feeRateSatsPerVbyte,
    totalFee,
    participants: plannedParticipants,
  };
}

export function toCirclePsbtPlan(plan: CirclePlan): CirclePsbtPlan {
  return {
    psbtVersion: 0,
    unsignedTransactionHex: plan.unsignedTransactionHex,
    globalXpubs: [],
    proprietaryFields: [],
    inputs: plan.participants.map((participant) => ({
      outpoint: { txid: participant.txid, vout: participant.vout },
      witnessUtxo: { amount: participant.value, scriptPubKey: participant.scriptPubKey },
      sighashType: 0,
      includeTapInternalKeyForOwnerOnly: true,
      includeTapBip32DerivationForOwnerOnly: true,
    })),
    outputDerivationsVisibleToOwnerOnly: true,
    contributionField: "PSBT_IN_TAP_KEY_SIG",
    autoFinalize: false,
  };
}

export function parseParticipantPlanJson(value: unknown): CircleParticipantPlanInput {
  invariant(
    typeof value === "object" && value !== null,
    "INVALID_TRANSACTION",
    "Participant plan must be an object",
  );
  const record = value as Record<string, unknown>;
  invariant(
    typeof record["txid"] === "string",
    "INVALID_OUTPOINT",
    "Participant txid must be a string",
  );
  invariant(
    typeof record["vout"] === "number",
    "INVALID_OUTPOINT",
    "Participant vout must be a number",
  );
  invariant(
    typeof record["valueSats"] === "string" && /^\d+$/.test(record["valueSats"]),
    "INTEGER_RANGE",
    "valueSats must be a decimal string",
  );
  invariant(typeof record["scriptPubKey"] === "string", "INVALID_P2TR", "scriptPubKey must be hex");
  invariant(
    typeof record["blockHeight"] === "number",
    "PREVOUT_HEIGHT",
    "blockHeight must be a number",
  );
  invariant(
    typeof record["maximumFeeShareSats"] === "string" &&
      /^\d+$/.test(record["maximumFeeShareSats"]),
    "FEE_CAP_EXCEEDED",
    "maximumFeeShareSats must be a decimal string",
  );
  return {
    txid: normalizeTxid(record["txid"]),
    vout: record["vout"],
    value: BigInt(record["valueSats"]),
    scriptPubKey: hexToBytes(record["scriptPubKey"]),
    blockHeight: record["blockHeight"],
    maximumFeeShare: BigInt(record["maximumFeeShareSats"]),
  };
}
