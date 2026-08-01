import {
  buildCirclePlan,
  bytesToHex,
  type CircleContextManifest,
  type CirclePrevout,
  estimateCircleVsize,
  outpointKey,
  toCirclePsbtPlan,
  validateCircle,
  WitnessStateEngine,
} from "../src/index.js";
import { goldenContext, loadGolden, privateKey, signTransaction } from "./fixture.js";

describe("planner and state engine", () => {
  it("uses the exact vsize formula", () => {
    expect(estimateCircleVsize(2)).toBe(263);
    expect(estimateCircleVsize(4)).toBe(464);
    expect(estimateCircleVsize(8)).toBe(866);
    expect(estimateCircleVsize(16)).toBe(1670);
  });

  it("creates canonical plans and signer-minimized PSBT plans", () => {
    const vector = loadGolden();
    const participants = vector.prevouts
      .slice()
      .reverse()
      .map((prevout) => ({
        txid: prevout.txid,
        vout: prevout.vout,
        value: BigInt(prevout.valueSats),
        scriptPubKey: Uint8Array.from(Buffer.from(prevout.scriptPubKey, "hex")),
        blockHeight: prevout.blockHeight,
        maximumFeeShare: 2_000n,
      }));
    const plan = buildCirclePlan({
      network: "signet",
      manifest: vector.manifest as never,
      participants,
      feeRateSatsPerVbyte: 10n,
    });
    expect(plan.contextHash).toBe(vector.contextHash);
    expect(plan.totalFee).toBe(3_630n);
    expect(plan.participants.map((member) => member.txid)).toEqual(
      vector.prevouts.map((item) => item.txid),
    );
    const markerOutput = plan.unsignedTransaction.outputs[0];
    if (markerOutput === undefined) throw new Error("Planned marker output is missing");
    expect(bytesToHex(markerOutput.scriptPubKey)).toBe(vector.markerScript);
    expect(toCirclePsbtPlan(plan)).toMatchObject({
      psbtVersion: 0,
      globalXpubs: [],
      proprietaryFields: [],
      contributionField: "PSBT_IN_TAP_KEY_SIG",
      autoFinalize: false,
    });
  });

  it("applies, closes, and rolls back deterministic lineage state", () => {
    const { validated } = goldenContext();
    const engine = new WitnessStateEngine();
    const initialHash = engine.stateHash();
    const applied = engine.apply({
      txid: validated.txid,
      spentOutpoints: validated.members.map((member) => member.input),
      blockHeight: 200,
      blockHash: "aa".repeat(32),
      transactionIndex: 4,
      circle: validated,
    });
    expect(applied.kind).toBe("circle");
    expect(applied.createdLineages).toHaveLength(3);
    expect(engine.snapshot()).toMatchObject({ revision: 1 });
    expect(engine.snapshot().lineages.every((lineage) => lineage.status === "active")).toBe(true);

    const firstShard = engine.snapshot().shards[0];
    if (firstShard === undefined) throw new Error("Expected a state shard");
    const [txid, vout] = firstShard.outpoint.split(":");
    if (txid === undefined || vout === undefined)
      throw new Error("State shard outpoint is invalid");
    const closure = engine.apply({
      txid: "bb".repeat(32),
      spentOutpoints: [{ txid, vout: Number(vout) }],
      blockHeight: 201,
      blockHash: "cc".repeat(32),
      transactionIndex: 0,
      circle: null,
    });
    expect(closure.kind).toBe("ordinary-spend");
    expect(closure.closedLineages).toHaveLength(1);
    engine.rollbackLast("bb".repeat(32));
    expect(engine.snapshot().lineages.every((lineage) => lineage.status === "active")).toBe(true);
    engine.rollbackLast(validated.txid);
    expect(engine.stateHash()).toBe(initialHash);
  });

  it("continues active lineages and records Circle edges", () => {
    const { validated } = goldenContext();
    const engine = new WitnessStateEngine();
    engine.apply({
      txid: validated.txid,
      spentOutpoints: validated.members.map((member) => member.input),
      blockHeight: 200,
      blockHash: "aa".repeat(32),
      transactionIndex: 4,
      circle: validated,
    });
    const manifest: CircleContextManifest = {
      protocol: "witc",
      version: 1,
      kind: "circle",
      nonce: "11111111111111111111111111111111",
      title: "Continuation test",
      created: "2026-08-01T20:00:00Z",
      expires: "2026-08-01T21:00:00Z",
    };
    const participants = validated.members.slice(0, 2).map((member) => ({
      txid: member.successor.txid,
      vout: member.successor.vout,
      value: member.successorValue,
      scriptPubKey: member.scriptPubKey,
      blockHeight: 200,
      maximumFeeShare: 5_000n,
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
    const transaction = signTransaction(plan.unsignedTransaction, prevouts, [
      privateKey(0),
      privateKey(1),
    ]);
    const continued = validateCircle(transaction, {
      network: "signet",
      currentBlockHeight: 201,
      prevouts,
    });
    const result = engine.apply({
      txid: continued.txid,
      spentOutpoints: continued.members.map((member) => member.input),
      blockHeight: 201,
      blockHash: "bb".repeat(32),
      transactionIndex: 1,
      circle: continued,
    });
    expect(result.continuedLineages).toHaveLength(2);
    expect(result.createdLineages).toHaveLength(0);
    expect(engine.snapshot().edges).toHaveLength(2);
    expect(
      engine.snapshot().lineages.filter((lineage) => lineage.status === "active"),
    ).toHaveLength(3);
  });

  it("never mistakes an unrelated spend for a protocol event", () => {
    const engine = new WitnessStateEngine();
    const initialHash = engine.stateHash();
    const result = engine.apply({
      txid: "dd".repeat(32),
      spentOutpoints: [{ txid: "ee".repeat(32), vout: 1 }],
      blockHeight: 1,
      blockHash: "ff".repeat(32),
      transactionIndex: 0,
      circle: null,
    });
    expect(result.kind).toBe("unrelated");
    expect(result.stateHash).toBe(initialHash);
    expect(engine.snapshot().revision).toBe(0);
    expect(engine.snapshot().circles).toHaveLength(0);
    expect(outpointKey({ txid: "ee".repeat(32), vout: 1 })).toContain(":1");
  });
});
