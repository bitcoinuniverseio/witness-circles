import {
  buildCirclePlan,
  bytesToHex,
  type CircleContextManifest,
  type CirclePrevout,
  deriveLineageId,
  estimateCircleVsize,
  hashWitnessState,
  MAX_MONEY_SATS,
  outpointKey,
  toCirclePsbtPlan,
  validateCircle,
  WitnessStateEngine,
  type WitnessStateSnapshot,
} from "../src/index.js";
import { goldenContext, loadGolden, privateKey, signTransaction } from "./fixture.js";

describe("planner and state engine", () => {
  it("keeps state ordering and hashes independent of the host locale", () => {
    const firstCircleTxid = "aa".repeat(32);
    const secondCircleTxid = "ff".repeat(32);
    const genesisA = { txid: "11".repeat(32), vout: 0 };
    const genesisB = { txid: "22".repeat(32), vout: 0 };
    const genesisC = { txid: "33".repeat(32), vout: 0 };
    const lineageA = deriveLineageId(genesisA);
    const lineageB = deriveLineageId(genesisB);
    const lineageC = deriveLineageId(genesisC);
    const scriptA = `5120${"01".repeat(32)}`;
    const scriptB = `5120${"02".repeat(32)}`;
    const scriptC = `5120${"03".repeat(32)}`;
    const snapshot: WitnessStateSnapshot = {
      protocol: "witc",
      version: 1,
      revision: 2,
      lineages: [
        {
          lineageId: lineageC,
          genesisOutpoint: outpointKey(genesisC),
          currentOutpoint: `${secondCircleTxid}:1`,
          status: "active",
          firstHeight: 2,
          lastHeight: 2,
          circleCount: 1,
          closedByTxid: null,
        },
        {
          lineageId: lineageB,
          genesisOutpoint: outpointKey(genesisB),
          currentOutpoint: `${firstCircleTxid}:2`,
          status: "active",
          firstHeight: 1,
          lastHeight: 1,
          circleCount: 1,
          closedByTxid: null,
        },
        {
          lineageId: lineageA,
          genesisOutpoint: outpointKey(genesisA),
          currentOutpoint: `${secondCircleTxid}:2`,
          status: "active",
          firstHeight: 1,
          lastHeight: 2,
          circleCount: 2,
          closedByTxid: null,
        },
      ],
      shards: [
        {
          outpoint: `${secondCircleTxid}:2`,
          lineageId: lineageA,
          scriptPubKey: scriptA,
          valueSats: "1900",
          createdByCircle: secondCircleTxid,
          previousOutpoint: `${firstCircleTxid}:1`,
          createdHeight: 2,
          spentByTxid: null,
          spentHeight: null,
        },
        {
          outpoint: `${secondCircleTxid}:1`,
          lineageId: lineageC,
          scriptPubKey: scriptC,
          valueSats: "2000",
          createdByCircle: secondCircleTxid,
          previousOutpoint: outpointKey(genesisC),
          createdHeight: 2,
          spentByTxid: null,
          spentHeight: null,
        },
        {
          outpoint: `${firstCircleTxid}:2`,
          lineageId: lineageB,
          scriptPubKey: scriptB,
          valueSats: "2000",
          createdByCircle: firstCircleTxid,
          previousOutpoint: outpointKey(genesisB),
          createdHeight: 1,
          spentByTxid: null,
          spentHeight: null,
        },
        {
          outpoint: `${firstCircleTxid}:1`,
          lineageId: lineageA,
          scriptPubKey: scriptA,
          valueSats: "2000",
          createdByCircle: firstCircleTxid,
          previousOutpoint: outpointKey(genesisA),
          createdHeight: 1,
          spentByTxid: secondCircleTxid,
          spentHeight: 2,
        },
      ],
      circles: [
        {
          txid: secondCircleTxid,
          wtxid: "77".repeat(32),
          contextHash: "55".repeat(32),
          participantCount: 2,
          feeSats: "200",
          blockHeight: 2,
          blockHash: "dd".repeat(32),
          transactionIndex: 0,
          members: [
            {
              slot: 1,
              lineageId: lineageA,
              inputOutpoint: `${firstCircleTxid}:1`,
              outputOutpoint: `${secondCircleTxid}:2`,
              inputValueSats: "2000",
              outputValueSats: "1900",
              feeShareSats: "100",
              wasExistingLineage: true,
            },
            {
              slot: 0,
              lineageId: lineageC,
              inputOutpoint: outpointKey(genesisC),
              outputOutpoint: `${secondCircleTxid}:1`,
              inputValueSats: "2100",
              outputValueSats: "2000",
              feeShareSats: "100",
              wasExistingLineage: false,
            },
          ],
        },
        {
          txid: firstCircleTxid,
          wtxid: "66".repeat(32),
          contextHash: "44".repeat(32),
          participantCount: 2,
          feeSats: "200",
          blockHeight: 1,
          blockHash: "cc".repeat(32),
          transactionIndex: 0,
          members: [
            {
              slot: 1,
              lineageId: lineageB,
              inputOutpoint: outpointKey(genesisB),
              outputOutpoint: `${firstCircleTxid}:2`,
              inputValueSats: "2100",
              outputValueSats: "2000",
              feeShareSats: "100",
              wasExistingLineage: false,
            },
            {
              slot: 0,
              lineageId: lineageA,
              inputOutpoint: outpointKey(genesisA),
              outputOutpoint: `${firstCircleTxid}:1`,
              inputValueSats: "2100",
              outputValueSats: "2000",
              feeShareSats: "100",
              wasExistingLineage: false,
            },
          ],
        },
      ],
      edges: [
        {
          fromCircle: firstCircleTxid,
          toCircle: secondCircleTxid,
          lineageId: lineageA,
          viaOutpoint: `${firstCircleTxid}:1`,
        },
      ],
    };
    const baselineHash = hashWitnessState(snapshot);
    const originalLocaleCompare = String.prototype.localeCompare;
    let localizedHash: string;
    let localizedOrder: string[];
    try {
      const danish = new Intl.Collator("da");
      String.prototype.localeCompare = function localeCompare(other: string): number {
        return danish.compare(String(this), other);
      };
      const engine = new WitnessStateEngine(snapshot);
      localizedHash = engine.stateHash();
      localizedOrder = engine.snapshot().lineages.map(({ lineageId }) => lineageId);
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
    expect(localizedOrder).toEqual([lineageA, lineageB, lineageC].sort());
    expect(localizedHash).toBe(baselineHash);
  });

  it("rejects noncanonical numeric state before hashing", () => {
    const empty = new WitnessStateEngine().snapshot();
    expect(() => hashWitnessState({ ...empty, revision: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      /safe integer/,
    );
    const shard = {
      outpoint: `${"aa".repeat(32)}:0`,
      lineageId: "bb".repeat(32),
      scriptPubKey: `5120${"cc".repeat(32)}`,
      valueSats: "1000",
      createdByCircle: "dd".repeat(32),
      previousOutpoint: `${"ee".repeat(32)}:0`,
      createdHeight: 1,
      spentByTxid: null,
      spentHeight: null,
    };
    expect(() =>
      hashWitnessState({
        ...empty,
        shards: [{ ...shard, outpoint: `${"aa".repeat(32)}:4294967296` }],
      }),
    ).toThrow(/uint32 outpoint/);
    expect(() =>
      hashWitnessState({ ...empty, shards: [{ ...shard, valueSats: "2100000000000001" }] }),
    ).toThrow(/MAX_MONEY/);
  });

  it("rejects duplicate, dangling, and status-inconsistent state snapshots", () => {
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
    const snapshot = engine.snapshot();
    const lineage = snapshot.lineages[0];
    const circle = snapshot.circles[0];
    if (lineage === undefined || lineage.currentOutpoint === null || circle === undefined) {
      throw new Error("Expected a complete first-Circle snapshot");
    }
    const currentOutpoint = lineage.currentOutpoint;

    expect(
      () =>
        new WitnessStateEngine({
          ...snapshot,
          databaseId: "must-not-be-hashed",
        } as WitnessStateSnapshot),
    ).toThrow(/exactly the protocol-defined fields/);
    expect(
      () =>
        new WitnessStateEngine({
          ...snapshot,
          shards: snapshot.shards.map((shard, index) =>
            index === 0 ? { ...shard, valueSats: 1_000 as never } : shard,
          ),
        }),
    ).toThrow(/canonical decimal satoshis/);
    expect(
      () =>
        new WitnessStateEngine({
          ...snapshot,
          lineages: [...snapshot.lineages, lineage],
        }),
    ).toThrow(/Lineage id must be unique/);
    expect(
      () =>
        new WitnessStateEngine({
          ...snapshot,
          lineages: snapshot.lineages.map((candidate) =>
            candidate.lineageId === lineage.lineageId
              ? { ...candidate, currentOutpoint: null }
              : candidate,
          ),
        }),
    ).toThrow(/Active lineage must have a current outpoint/);
    expect(
      () =>
        new WitnessStateEngine({
          ...snapshot,
          shards: snapshot.shards.filter((shard) => shard.outpoint !== currentOutpoint),
        }),
    ).toThrow(/successor shard|shard count|current shard/i);
    expect(
      () =>
        new WitnessStateEngine({
          ...snapshot,
          circles: [
            {
              ...circle,
              members: circle.members.map((member, index) =>
                index === 1 ? { ...member, slot: 0 } : member,
              ),
            },
          ],
        }),
    ).toThrow(/slots must be contiguous/);
    expect(
      () =>
        new WitnessStateEngine({
          ...snapshot,
          edges: [
            {
              fromCircle: circle.txid,
              toCircle: circle.txid,
              lineageId: lineage.lineageId,
              viaOutpoint: currentOutpoint,
            },
          ],
        }),
    ).toThrow(/edge does not match/);
  });

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

  it("fails closed when Circle creation is requested outside Signet or regtest", () => {
    const vector = loadGolden();
    const participants = vector.prevouts.slice(0, 2).map((prevout) => ({
      txid: prevout.txid,
      vout: prevout.vout,
      value: BigInt(prevout.valueSats),
      scriptPubKey: Uint8Array.from(Buffer.from(prevout.scriptPubKey, "hex")),
      blockHeight: prevout.blockHeight,
      maximumFeeShare: 2_000n,
    }));

    expect(() =>
      buildCirclePlan({
        network: "mainnet" as never,
        manifest: vector.manifest as never,
        participants,
        feeRateSatsPerVbyte: 10n,
      }),
    ).toThrow(/only on Signet and regtest/);
  });

  it("rejects nonintegral positions and aggregate values above MAX_MONEY", () => {
    const vector = loadGolden();
    const participants = vector.prevouts.slice(0, 2).map((prevout) => ({
      txid: prevout.txid,
      vout: prevout.vout,
      value: MAX_MONEY_SATS / 2n + 1n,
      scriptPubKey: Uint8Array.from(Buffer.from(prevout.scriptPubKey, "hex")),
      blockHeight: prevout.blockHeight,
      maximumFeeShare: 2_000n,
    }));
    const request = {
      network: "signet" as const,
      manifest: vector.manifest as never,
      participants,
      feeRateSatsPerVbyte: 1n,
    };

    expect(() => buildCirclePlan(request)).toThrow(/MAX_MONEY/);
    expect(() =>
      buildCirclePlan({
        ...request,
        participants: participants.map((participant, index) => ({
          ...participant,
          value: 30_000n,
          blockHeight: index === 0 ? 199.5 : participant.blockHeight,
        })),
      }),
    ).toThrow(/confirmed/);
    expect(() =>
      buildCirclePlan({
        ...request,
        participants: participants.map((participant, index) => ({
          ...participant,
          value: 30_000n,
          vout: index === 0 ? 0.5 : participant.vout,
        })),
      }),
    ).toThrow(/32-bit unsigned integer/);
  });

  it("applies, closes, and rolls back deterministic lineage state", () => {
    const vector = loadGolden();
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
    expect(applied.stateHash).toBe(vector.stateTransition.expectedStateHash);
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

  it("keeps apply and rollback failure-atomic", () => {
    const { validated } = goldenContext();
    const event = {
      txid: validated.txid,
      spentOutpoints: validated.members.map((member) => member.input),
      blockHeight: 200,
      blockHash: "aa".repeat(32),
      transactionIndex: 4,
      circle: validated,
    } as const;
    const engine = new WitnessStateEngine();
    const initialHash = engine.stateHash();

    expect(() => engine.apply({ ...event, transactionIndex: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      /safe integer/,
    );
    expect(engine.stateHash()).toBe(initialHash);
    expect(() => engine.rollbackLast()).toThrow(/No transition/);

    engine.apply(event);
    const appliedHash = engine.stateHash();
    expect(() => engine.apply(event)).toThrow(/already exists/);
    expect(engine.stateHash()).toBe(appliedHash);

    const wrongTxid = "ff".repeat(32);
    expect(() => engine.rollbackLast(wrongTxid)).toThrow(/does not match/);
    expect(engine.stateHash()).toBe(appliedHash);
    expect(engine.rollbackLast(validated.txid)).toBe(initialHash);
    expect(engine.stateHash()).toBe(initialHash);
    expect(() => engine.rollbackLast()).toThrow(/No transition/);
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
