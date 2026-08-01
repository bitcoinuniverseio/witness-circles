import { bytesToHex, hexToBytes } from "./bytes.js";
import { MAX_MONEY_SATS } from "./constants.js";
import { invariant } from "./errors.js";
import {
  type CircleContextManifest,
  canonicalizeContextManifest,
  contextHash,
  validateContextManifest,
} from "./manifest.js";
import { decodeMarkerScript, encodeMarkerScript } from "./marker.js";
import {
  buildCirclePlan,
  type CirclePlan,
  type CirclePlanRequest,
  type CirclePsbtPlan,
  estimateCircleVsize,
  toCirclePsbtPlan,
} from "./planner.js";
import {
  decodeTransaction,
  encodeTransaction,
  type OutPoint,
  outpointKey,
  transactionId,
  transactionMetrics,
  witnessTransactionId,
} from "./transaction.js";
import {
  type CircleValidationContext,
  type CircleValidationResult,
  safeValidateCircle,
  validateCircle,
} from "./validator.js";

export interface CircleSigningPolicy {
  readonly ownedOutpoint: OutPoint;
  readonly expectedContextHash: string;
  readonly maximumFeeShare: bigint;
  readonly maximumTotalFee: bigint;
  readonly maximumFeeRateSatsPerVbyte: bigint;
}

export interface CircleSigningSummary {
  readonly operation: "CIRCLE";
  readonly participantCount: number;
  readonly inputOutpoint: string;
  readonly inputValueSats: string;
  readonly successorOutpoint: string;
  readonly successorValueSats: string;
  readonly feeShareSats: string;
  readonly totalFeeSats: string;
  readonly feeRateSatsPerVbyte: string;
  readonly contextHash: string;
  readonly publicLinkageWarning: string;
  readonly claimBoundary: string;
}

export function inspectUnsignedSigningIntent(
  transactionHex: string,
  context: Omit<CircleValidationContext, "signatureMode">,
  policy: CircleSigningPolicy,
): CircleSigningSummary {
  const transaction = decodeTransaction(transactionHex);
  const validated = validateCircle(transaction, { ...context, signatureMode: "unsigned" });
  invariant(
    policy.maximumFeeShare >= 0n &&
      policy.maximumTotalFee >= 0n &&
      policy.maximumFeeRateSatsPerVbyte >= 0n &&
      policy.maximumFeeShare <= MAX_MONEY_SATS &&
      policy.maximumTotalFee <= MAX_MONEY_SATS,
    "INTEGER_RANGE",
    "Signing fee caps are outside the supported range",
  );
  invariant(
    validated.marker.contextHash === policy.expectedContextHash.toLowerCase(),
    "INVALID_MARKER",
    "Context hash does not match the invitation",
  );
  const ownedKey = outpointKey(policy.ownedOutpoint);
  const member = validated.members.find((candidate) => outpointKey(candidate.input) === ownedKey);
  invariant(
    member !== undefined,
    "INPUT_PREVOUT_MISSING",
    "The owned outpoint does not appear exactly once in this Circle",
  );
  invariant(
    member.feeShare <= policy.maximumFeeShare,
    "FEE_CAP_EXCEEDED",
    "Circle fee share exceeds the signer cap",
    {
      expectedMaximum: policy.maximumFeeShare.toString(),
      actual: member.feeShare.toString(),
    },
  );
  invariant(
    validated.fee <= policy.maximumTotalFee,
    "FEE_CAP_EXCEEDED",
    "Circle total fee exceeds the signer cap",
    {
      expectedMaximum: policy.maximumTotalFee.toString(),
      actual: validated.fee.toString(),
    },
  );
  const virtualBytes = BigInt(estimateCircleVsize(validated.marker.participantCount));
  const feeRate = (validated.fee + virtualBytes - 1n) / virtualBytes;
  invariant(
    validated.fee <= policy.maximumFeeRateSatsPerVbyte * virtualBytes,
    "FEE_CAP_EXCEEDED",
    "Circle fee rate exceeds the signer cap",
    {
      expectedMaximum: policy.maximumFeeRateSatsPerVbyte.toString(),
      actual: feeRate.toString(),
    },
  );
  return {
    operation: "CIRCLE",
    participantCount: validated.marker.participantCount,
    inputOutpoint: ownedKey,
    inputValueSats: member.inputValue.toString(),
    successorOutpoint: outpointKey(member.successor),
    successorValueSats: member.successorValue.toString(),
    feeShareSats: member.feeShare.toString(),
    totalFeeSats: validated.fee.toString(),
    feeRateSatsPerVbyte: feeRate.toString(),
    contextHash: validated.marker.contextHash,
    publicLinkageWarning:
      "This dedicated Bitcoin input will be publicly linked with every participating input.",
    claimBoundary:
      "The transaction proves exact coauthorization, not identity, attendance, friendship, or one key per person.",
  };
}

export class WitnessCirclesSdk {
  createPlan(request: CirclePlanRequest): CirclePlan {
    return buildCirclePlan(request);
  }

  createPsbtPlan(plan: CirclePlan): CirclePsbtPlan {
    return toCirclePsbtPlan(plan);
  }

  validateRawTransaction(
    rawTransactionHex: string,
    context: CircleValidationContext,
  ): CircleValidationResult {
    return safeValidateCircle(decodeTransaction(rawTransactionHex), context);
  }

  inspectSigningIntent(
    unsignedTransactionHex: string,
    context: Omit<CircleValidationContext, "signatureMode">,
    policy: CircleSigningPolicy,
  ): CircleSigningSummary {
    return inspectUnsignedSigningIntent(unsignedTransactionHex, context, policy);
  }

  manifest(value: unknown): {
    readonly value: CircleContextManifest;
    readonly canonical: string;
    readonly hash: string;
  } {
    const manifest = validateContextManifest(value);
    return {
      value: manifest,
      canonical: canonicalizeContextManifest(manifest),
      hash: contextHash(manifest),
    };
  }

  marker(input: Parameters<typeof encodeMarkerScript>[0]): string {
    return bytesToHex(encodeMarkerScript(input));
  }

  decodeMarker(scriptHex: string): ReturnType<typeof decodeMarkerScript> {
    return decodeMarkerScript(hexToBytes(scriptHex));
  }

  transaction(rawTransactionHex: string): {
    readonly txid: string;
    readonly wtxid: string;
    readonly canonicalHex: string;
    readonly metrics: ReturnType<typeof transactionMetrics>;
  } {
    const transaction = decodeTransaction(rawTransactionHex);
    return {
      txid: transactionId(transaction),
      wtxid: witnessTransactionId(transaction),
      canonicalHex: bytesToHex(encodeTransaction(transaction, true)),
      metrics: transactionMetrics(transaction),
    };
  }
}
