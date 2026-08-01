import {
  bytesToHex,
  encodeTransaction,
  parseCanonicalJson,
  parseParticipantPlanJson,
  WitnessCirclesSdk,
} from "../src/index.js";
import { goldenContext, loadGolden } from "./fixture.js";

describe("SDK facade and JSON interchange", () => {
  it("exposes canonical manifest, marker, transaction, and validation operations", () => {
    const sdk = new WitnessCirclesSdk();
    const vector = loadGolden();
    const manifest = sdk.manifest(vector.manifest);
    expect(manifest.hash).toBe(vector.contextHash);
    expect(manifest.canonical).toBe(vector.canonicalManifest);
    const marker = sdk.marker({
      network: "signet",
      participantCount: 3,
      contextHash: manifest.hash,
    });
    expect(marker).toBe(vector.markerScript);
    expect(sdk.decodeMarker(marker)).toMatchObject({ network: "signet", participantCount: 3 });
    expect(sdk.transaction(vector.rawTransaction)).toMatchObject({
      txid: vector.txid,
      wtxid: vector.wtxid,
      canonicalHex: vector.rawTransaction,
    });
    const { prevouts } = goldenContext();
    expect(
      sdk.validateRawTransaction(vector.rawTransaction, {
        network: "signet",
        currentBlockHeight: 200,
        prevouts,
      }),
    ).toMatchObject({ valid: true, txid: vector.txid });
  });

  it("plans and inspects through the facade", () => {
    const sdk = new WitnessCirclesSdk();
    const vector = loadGolden();
    const participants = vector.prevouts.map((prevout) =>
      parseParticipantPlanJson({ ...prevout, maximumFeeShareSats: "2000" }),
    );
    const plan = sdk.createPlan({
      network: "signet",
      manifest: vector.manifest as never,
      participants,
      feeRateSatsPerVbyte: 10n,
    });
    expect(sdk.createPsbtPlan(plan).inputs).toHaveLength(3);
    const first = participants[0];
    if (first === undefined) throw new Error("Fixture participant missing");
    const { prevouts } = goldenContext();
    expect(
      sdk.inspectSigningIntent(
        bytesToHex(encodeTransaction(plan.unsignedTransaction, false)),
        { network: "signet", currentBlockHeight: 200, prevouts },
        {
          ownedOutpoint: first,
          expectedContextHash: vector.contextHash,
          maximumFeeShare: 2_000n,
          maximumFeeRateSatsPerVbyte: 10n,
        },
      ),
    ).toMatchObject({ operation: "CIRCLE", feeShareSats: "1210" });
  });

  it("accepts exact canonical JSON and rejects noncanonical source", () => {
    expect(parseCanonicalJson('{"a":1,"b":2}')).toEqual({ a: 1, b: 2 });
    expect(() => parseCanonicalJson('{ "a": 1 }')).toThrow(/canonical/);
  });
});
