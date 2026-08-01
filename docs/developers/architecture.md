# Developer Architecture

## Trust boundaries

```text
Bitcoin Core
  -> strict transaction parser
  -> WITC validator plus confirmed prevouts
  -> deterministic lineage state engine
  -> independently reproducible read models

Optional coordinator
  -> invitations and immutable PSBT contributions

Optional metadata service
  -> untrusted manifest retrieval and sanitized presentation
```

No coordinator or metadata service participates in protocol validity.

## Package modules

| Module | Responsibility |
|---|---|
| `transaction.ts` | Strict wire codec, IDs, vsize, outpoint order, P2TR recognition |
| `marker.ts` | Exact `WITC` payload and script encoding |
| `manifest.ts` and `jcs.ts` | Manifest validation, RFC 8785 serialization, SHA-256 commitment |
| `taproot.ts` | BIP341 key-path sighash and BIP340 verification |
| `validator.ts` | Structural, fee, witness, prevout, network, and signature rules |
| `planner.ts` | Canonical unsigned transaction and signer-minimized PSBT planning data |
| `sdk.ts` | Application facade and wallet signing-intent summary |
| `state.ts` | Reference lineage, shard, Circle, edge, closure, and rollback model |
| `vectors.ts` | Golden fixture verification |

## Indexer interpretation

An indexer scans output 0 for the exact candidate namespace, loads every confirmed prevout, and validates without metadata. Invalid candidates are recorded for diagnosis but do not mutate protocol state. Any transaction that spends an active shard and is not a valid Circle closes the lineage.

Mempool projections use separate tables or namespaces. They are removed or replaced without editing confirmed state. Confirmed blocks apply in transaction order inside one database transaction. Reorganizations use persisted undo data.

## Concurrency

One writer should own a chain partition and acquire a database advisory lock for canonical state. Read replicas can serve immutable block-height projections. Jobs are idempotent by block hash, txid, and parser version. Cache keys include network, canonical tip, parser version, and query parameters.

## Parser upgrades

Never change historical meaning silently. Replay a parser version into shadow tables, compare checksums, publish differences, and cut over only under the documented policy. Unknown protocol versions remain uninterpreted.
