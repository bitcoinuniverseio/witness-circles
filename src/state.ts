import { bytesToHex, utf8Bytes } from "./bytes.js";
import { LINEAGE_DOMAIN } from "./constants.js";
import { invariant } from "./errors.js";
import { sha256 } from "./hash.js";
import { canonicalizeJson, type JsonValue } from "./jcs.js";
import { normalizeTxid, type OutPoint, outpointKey, serializeOutpoint } from "./transaction.js";
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

function sortSnapshot(snapshot: WitnessStateSnapshot): WitnessStateSnapshot {
  return {
    ...snapshot,
    lineages: [...snapshot.lineages].sort((a, b) => a.lineageId.localeCompare(b.lineageId)),
    shards: [...snapshot.shards].sort((a, b) => a.outpoint.localeCompare(b.outpoint)),
    circles: [...snapshot.circles].sort(
      (a, b) =>
        a.blockHeight - b.blockHeight ||
        a.transactionIndex - b.transactionIndex ||
        a.txid.localeCompare(b.txid),
    ),
    edges: [...snapshot.edges].sort(
      (a, b) => a.toCircle.localeCompare(b.toCircle) || a.lineageId.localeCompare(b.lineageId),
    ),
  };
}

export function hashWitnessState(snapshot: WitnessStateSnapshot): string {
  return bytesToHex(
    sha256(utf8Bytes(canonicalizeJson(sortSnapshot(snapshot) as unknown as JsonValue))),
  );
}

export class WitnessStateEngine {
  #snapshot: WitnessStateSnapshot;
  #journal: WitnessStateSnapshot[] = [];
  #journalTxids: string[] = [];

  constructor(snapshot: WitnessStateSnapshot = emptySnapshot()) {
    invariant(
      snapshot.protocol === "witc" && snapshot.version === 1,
      "INVALID_STATE",
      "Unsupported state snapshot",
    );
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
      normalizeTxid(event.txid) === event.txid.toLowerCase(),
      "INVALID_STATE",
      "Confirmed event txid must be canonical 32-byte hex",
    );
    invariant(
      event.blockHeight >= 0 && event.transactionIndex >= 0,
      "INVALID_STATE",
      "Confirmed event position is invalid",
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
            outpointKey(member.input) === outpointKey(event.spentOutpoints[index]),
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
    this.#journal.push(this.snapshot());
    this.#journalTxids.push(event.txid);
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
            !lineages.has(lineageId),
            "INVALID_STATE",
            "Derived fresh lineage already exists",
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
        lineages.set(lineageId, {
          lineageId,
          genesisOutpoint: existing?.genesisOutpoint ?? inputKey,
          currentOutpoint: outputKey,
          status: "active",
          firstHeight: existing?.firstHeight ?? event.blockHeight,
          lastHeight: event.blockHeight,
          circleCount: (existing?.circleCount ?? 0) + 1,
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

    this.#snapshot = sortSnapshot({
      protocol: "witc",
      version: 1,
      revision: this.#snapshot.revision + 1,
      lineages: [...lineages.values()],
      shards: [...shards.values()],
      circles,
      edges,
    });
    const kind =
      event.circle !== null ? "circle" : closedLineages.length > 0 ? "ordinary-spend" : "unrelated";
    return {
      txid: event.txid,
      kind,
      closedLineages,
      createdLineages,
      continuedLineages,
      stateHash: this.stateHash(),
    };
  }

  rollbackLast(expectedTxid?: string): string {
    const previous = this.#journal.pop();
    const txid = this.#journalTxids.pop();
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
    this.#snapshot = previous;
    return this.stateHash();
  }
}
