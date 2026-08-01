import {
  type CircleContextManifest,
  parseParticipantPlanJson,
  WitnessCirclesSdk,
  type WitnessNetwork,
} from "@bitcoinuniverse/witness-circles";

interface JsonPlan {
  readonly network: WitnessNetwork;
  readonly manifest: CircleContextManifest;
  readonly participants: readonly unknown[];
  readonly feeRateSatsPerVbyte: string;
}

export function planFromJson(request: JsonPlan) {
  const sdk = new WitnessCirclesSdk();
  return sdk.createPlan({
    network: request.network,
    manifest: request.manifest,
    participants: request.participants.map(parseParticipantPlanJson),
    feeRateSatsPerVbyte: BigInt(request.feeRateSatsPerVbyte),
  });
}
