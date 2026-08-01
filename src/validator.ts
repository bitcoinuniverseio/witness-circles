import { bytesToHex } from "./bytes.js";
import {
  MAX_MONEY_SATS,
  MIN_SUCCESSOR_VALUE_SATS,
  REQUIRED_LOCK_TIME,
  REQUIRED_SEQUENCE,
  REQUIRED_TRANSACTION_VERSION,
  type WitnessNetwork,
} from "./constants.js";
import { errorResult, invariant } from "./errors.js";
import { type CircleMarker, decodeMarkerScript } from "./marker.js";
import { decodeCircleSignature, verifyTaprootKeyPathSignature } from "./taproot.js";
import {
  type BitcoinTransaction,
  compareOutpoints,
  isNativeP2tr,
  type OutPoint,
  outpointKey,
  transactionId,
  transactionMetrics,
  witnessTransactionId,
} from "./transaction.js";

export interface CirclePrevout extends OutPoint {
  readonly value: bigint;
  readonly scriptPubKey: Uint8Array;
  readonly blockHeight: number;
}

export interface CircleValidationContext {
  readonly network: WitnessNetwork;
  readonly currentBlockHeight: number;
  readonly prevouts: readonly CirclePrevout[];
  readonly signatureMode?: "verify" | "shape" | "unsigned";
  /** @deprecated Use signatureMode. */
  readonly verifySignatures?: boolean;
}

export interface ValidatedCircleMember {
  readonly slot: number;
  readonly input: OutPoint;
  readonly inputValue: bigint;
  readonly scriptPubKey: Uint8Array;
  readonly successor: OutPoint;
  readonly successorValue: bigint;
  readonly feeShare: bigint;
  readonly signatureHashType: 0 | 1 | null;
}

export interface ValidatedCircle {
  readonly valid: true;
  readonly txid: string;
  readonly wtxid: string;
  readonly marker: CircleMarker;
  readonly fee: bigint;
  readonly metrics: ReturnType<typeof transactionMetrics>;
  readonly members: readonly ValidatedCircleMember[];
  readonly transaction: BitcoinTransaction;
}

export type CircleValidationFailure = ReturnType<typeof errorResult>;
export type CircleValidationResult = ValidatedCircle | CircleValidationFailure;

export function allocateEqualFeeShares(
  totalFee: bigint,
  participantCount: number,
): readonly bigint[] {
  invariant(totalFee >= 0n, "FEE_NEGATIVE", "Transaction fee cannot be negative");
  invariant(
    participantCount >= 2 && participantCount <= 16,
    "INPUT_COUNT",
    "Participant count must be between 2 and 16",
  );
  const divisor = BigInt(participantCount);
  const quotient = totalFee / divisor;
  const remainder = Number(totalFee % divisor);
  return Array.from(
    { length: participantCount },
    (_, index) => quotient + (index < remainder ? 1n : 0n),
  );
}

function prevoutMap(prevouts: readonly CirclePrevout[]): Map<string, CirclePrevout> {
  const map = new Map<string, CirclePrevout>();
  for (const prevout of prevouts) {
    const key = outpointKey(prevout);
    invariant(!map.has(key), "DUPLICATE_INPUT", "Validation context contains a duplicate prevout", {
      outpoint: key,
    });
    map.set(key, prevout);
  }
  return map;
}

export function validateCircle(
  transaction: BitcoinTransaction,
  context: CircleValidationContext,
): ValidatedCircle {
  invariant(
    transaction.version === REQUIRED_TRANSACTION_VERSION,
    "TRANSACTION_VERSION",
    "Circle transaction version must be 2",
  );
  invariant(
    transaction.lockTime === REQUIRED_LOCK_TIME,
    "LOCK_TIME",
    "Circle locktime must be zero",
  );
  invariant(
    Number.isInteger(context.currentBlockHeight) && context.currentBlockHeight >= 1,
    "PREVOUT_HEIGHT",
    "Current block height must be positive",
  );
  invariant(transaction.outputs.length > 0, "OUTPUT_COUNT", "Circle requires a marker output");
  const markerOutput = transaction.outputs[0];
  invariant(markerOutput !== undefined, "OUTPUT_COUNT", "Circle marker output is missing");
  const marker = decodeMarkerScript(markerOutput.scriptPubKey);
  invariant(
    marker.network === context.network,
    "INVALID_NETWORK",
    "Marker network does not match validation context",
    {
      markerNetwork: marker.network,
      contextNetwork: context.network,
    },
  );
  invariant(markerOutput.value === 0n, "MARKER_VALUE", "Circle marker output must have zero value");
  invariant(
    transaction.inputs.length === marker.participantCount,
    "INPUT_COUNT",
    "Input count must equal marker participant count",
  );
  invariant(
    transaction.outputs.length === marker.participantCount + 1,
    "OUTPUT_COUNT",
    "Circle must contain one marker and one successor per participant",
  );

  const seenInputs = new Set<string>();
  for (let index = 0; index < transaction.inputs.length; index += 1) {
    const input = transaction.inputs[index];
    invariant(input !== undefined, "INVALID_TRANSACTION", "Input index is missing");
    invariant(
      input.sequence === REQUIRED_SEQUENCE,
      "SEQUENCE",
      "Every Circle input sequence must be 0xfffffffd",
      { slot: index },
    );
    invariant(
      input.scriptSig.length === 0,
      "INVALID_P2TR",
      "Native P2TR input scriptSig must be empty",
      { slot: index },
    );
    const key = outpointKey(input);
    invariant(!seenInputs.has(key), "DUPLICATE_INPUT", "Circle contains a duplicate input", {
      outpoint: key,
    });
    seenInputs.add(key);
    if (index > 0) {
      const previous = transaction.inputs[index - 1];
      invariant(
        previous !== undefined && compareOutpoints(previous, input) < 0,
        "INPUT_ORDER",
        "Inputs must be strictly sorted by display txid then vout",
        { slot: index },
      );
    }
  }

  const byOutpoint = prevoutMap(context.prevouts);
  invariant(
    byOutpoint.size === transaction.inputs.length,
    "INPUT_PREVOUT_MISSING",
    "Validation context must contain exactly one prevout per input",
  );
  const orderedPrevouts: CirclePrevout[] = [];
  const scripts = new Set<string>();
  let inputTotal = 0n;
  for (let index = 0; index < transaction.inputs.length; index += 1) {
    const input = transaction.inputs[index];
    invariant(input !== undefined, "INVALID_TRANSACTION", "Input index is missing");
    const prevout = byOutpoint.get(outpointKey(input));
    invariant(prevout !== undefined, "INPUT_PREVOUT_MISSING", "Input prevout is missing", {
      outpoint: outpointKey(input),
    });
    invariant(
      Number.isInteger(prevout.blockHeight) && prevout.blockHeight >= 0,
      "PREVOUT_HEIGHT",
      "Prevout block height is invalid",
    );
    invariant(
      prevout.blockHeight < context.currentBlockHeight,
      "INPUT_UNCONFIRMED",
      "Circle inputs must be confirmed in an earlier block",
      {
        outpoint: outpointKey(input),
        prevoutHeight: prevout.blockHeight,
        currentBlockHeight: context.currentBlockHeight,
      },
    );
    invariant(
      prevout.value >= 0n && prevout.value <= MAX_MONEY_SATS,
      "INTEGER_RANGE",
      "Prevout value is out of range",
    );
    invariant(
      isNativeP2tr(prevout.scriptPubKey),
      "INVALID_P2TR",
      "Every Circle input must spend native P2TR",
      { slot: index },
    );
    const scriptHex = bytesToHex(prevout.scriptPubKey);
    invariant(
      !scripts.has(scriptHex),
      "DUPLICATE_SCRIPT",
      "Each participant must use a distinct P2TR output key",
      { slot: index },
    );
    scripts.add(scriptHex);
    orderedPrevouts.push(prevout);
    inputTotal += prevout.value;
    invariant(
      inputTotal <= MAX_MONEY_SATS,
      "INTEGER_RANGE",
      "Circle input total exceeds MAX_MONEY",
    );
  }

  let outputTotal = 0n;
  for (const output of transaction.outputs) {
    invariant(
      output.value >= 0n && output.value <= MAX_MONEY_SATS,
      "INTEGER_RANGE",
      "Output value is out of range",
    );
    outputTotal += output.value;
    invariant(
      outputTotal <= MAX_MONEY_SATS,
      "INTEGER_RANGE",
      "Circle output total exceeds MAX_MONEY",
    );
  }
  invariant(inputTotal >= outputTotal, "FEE_NEGATIVE", "Circle outputs exceed inputs");
  const fee = inputTotal - outputTotal;
  const feeShares = allocateEqualFeeShares(fee, marker.participantCount);
  const txid = transactionId(transaction);

  const members: ValidatedCircleMember[] = [];
  for (let index = 0; index < marker.participantCount; index += 1) {
    const input = transaction.inputs[index];
    const prevout = orderedPrevouts[index];
    const output = transaction.outputs[index + 1];
    const feeShare = feeShares[index];
    invariant(
      input !== undefined &&
        prevout !== undefined &&
        output !== undefined &&
        feeShare !== undefined,
      "INVALID_TRANSACTION",
      "Circle slot data is missing",
      { slot: index },
    );
    invariant(
      bytesToHex(output.scriptPubKey) === bytesToHex(prevout.scriptPubKey),
      "OUTPUT_MAPPING",
      "Successor script must exactly match the corresponding input script",
      { slot: index },
    );
    invariant(
      output.value >= MIN_SUCCESSOR_VALUE_SATS,
      "SUCCESSOR_DUST",
      "Successor output is below the protocol minimum",
      {
        slot: index,
        minimum: MIN_SUCCESSOR_VALUE_SATS.toString(),
        actual: output.value.toString(),
      },
    );
    invariant(
      output.value === prevout.value - feeShare,
      "OUTPUT_MAPPING",
      "Successor value does not match deterministic fee allocation",
      {
        slot: index,
        expected: (prevout.value - feeShare).toString(),
        actual: output.value.toString(),
      },
    );
    const signatureMode =
      context.signatureMode ?? (context.verifySignatures === false ? "shape" : "verify");
    const decodedSignature =
      signatureMode === "unsigned" ? null : decodeCircleSignature(input.witness);
    if (signatureMode === "unsigned") {
      invariant(
        input.witness.length === 0,
        "WITNESS_SHAPE",
        "Unsigned Circle inputs must not contain witness data",
        { slot: index },
      );
    } else if (signatureMode === "verify") {
      invariant(
        verifyTaprootKeyPathSignature(transaction, index, orderedPrevouts),
        "INVALID_SIGNATURE",
        "Taproot signature verification failed",
        { slot: index },
      );
    }
    members.push({
      slot: index,
      input: { txid: input.txid, vout: input.vout },
      inputValue: prevout.value,
      scriptPubKey: prevout.scriptPubKey,
      successor: { txid, vout: index + 1 },
      successorValue: output.value,
      feeShare,
      signatureHashType: decodedSignature?.hashType ?? null,
    });
  }

  return {
    valid: true,
    txid,
    wtxid: witnessTransactionId(transaction),
    marker,
    fee,
    metrics: transactionMetrics(transaction),
    members,
    transaction,
  };
}

export function safeValidateCircle(
  transaction: BitcoinTransaction,
  context: CircleValidationContext,
): CircleValidationResult {
  try {
    return validateCircle(transaction, context);
  } catch (error) {
    return errorResult(error);
  }
}
