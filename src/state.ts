import { bytesToHex, utf8Bytes } from "./bytes.js";
import { LINEAGE_DOMAIN, MAX_MONEY_SATS, MIN_SUCCESSOR_VALUE_SATS } from "./constants.js";
import { invariant } from "./errors.js";
import { sha256 } from "./hash.js";
import { canonicalizeJson, type JsonValue } from "./jcs.js";
import { type OutPoint, outpointKey, serializeOutpoint } from "./transaction.js";
import type { ValidatedCircle } from "./validator.js";

export type LineageStatus = "active" | "closed";

export interface StateLineage {
  readonly lineageId: string;
  readonly genesisOutpoint: string;
  readonly currentOutpoint: string | null;
  readonly status: LineageStatus;
  readonly firstHeight: number;
  readonly lastHeight: number;
  readonly circleCount: number;
  readonly closedByTxid: string | null;
}

export interface StateShard {
  readonly outpoint: string;
  readonly lineageId: string;
  readonly scriptPubKey: string;
  readonly valueSats: string;
  readonly createdByCircle: string;
  readonly previousOutpoint: string;
  readonly createdHeight: number;
  readonly spentByTxid: string | null;
  readonly spentHeight: number | null;
}

export interface StateCircleMember {
  readonly slot: number;
  readonly lineageId: string;
  readonly inputOutpoint: string;
  readonly outputOutpoint: string;
  readonly inputValueSats: string;
  readonly outputValueSats: string;
  readonly feeShareSats: string;
  readonly wasExistingLineage: boolean;
}

export interface StateCircle {
  readonly txid: string;
  readonly wtxid: string;
  readonly contextHash: string;
  readonly participantCount: number;
  readonly feeSats: string;
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly transactionIndex: number;
  readonly members: readonly StateCircleMember[];
}

export interface StateEdge {
  readonly fromCircle: string;
  readonly toCircle: string;
  readonly lineageId: string;
  readonly viaOutpoint: string;
}

export interface WitnessStateSnapshot {
  readonly protocol: "witc";
  readonly version: 1;
  readonly revision: number;
  readonly lineages: readonly StateLineage[];
  readonly shards: readonly StateShard[];
  readonly circles: readonly StateCircle[];
  readonly edges: readonly StateEdge[];
}

export interface ConfirmedTransactionEvent {
  readonly txid: string;
  readonly spentOutpoints: readonly OutPoint[];
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly transactionIndex: number;
  readonly circle: ValidatedCircle | null;
}

export interface AppliedTransition {
  readonly txid: string;
  readonly kind: "circle" | "ordinary-spend" | "unrelated";
  readonly closedLineages: readonly string[];
  readonly createdLineages: readonly string[];
  readonly continuedLineages: readonly string[];
  readonly stateHash: string;
}

export function deriveLineageId(genesisOutpoint: OutPoint): string {
  return bytesToHex(
    sha256(new Uint8Array([...utf8Bytes(LINEAGE_DOMAIN), ...serializeOutpoint(genesisOutpoint)])),
  );
}

function emptySnapshot(): WitnessStateSnapshot {
  return {
    protocol: "witc",
    version: 1,
    revision: 0,
    lineages: [],
    shards: [],
    circles: [],
    edges: [],
  };
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertExactKeys(value: unknown, expectedKeys: readonly string[], label: string): void {
  invariant(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "INVALID_STATE",
    `${label} must be an object`,
  );
  const actualKeys = Object.keys(value).sort(compareOrdinal);
  const sortedExpectedKeys = [...expectedKeys].sort(compareOrdinal);
  invariant(
    actualKeys.length === sortedExpectedKeys.length &&
      actualKeys.every((key, index) => key === sortedExpectedKeys[index]),
    "INVALID_STATE",
    `${label} must contain exactly the protocol-defined fields`,
    { actualKeys, expectedKeys: sortedExpectedKeys },
  );
}

function assertSafeInteger(value: number, label: string, minimum = 0): void {
  invariant(
    Number.isSafeInteger(value) && value >= minimum,
    "INVALID_STATE",
    `${label} must be a safe integer of at least ${minimum}`,
  );
}

function assertHex64(value: unknown, label: string, nullable = false): void {
  invariant(
    (nullable && value === null) || (typeof value === "string" && /^[0-9a-f]{64}$/.test(value)),
    "INVALID_STATE",
    `${label} must be canonical lowercase 32-byte hex`,
  );
}

function assertOutpoint(value: unknown, label: string, nullable = false): void {
  if (nullable && value === null) return;
  invariant(typeof value === "string", "INVALID_STATE", `${label} must be a string outpoint`);
  const match = /^([0-9a-f]{64}):(0|[1-9][0-9]{0,9})$/.exec(value);
  const vout = match ? Number(match[2]) : -1;
  invariant(
    match !== null && Number.isSafeInteger(vout) && vout >= 0 && vout <= 0xffff_ffff,
    "INVALID_STATE",
    `${label} must be a canonical uint32 outpoint`,
  );
}

function stateOutpoint(value: string, label: string): OutPoint {
  assertOutpoint(value, label);
  const separator = value.lastIndexOf(":");
  return { txid: value.slice(0, separator), vout: Number(value.slice(separator + 1)) };
}

function compareStateOutpoints(left: string, right: string): number {
  const leftOutpoint = stateOutpoint(left, "left outpoint");
  const rightOutpoint = stateOutpoint(right, "right outpoint");
  return (
    compareOrdinal(leftOutpoint.txid, rightOutpoint.txid) || leftOutpoint.vout - rightOutpoint.vout
  );
}

function setUnique<T>(map: Map<string, T>, key: string, value: T, label: string): void {
  invariant(!map.has(key), "INVALID_STATE", `${label} must be unique`, { key });
  map.set(key, value);
}

interface StateMembership {
  readonly circle: StateCircle;
  readonly member: StateCircleMember;
}

function compareMembership(left: StateMembership, right: StateMembership): number {
  return compareCirclePosition(left.circle, right.circle);
}

function compareCirclePosition(left: StateCircle, right: StateCircle): number {
  return (
    left.blockHeight - right.blockHeight ||
    left.transactionIndex - right.transactionIndex ||
    compareOrdinal(left.txid, right.txid)
  );
}

function assertSats(value: unknown, label: string): void {
  invariant(
    typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value),
    "INVALID_STATE",
    `${label} must be canonical decimal satoshis`,
  );
  invariant(BigInt(value) <= MAX_MONEY_SATS, "INVALID_STATE", `${label} exceeds Bitcoin MAX_MONEY`);
}

export function validateWitnessStateSnapshot(snapshot: WitnessStateSnapshot): void {
  assertExactKeys(
    snapshot,
    ["protocol", "version", "revision", "lineages", "shards", "circles", "edges"],
    "State snapshot",
  );
  invariant(
    snapshot.protocol === "witc" && snapshot.version === 1,
    "INVALID_STATE",
    "Unsupported state snapshot",
  );
  assertSafeInteger(snapshot.revision, "revision");
  invariant(
    Array.isArray(snapshot.lineages) &&
      Array.isArray(snapshot.shards) &&
      Array.isArray(snapshot.circles) &&
      Array.isArray(snapshot.edges),
    "INVALID_STATE",
    "State snapshot collections must be arrays",
  );
  for (const lineage of snapshot.lineages) {
    assertExactKeys(
      lineage,
      [
        "lineageId",
        "genesisOutpoint",
        "currentOutpoint",
        "status",
        "firstHeight",
        "lastHeight",
        "circleCount",
        "closedByTxid",
      ],
      "Lineage",
    );
    assertHex64(lineage.lineageId, "lineageId");
    assertOutpoint(lineage.genesisOutpoint, "genesisOutpoint");
    assertOutpoint(lineage.currentOutpoint, "currentOutpoint", true);
    invariant(
      lineage.status === "active" || lineage.status === "closed",
      "INVALID_STATE",
      "Lineage status is invalid",
    );
    assertSafeInteger(lineage.firstHeight, "firstHeight");
    assertSafeInteger(lineage.lastHeight, "lastHeight");
    assertSafeInteger(lineage.circleCount, "circleCount", 1);
    assertHex64(lineage.closedByTxid, "closedByTxid", true);
  }
  for (const shard of snapshot.shards) {
    assertExactKeys(
      shard,
      [
        "outpoint",
        "lineageId",
        "scriptPubKey",
        "valueSats",
        "createdByCircle",
        "previousOutpoint",
        "createdHeight",
        "spentByTxid",
        "spentHeight",
      ],
      "Shard",
    );
    assertOutpoint(shard.outpoint, "shard.outpoint");
    assertHex64(shard.lineageId, "shard.lineageId");
    invariant(
      /^5120[0-9a-f]{64}$/.test(shard.scriptPubKey),
      "INVALID_STATE",
      "Shard scriptPubKey must be canonical P2TR hex",
    );
    assertSats(shard.valueSats, "shard.valueSats");
    assertHex64(shard.createdByCircle, "shard.createdByCircle");
    assertOutpoint(shard.previousOutpoint, "shard.previousOutpoint");
    assertSafeInteger(shard.createdHeight, "shard.createdHeight");
    assertHex64(shard.spentByTxid, "shard.spentByTxid", true);
    if (shard.spentHeight !== null) assertSafeInteger(shard.spentHeight, "shard.spentHeight");
  }
  for (const circle of snapshot.circles) {
    assertExactKeys(
      circle,
      [
        "txid",
        "wtxid",
        "contextHash",
        "participantCount",
        "feeSats",
        "blockHeight",
        "blockHash",
        "transactionIndex",
        "members",
      ],
      "Circle",
    );
    assertHex64(circle.txid, "circle.txid");
    assertHex64(circle.wtxid, "circle.wtxid");
    assertHex64(circle.contextHash, "circle.contextHash");
    invariant(Array.isArray(circle.members), "INVALID_STATE", "Circle members must be an array");
    invariant(
      Number.isInteger(circle.participantCount) &&
        circle.participantCount >= 2 &&
        circle.participantCount <= 16 &&
        circle.members.length === circle.participantCount,
      "INVALID_STATE",
      "Circle participant count is invalid",
    );
    assertSats(circle.feeSats, "circle.feeSats");
    assertSafeInteger(circle.blockHeight, "circle.blockHeight");
    assertHex64(circle.blockHash, "circle.blockHash");
    assertSafeInteger(circle.transactionIndex, "circle.transactionIndex");
    for (const member of circle.members) {
      assertExactKeys(
        member,
        [
          "slot",
          "lineageId",
          "inputOutpoint",
          "outputOutpoint",
          "inputValueSats",
          "outputValueSats",
          "feeShareSats",
          "wasExistingLineage",
        ],
        "Circle member",
      );
      invariant(
        Number.isInteger(member.slot) && member.slot >= 0 && member.slot < 16,
        "INVALID_STATE",
        "Circle member slot is invalid",
      );
      assertHex64(member.lineageId, "member.lineageId");
      assertOutpoint(member.inputOutpoint, "member.inputOutpoint");
      assertOutpoint(member.outputOutpoint, "member.outputOutpoint");
      assertSats(member.inputValueSats, "member.inputValueSats");
      assertSats(member.outputValueSats, "member.outputValueSats");
      assertSats(member.feeShareSats, "member.feeShareSats");
      invariant(
        typeof member.wasExistingLineage === "boolean",
        "INVALID_STATE",
        "Circle member lineage flag is invalid",
      );
    }
  }
  for (const edge of snapshot.edges) {
    assertExactKeys(edge, ["fromCircle", "toCircle", "lineageId", "viaOutpoint"], "Circle edge");
    assertHex64(edge.fromCircle, "edge.fromCircle");
    assertHex64(edge.toCircle, "edge.toCircle");
    assertHex64(edge.lineageId, "edge.lineageId");
    assertOutpoint(edge.viaOutpoint, "edge.viaOutpoint");
  }

  const lineageById = new Map<string, StateLineage>();
  const lineageByGenesis = new Map<string, StateLineage>();
  const lineageByCurrent = new Map<string, StateLineage>();
  for (const lineage of snapshot.lineages) {
    setUnique(lineageById, lineage.lineageId, lineage, "Lineage id");
    setUnique(lineageByGenesis, lineage.genesisOutpoint, lineage, "Lineage genesis outpoint");
    invariant(
      lineage.lastHeight >= lineage.firstHeight,
      "INVALID_STATE",
      "Lineage lastHeight precedes firstHeight",
      { lineageId: lineage.lineageId },
    );
    if (lineage.status === "active") {
      invariant(
        lineage.currentOutpoint !== null && lineage.closedByTxid === null,
        "INVALID_STATE",
        "Active lineage must have a current outpoint and no closing transaction",
        { lineageId: lineage.lineageId },
      );
      setUnique(
        lineageByCurrent,
        lineage.currentOutpoint,
        lineage,
        "Active lineage current outpoint",
      );
    } else {
      invariant(
        lineage.currentOutpoint === null && lineage.closedByTxid !== null,
        "INVALID_STATE",
        "Closed lineage must have no current outpoint and must name its closing transaction",
        { lineageId: lineage.lineageId },
      );
    }
  }

  const shardByOutpoint = new Map<string, StateShard>();
  const shardsByLineage = new Map<string, StateShard[]>();
  for (const shard of snapshot.shards) {
    setUnique(shardByOutpoint, shard.outpoint, shard, "Shard outpoint");
    invariant(
      lineageById.has(shard.lineageId),
      "INVALID_STATE",
      "Shard references a missing lineage",
      { outpoint: shard.outpoint, lineageId: shard.lineageId },
    );
    invariant(
      BigInt(shard.valueSats) >= MIN_SUCCESSOR_VALUE_SATS,
      "INVALID_STATE",
      "Shard value is below the protocol minimum",
      { outpoint: shard.outpoint },
    );
    invariant(
      (shard.spentByTxid === null) === (shard.spentHeight === null),
      "INVALID_STATE",
      "Shard spend transaction and height must both be null or both be present",
      { outpoint: shard.outpoint },
    );
    if (shard.spentHeight !== null) {
      invariant(
        shard.spentHeight >= shard.createdHeight,
        "INVALID_STATE",
        "Shard spend height precedes its creation height",
        { outpoint: shard.outpoint },
      );
    }
    const lineageShards = shardsByLineage.get(shard.lineageId) ?? [];
    lineageShards.push(shard);
    shardsByLineage.set(shard.lineageId, lineageShards);
  }

  const circleByTxid = new Map<string, StateCircle>();
  const circleByPosition = new Map<string, StateCircle>();
  const blockHashByHeight = new Map<number, string>();
  const membershipByOutput = new Map<string, StateMembership>();
  const membershipByCircleLineage = new Map<string, StateMembership>();
  const membershipsByLineage = new Map<string, StateMembership[]>();
  const spentMemberInputs = new Set<string>();
  for (const circle of snapshot.circles) {
    setUnique(circleByTxid, circle.txid, circle, "Circle txid");
    setUnique(
      circleByPosition,
      `${circle.blockHeight}:${circle.transactionIndex}`,
      circle,
      "Circle block position",
    );
    const knownBlockHash = blockHashByHeight.get(circle.blockHeight);
    invariant(
      knownBlockHash === undefined || knownBlockHash === circle.blockHash,
      "INVALID_STATE",
      "Circles at one height must share the same canonical block hash",
      { blockHeight: circle.blockHeight },
    );
    blockHashByHeight.set(circle.blockHeight, circle.blockHash);

    const members = [...circle.members].sort((a, b) => a.slot - b.slot);
    const scripts = new Set<string>();
    const circleFee = BigInt(circle.feeSats);
    const baseFeeShare = circleFee / BigInt(circle.participantCount);
    const feeRemainder = circleFee % BigInt(circle.participantCount);
    let inputTotal = 0n;
    let outputTotal = 0n;
    let feeTotal = 0n;
    for (let index = 0; index < members.length; index += 1) {
      const member = members[index];
      invariant(
        member !== undefined && member.slot === index,
        "INVALID_STATE",
        "Circle slots must be contiguous from zero",
        {
          circleTxid: circle.txid,
        },
      );
      invariant(
        lineageById.has(member.lineageId),
        "INVALID_STATE",
        "Circle member references a missing lineage",
        { circleTxid: circle.txid, lineageId: member.lineageId },
      );
      setUnique(
        membershipByCircleLineage,
        `${circle.txid}:${member.lineageId}`,
        { circle, member },
        "Circle member lineage",
      );
      invariant(
        !spentMemberInputs.has(member.inputOutpoint),
        "INVALID_STATE",
        "A Circle input outpoint may be consumed only once",
        { outpoint: member.inputOutpoint },
      );
      spentMemberInputs.add(member.inputOutpoint);
      invariant(
        member.outputOutpoint === `${circle.txid}:${member.slot + 1}`,
        "INVALID_STATE",
        "Circle member output outpoint does not match its slot",
        { circleTxid: circle.txid, slot: member.slot },
      );
      setUnique(
        membershipByOutput,
        member.outputOutpoint,
        { circle, member },
        "Circle member output outpoint",
      );
      const inputValue = BigInt(member.inputValueSats);
      const outputValue = BigInt(member.outputValueSats);
      const feeShare = BigInt(member.feeShareSats);
      const expectedFeeShare = baseFeeShare + (BigInt(member.slot) < feeRemainder ? 1n : 0n);
      invariant(
        inputValue >= outputValue && inputValue - outputValue === feeShare,
        "INVALID_STATE",
        "Circle member values do not match its fee share",
        { circleTxid: circle.txid, slot: member.slot },
      );
      invariant(
        feeShare === expectedFeeShare,
        "INVALID_STATE",
        "Circle member fee share does not match the protocol distribution",
        { circleTxid: circle.txid, slot: member.slot },
      );
      invariant(
        outputValue >= MIN_SUCCESSOR_VALUE_SATS,
        "INVALID_STATE",
        "Circle member output is below the protocol minimum",
        { circleTxid: circle.txid, slot: member.slot },
      );
      inputTotal += inputValue;
      outputTotal += outputValue;
      feeTotal += feeShare;

      const successorShard = shardByOutpoint.get(member.outputOutpoint);
      invariant(
        successorShard !== undefined &&
          successorShard.lineageId === member.lineageId &&
          successorShard.createdByCircle === circle.txid &&
          successorShard.previousOutpoint === member.inputOutpoint &&
          successorShard.createdHeight === circle.blockHeight &&
          successorShard.valueSats === member.outputValueSats,
        "INVALID_STATE",
        "Circle member and successor shard disagree",
        { circleTxid: circle.txid, slot: member.slot },
      );
      invariant(
        !scripts.has(successorShard.scriptPubKey),
        "INVALID_STATE",
        "Circle successor scripts must be distinct",
        { circleTxid: circle.txid },
      );
      scripts.add(successorShard.scriptPubKey);

      if (member.wasExistingLineage) {
        const predecessor = shardByOutpoint.get(member.inputOutpoint);
        invariant(
          predecessor !== undefined &&
            predecessor.lineageId === member.lineageId &&
            predecessor.valueSats === member.inputValueSats &&
            predecessor.scriptPubKey === successorShard.scriptPubKey &&
            predecessor.spentByTxid === circle.txid &&
            predecessor.spentHeight === circle.blockHeight,
          "INVALID_STATE",
          "Continuation member and predecessor shard disagree",
          { circleTxid: circle.txid, lineageId: member.lineageId },
        );
      } else {
        invariant(
          deriveLineageId(stateOutpoint(member.inputOutpoint, "fresh member input")) ===
            member.lineageId,
          "INVALID_STATE",
          "Fresh member lineage id does not derive from its genesis outpoint",
          { circleTxid: circle.txid, slot: member.slot },
        );
      }

      const lineageMemberships = membershipsByLineage.get(member.lineageId) ?? [];
      lineageMemberships.push({ circle, member });
      membershipsByLineage.set(member.lineageId, lineageMemberships);
    }
    for (let index = 1; index < members.length; index += 1) {
      const previous = members[index - 1];
      const member = members[index];
      invariant(
        previous !== undefined &&
          member !== undefined &&
          compareStateOutpoints(previous.inputOutpoint, member.inputOutpoint) < 0,
        "INVALID_STATE",
        "Circle member inputs are not in canonical outpoint order",
        { circleTxid: circle.txid },
      );
    }
    invariant(
      inputTotal <= MAX_MONEY_SATS && outputTotal <= MAX_MONEY_SATS,
      "INVALID_STATE",
      "Circle aggregate values exceed Bitcoin MAX_MONEY",
      { circleTxid: circle.txid },
    );
    invariant(
      feeTotal === circleFee,
      "INVALID_STATE",
      "Circle fee does not equal the sum of member fee shares",
      { circleTxid: circle.txid },
    );
  }

  invariant(
    membershipByOutput.size === snapshot.shards.length,
    "INVALID_STATE",
    "Every shard must be created by exactly one Circle member",
  );
  for (const membership of membershipByCircleLineage.values()) {
    if (!membership.member.wasExistingLineage) {
      invariant(
        !membershipByOutput.has(membership.member.inputOutpoint),
        "INVALID_STATE",
        "A fresh member input cannot be a historical protocol shard",
        { circleTxid: membership.circle.txid, outpoint: membership.member.inputOutpoint },
      );
    }
  }

  const edgeByContinuation = new Map<string, StateEdge>();
  for (const edge of snapshot.edges) {
    const from = circleByTxid.get(edge.fromCircle);
    const to = circleByTxid.get(edge.toCircle);
    const predecessor = shardByOutpoint.get(edge.viaOutpoint);
    const membership = membershipByCircleLineage.get(`${edge.toCircle}:${edge.lineageId}`);
    invariant(
      from !== undefined &&
        to !== undefined &&
        compareCirclePosition(from, to) < 0 &&
        predecessor !== undefined &&
        predecessor.lineageId === edge.lineageId &&
        predecessor.createdByCircle === edge.fromCircle &&
        predecessor.spentByTxid === edge.toCircle &&
        membership !== undefined &&
        membership.member.wasExistingLineage &&
        membership.member.inputOutpoint === edge.viaOutpoint,
      "INVALID_STATE",
      "Circle edge does not match a canonical continuation",
      { toCircle: edge.toCircle, lineageId: edge.lineageId },
    );
    setUnique(
      edgeByContinuation,
      `${edge.toCircle}:${edge.lineageId}`,
      edge,
      "Circle continuation edge",
    );
  }
  for (const [key, membership] of membershipByCircleLineage) {
    invariant(
      membership.member.wasExistingLineage === edgeByContinuation.has(key),
      "INVALID_STATE",
      "Continuation members and Circle edges must correspond exactly",
      { circleTxid: membership.circle.txid, lineageId: membership.member.lineageId },
    );
  }

  const closureHeightByTxid = new Map<string, number>();
  for (const lineage of snapshot.lineages) {
    const history = [...(membershipsByLineage.get(lineage.lineageId) ?? [])].sort(
      compareMembership,
    );
    invariant(
      history.length === lineage.circleCount && history.length > 0,
      "INVALID_STATE",
      "Lineage circleCount does not match its Circle history",
      { lineageId: lineage.lineageId },
    );
    const first = history[0];
    const last = history.at(-1);
    invariant(
      first !== undefined &&
        last !== undefined &&
        !first.member.wasExistingLineage &&
        first.member.inputOutpoint === lineage.genesisOutpoint &&
        first.circle.blockHeight === lineage.firstHeight,
      "INVALID_STATE",
      "Lineage genesis fields do not match its first Circle",
      { lineageId: lineage.lineageId },
    );
    const lineageShards = shardsByLineage.get(lineage.lineageId) ?? [];
    invariant(
      lineageShards.length === history.length,
      "INVALID_STATE",
      "Lineage shard count does not match its Circle history",
      { lineageId: lineage.lineageId },
    );
    const firstShard = shardByOutpoint.get(first.member.outputOutpoint);
    invariant(firstShard !== undefined, "INVALID_STATE", "Lineage first shard is missing");
    for (let index = 0; index < history.length; index += 1) {
      const current = history[index];
      const next = history[index + 1];
      invariant(current !== undefined, "INVALID_STATE", "Lineage history item is missing");
      const currentShard = shardByOutpoint.get(current.member.outputOutpoint);
      invariant(
        currentShard !== undefined && currentShard.scriptPubKey === firstShard.scriptPubKey,
        "INVALID_STATE",
        "A lineage must preserve one P2TR script across all shards",
        { lineageId: lineage.lineageId },
      );
      if (next !== undefined) {
        invariant(
          next.member.wasExistingLineage &&
            next.member.inputOutpoint === current.member.outputOutpoint &&
            currentShard.spentByTxid === next.circle.txid &&
            currentShard.spentHeight === next.circle.blockHeight,
          "INVALID_STATE",
          "Lineage shard chain is discontinuous",
          { lineageId: lineage.lineageId },
        );
      }
    }
    const lastShard = shardByOutpoint.get(last.member.outputOutpoint);
    invariant(lastShard !== undefined, "INVALID_STATE", "Lineage current shard is missing");
    if (lineage.status === "active") {
      invariant(
        lineage.currentOutpoint === last.member.outputOutpoint &&
          lineage.lastHeight === last.circle.blockHeight &&
          lastShard.spentByTxid === null &&
          lastShard.spentHeight === null,
        "INVALID_STATE",
        "Active lineage fields do not match its latest shard",
        { lineageId: lineage.lineageId },
      );
    } else {
      const closureTxid = lineage.closedByTxid;
      invariant(closureTxid !== null, "INVALID_STATE", "Closed lineage transaction is missing");
      invariant(
        closureTxid === lastShard.spentByTxid &&
          lineage.lastHeight === lastShard.spentHeight &&
          lineage.lastHeight >= last.circle.blockHeight,
        "INVALID_STATE",
        "Closed lineage fields do not match its terminal shard spend",
        { lineageId: lineage.lineageId },
      );
      invariant(
        !circleByTxid.has(closureTxid),
        "INVALID_STATE",
        "A valid Circle transaction cannot also be an ordinary lineage closure",
        { lineageId: lineage.lineageId, closureTxid },
      );
      const knownClosureHeight = closureHeightByTxid.get(closureTxid);
      invariant(
        knownClosureHeight === undefined || knownClosureHeight === lineage.lastHeight,
        "INVALID_STATE",
        "Lineages closed by one transaction must share one block height",
        { closureTxid },
      );
      closureHeightByTxid.set(closureTxid, lineage.lastHeight);
    }
  }

  invariant(
    snapshot.revision === snapshot.circles.length + closureHeightByTxid.size,
    "INVALID_STATE",
    "State revision does not match Circle and closure transitions",
  );
}

function sortSnapshot(snapshot: WitnessStateSnapshot): WitnessStateSnapshot {
  return {
    ...snapshot,
    lineages: [...snapshot.lineages].sort((a, b) => compareOrdinal(a.lineageId, b.lineageId)),
    shards: [...snapshot.shards].sort((a, b) => compareOrdinal(a.outpoint, b.outpoint)),
    circles: [...snapshot.circles]
      .map((circle) => ({
        ...circle,
        members: [...circle.members].sort((a, b) => a.slot - b.slot),
      }))
      .sort(
        (a, b) =>
          a.blockHeight - b.blockHeight ||
          a.transactionIndex - b.transactionIndex ||
          compareOrdinal(a.txid, b.txid),
      ),
    edges: [...snapshot.edges].sort(
      (a, b) => compareOrdinal(a.toCircle, b.toCircle) || compareOrdinal(a.lineageId, b.lineageId),
    ),
  };
}

export function hashWitnessState(snapshot: WitnessStateSnapshot): string {
  validateWitnessStateSnapshot(snapshot);
  return bytesToHex(
    sha256(utf8Bytes(canonicalizeJson(sortSnapshot(snapshot) as unknown as JsonValue))),
  );
}

export class WitnessStateEngine {
  #snapshot: WitnessStateSnapshot;
  #journal: WitnessStateSnapshot[] = [];
  #journalTxids: string[] = [];

  constructor(snapshot: WitnessStateSnapshot = emptySnapshot()) {
    validateWitnessStateSnapshot(snapshot);
    this.#snapshot = structuredClone(sortSnapshot(snapshot));
  }

  snapshot(): WitnessStateSnapshot {
    return structuredClone(sortSnapshot(this.#snapshot));
  }

  stateHash(): string {
    return hashWitnessState(this.#snapshot);
  }

  apply(event: ConfirmedTransactionEvent): AppliedTransition {
    invariant(
      /^[0-9a-f]{64}$/.test(event.txid),
      "INVALID_STATE",
      "Confirmed event txid must be canonical 32-byte hex",
    );
    assertHex64(event.blockHash, "Confirmed event blockHash");
    assertSafeInteger(event.blockHeight, "Confirmed event blockHeight");
    assertSafeInteger(event.transactionIndex, "Confirmed event transactionIndex");
    const spentKeys = event.spentOutpoints.map((spent, index) => {
      invariant(
        /^[0-9a-f]{64}$/.test(spent.txid) &&
          Number.isSafeInteger(spent.vout) &&
          spent.vout >= 0 &&
          spent.vout <= 0xffff_ffff,
        "INVALID_STATE",
        `Confirmed event spent outpoint ${index} is invalid`,
      );
      return outpointKey(spent);
    });
    invariant(
      new Set(spentKeys).size === spentKeys.length,
      "INVALID_STATE",
      "Confirmed event repeats a spent outpoint",
    );
    if (event.circle !== null) {
      invariant(
        event.circle.txid === event.txid,
        "INVALID_STATE",
        "Event and validated Circle txids differ",
      );
      invariant(
        event.circle.members.length === event.spentOutpoints.length,
        "INVALID_STATE",
        "Circle event must list every spent input",
      );
      invariant(
        event.circle.members.every(
          (member, index) =>
            event.spentOutpoints[index] !== undefined &&
            outpointKey(member.input) === spentKeys[index],
        ),
        "INVALID_STATE",
        "Circle event spent outpoints do not match validated members",
      );
    }
    const lineages = new Map(
      this.#snapshot.lineages.map((lineage) => [lineage.lineageId, lineage]),
    );
    const shards = new Map(this.#snapshot.shards.map((shard) => [shard.outpoint, shard]));
    const activeByOutpoint = new Map(
      this.#snapshot.lineages
        .filter((lineage) => lineage.status === "active" && lineage.currentOutpoint !== null)
        .map((lineage) => [lineage.currentOutpoint as string, lineage]),
    );
    if (
      event.circle === null &&
      !event.spentOutpoints.some((spent) => activeByOutpoint.has(outpointKey(spent)))
    ) {
      return {
        txid: event.txid,
        kind: "unrelated",
        closedLineages: [],
        createdLineages: [],
        continuedLineages: [],
        stateHash: this.stateHash(),
      };
    }
    invariant(
      this.#snapshot.revision < Number.MAX_SAFE_INTEGER,
      "INVALID_STATE",
      "State revision cannot exceed the safe integer range",
    );
    const previousSnapshot = this.snapshot();
    const circles = [...this.#snapshot.circles];
    const edges = [...this.#snapshot.edges];
    const closedLineages: string[] = [];
    const createdLineages: string[] = [];
    const continuedLineages: string[] = [];

    if (event.circle === null) {
      for (const spent of event.spentOutpoints) {
        const key = outpointKey(spent);
        const lineage = activeByOutpoint.get(key);
        if (lineage === undefined) continue;
        const shard = shards.get(key);
        invariant(shard !== undefined, "INVALID_STATE", "Active lineage points to a missing shard");
        shards.set(key, { ...shard, spentByTxid: event.txid, spentHeight: event.blockHeight });
        lineages.set(lineage.lineageId, {
          ...lineage,
          currentOutpoint: null,
          status: "closed",
          lastHeight: event.blockHeight,
          closedByTxid: event.txid,
        });
        closedLineages.push(lineage.lineageId);
      }
    } else {
      const circleMembers: StateCircleMember[] = [];
      const lineagesInCircle = new Set<string>();
      for (const member of event.circle.members) {
        const inputKey = outpointKey(member.input);
        const existing = activeByOutpoint.get(inputKey);
        const lineageId = existing?.lineageId ?? deriveLineageId(member.input);
        invariant(
          !lineagesInCircle.has(lineageId),
          "DUPLICATE_LINEAGE",
          "A lineage cannot appear twice in one Circle",
          { lineageId },
        );
        lineagesInCircle.add(lineageId);
        if (existing !== undefined) {
          const previousShard = shards.get(inputKey);
          invariant(
            previousShard !== undefined,
            "INVALID_STATE",
            "Existing lineage shard is missing",
          );
          invariant(
            previousShard.valueSats === member.inputValue.toString() &&
              previousShard.scriptPubKey === bytesToHex(member.scriptPubKey),
            "INVALID_STATE",
            "Validated Circle prevout disagrees with the current lineage shard",
            { lineageId, outpoint: inputKey },
          );
          shards.set(inputKey, {
            ...previousShard,
            spentByTxid: event.txid,
            spentHeight: event.blockHeight,
          });
          if (previousShard.createdByCircle.length === 64) {
            edges.push({
              fromCircle: previousShard.createdByCircle,
              toCircle: event.txid,
              lineageId,
              viaOutpoint: inputKey,
            });
          }
          continuedLineages.push(lineageId);
        } else {
          invariant(
            !lineages.has(lineageId) && !shards.has(inputKey),
            "INVALID_STATE",
            "Derived fresh lineage or input shard already exists",
            { lineageId },
          );
          createdLineages.push(lineageId);
        }
        const outputKey = outpointKey(member.successor);
        invariant(!shards.has(outputKey), "INVALID_STATE", "Successor shard already exists", {
          outpoint: outputKey,
        });
        shards.set(outputKey, {
          outpoint: outputKey,
          lineageId,
          scriptPubKey: bytesToHex(member.scriptPubKey),
          valueSats: member.successorValue.toString(),
          createdByCircle: event.txid,
          previousOutpoint: inputKey,
          createdHeight: event.blockHeight,
          spentByTxid: null,
          spentHeight: null,
        });
        const nextCircleCount = (existing?.circleCount ?? 0) + 1;
        assertSafeInteger(nextCircleCount, "lineage.circleCount", 1);
        lineages.set(lineageId, {
          lineageId,
          genesisOutpoint: existing?.genesisOutpoint ?? inputKey,
          currentOutpoint: outputKey,
          status: "active",
          firstHeight: existing?.firstHeight ?? event.blockHeight,
          lastHeight: event.blockHeight,
          circleCount: nextCircleCount,
          closedByTxid: null,
        });
        circleMembers.push({
          slot: member.slot,
          lineageId,
          inputOutpoint: inputKey,
          outputOutpoint: outputKey,
          inputValueSats: member.inputValue.toString(),
          outputValueSats: member.successorValue.toString(),
          feeShareSats: member.feeShare.toString(),
          wasExistingLineage: existing !== undefined,
        });
      }
      circles.push({
        txid: event.txid,
        wtxid: event.circle.wtxid,
        contextHash: event.circle.marker.contextHash,
        participantCount: event.circle.marker.participantCount,
        feeSats: event.circle.fee.toString(),
        blockHeight: event.blockHeight,
        blockHash: event.blockHash,
        transactionIndex: event.transactionIndex,
        members: circleMembers,
      });
    }

    const nextSnapshot = sortSnapshot({
      protocol: "witc",
      version: 1,
      revision: this.#snapshot.revision + 1,
      lineages: [...lineages.values()],
      shards: [...shards.values()],
      circles,
      edges,
    });
    const nextStateHash = hashWitnessState(nextSnapshot);
    this.#journal.push(previousSnapshot);
    this.#journalTxids.push(event.txid);
    this.#snapshot = nextSnapshot;
    const kind =
      event.circle !== null ? "circle" : closedLineages.length > 0 ? "ordinary-spend" : "unrelated";
    return {
      txid: event.txid,
      kind,
      closedLineages,
      createdLineages,
      continuedLineages,
      stateHash: nextStateHash,
    };
  }

  rollbackLast(expectedTxid?: string): string {
    const previous = this.#journal.at(-1);
    const txid = this.#journalTxids.at(-1);
    invariant(
      previous !== undefined && txid !== undefined,
      "INVALID_STATE",
      "No transition is available to roll back",
    );
    if (expectedTxid !== undefined) {
      invariant(
        txid === expectedTxid,
        "INVALID_STATE",
        "Rollback txid does not match the journal tip",
        { expectedTxid, actualTxid: txid },
      );
    }
    const previousStateHash = hashWitnessState(previous);
    this.#journal.pop();
    this.#journalTxids.pop();
    this.#snapshot = previous;
    return previousStateHash;
  }
}
