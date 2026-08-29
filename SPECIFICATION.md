# Witness Circles Protocol Specification

Version: 1.0.0

Protocol magic: `WITC`

Operation: `CIRCLE` (`0x01`)
Status: final

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY, and OPTIONAL are interpreted as described by RFC 2119 and RFC 8174 when written in uppercase.

## 1. Claim boundary

A valid Circle establishes only that distinct native P2TR output keys authorized the exact transaction under Bitcoin's Taproot key-path signature rules.

A compliant application MUST NOT present a Circle as proof of:

- Human identity or personhood
- Attendance or physical presence
- Friendship, membership, endorsement, or legal agreement
- One key per person
- Ownership before or after any period not established by the indexed UTXO history

## 2. Layers

1. Bitcoin consensus determines whether the transaction and its inputs are valid in the best chain.
2. Relay and miner policy determine whether an unconfirmed transaction propagates or is mined.
3. This specification identifies and validates WITC events from Bitcoin data.
4. Optional context manifests describe a Circle but never affect its Bitcoin validity after their hash is committed.
5. Profiles, aliases, renderers, invitations, notifications, moderation, and analytics are application services, not protocol truth.

## 3. Network identifiers

| Byte | Network |
|---:|---|
| `0x00` | Bitcoin mainnet |
| `0x01` | Bitcoin testnet3 |
| `0x02` | Bitcoin Signet |
| `0x03` | Bitcoin regtest |

Other values are invalid for the protocol. The marker network MUST match the chain being indexed.

## 4. Marker

Output index 0 MUST have value zero and this exact script:

```text
OP_RETURN PUSH40 <40-byte payload>
```

The byte serialization is:

```text
6a 28 <payload>
```

`PUSHDATA1`, larger pushes, extra opcodes, trailing bytes, alternate magic casing, and zero-valued context hashes are invalid.

| Payload offset | Size | Field |
|---:|---:|---|
| 0 | 4 | ASCII `WITC` |
| 4 | 1 | Version `0x01` |
| 5 | 1 | Network identifier |
| 6 | 1 | Operation `0x01` |
| 7 | 1 | Participant count `N` |
| 8 | 32 | SHA-256 context-manifest hash |

`N` MUST be 2 through 16 inclusive. Only operation `0x01 CIRCLE` is valid in the protocol. Reserved values, including potential refuel or rekey operations, MUST be rejected rather than guessed.

## 5. Context manifest

The context manifest is JSON authoritativeized with RFC 8785 JSON Authoritativeization Scheme and hashed as:

```text
context_hash = SHA256(UTF8(JCS(manifest)))
```

Required fields are `protocol`, `version`, `kind`, `nonce`, `title`, `created`, and `expires`. The [context-manifest schema](schemas/v1/context-manifest.schema.json) defines their structure.

`expires` applies to the invitation only. It does not expire a confirmed Circle. Unknown manifest fields are rejected by the reference validator. A manifest MAY remain private or disappear. Its absence MUST NOT invalidate a matching on-chain Circle.

Aliases are untrusted labels. Applications MUST escape them and MUST NOT interpret them as identities.

Schema string limits count Unicode code points, matching JSON Schema 2020-12. Every string MUST contain well-formed Unicode without unpaired surrogates. It MUST be unchanged by the ECMAScript `TrimString` operation used by `String.prototype.trim`, so leading or trailing ECMAScript whitespace is invalid. RFC 8785 preserves string code points without Unicode normalization. `created` and `expires` MUST be real RFC 3339 UTC timestamps ending in `Z`, and `expires` MUST be later than `created`. Alias keys MUST be 32 bytes of lowercase hex and MUST be unique within the manifest. These semantic rules are enforced by the reference validator in addition to the published structural schema.

## 6. Authoritative transaction grammar

A valid Circle MUST satisfy every rule:

1. `nVersion` is 2.
2. `nLockTime` is 0.
3. Every input `nSequence` is `0xfffffffd`.
4. There are exactly `N` inputs and `N + 1` outputs.
5. Every input prevout is confirmed in a lower block height than the Circle transaction.
6. Every input prevout is a native P2TR output with script `OP_1 PUSH32 <output-key>`.
7. Every input outpoint is unique.
8. Every input scriptPubKey is unique within the Circle.
9. Inputs are strictly ordered by their 32-byte lowercase display txid bytes, then by unsigned numeric `vout`.
10. Output 0 is the exact marker described above.
11. Output `i + 1` has the exact scriptPubKey of input `i`.
12. Output `i + 1` is at least 1,000 sats.
13. No other output exists.
14. Every input uses native Taproot key-path witness data with exactly one stack item.
15. The witness item is either a 64-byte BIP340 signature using `SIGHASH_DEFAULT` or a 65-byte signature whose final byte is exactly `SIGHASH_ALL` (`0x01`).
16. Script-path witnesses, annexes, `ANYONECANPAY`, `NONE`, `SINGLE`, empty witnesses, and other sighash bytes are invalid for a confirmed Circle.
17. Every signature MUST verify against the P2TR output key and BIP341 key-path message for its input.

The same script successor preserves key continuity. It does not create a covenant. The controller can spend the successor in any consensus-valid transaction.

## 7. Fees

Let:

```text
F = sum(input_values) - sum(outputs_1_through_N)
q = floor(F / N)
r = F mod N
```

For zero-based sorted slot `i`:

```text
fee_share(i) = q + 1 when i < r, otherwise q
successor_value(i) = input_value(i) - fee_share(i)
```

The output values MUST match this calculation exactly. The protocol defines no maximum fee. Wallets MUST enforce signer-selected absolute and fee-rate caps before signing.

For 64-byte default signatures:

```text
weight = 246 + 402N
vbytes = ceil((246 + 402N) / 4)
```

Explicit `SIGHASH_ALL` adds one witness byte per such input.

## 8. Lineages and shards

For a valid Circle input that is not the current shard of an existing lineage:

```text
lineage_id = SHA256(
  UTF8("WITC/lineage/v1") || wire_serialized_genesis_outpoint
)
```

The outpoint uses Bitcoin wire form: reversed display txid bytes followed by four-byte little-endian `vout`.

Each Circle creates one successor shard for each lineage. A valid later Circle can spend a current shard and create its next same-script successor. Multiple lineages participate together but never merge ownership or value.

A consensus-valid transaction that spends an active shard without satisfying every Circle rule closes that lineage. The Bitcoin is not burned by the protocol. Historical Circles remain part of the best-chain record.

The final protocol has no transfer, split, merge, rekey, refuel, mint, market, burn, reward, governance, or administrative operation.

## 9. Confirmation and mempool

Mempool observations are provisional and node-local. An indexer MAY expose pending valid candidates, conflicts, replacements, and eviction, but MUST keep these projections separate from confirmed authoritative state.

A Circle becomes authoritative at one confirmation in the best chain. Applications MAY label six confirmations as settled display state, but this is not an additional protocol transition.

The transaction signals opt-in RBF. Any replacement needs new signatures from every participant because signatures commit to all inputs and outputs. A compliant product MUST NOT promise CPFP, cancellation after broadcast, or successful relay.

## 10. Reorganizations

An indexer MUST store block hashes and sufficient undo information. When the indexed tip no longer matches Bitcoin Core, it MUST reverse confirmed transitions in reverse transaction order until the common ancestor, then ingest the new branch in authoritative transaction order.

Invalid candidate fields MUST NOT apply a Circle transition. A confirmed transaction that spends an active shard but is not a valid Circle still closes that lineage as an ordinary spend. This includes a transaction that ceases to be a valid Circle after parser correction under the parser version selected for replay.

## 11. Determinism and errors

CompactSize integers MUST be minimally encoded. Numeric calculations MUST use checked integer arithmetic. Transaction values MUST not exceed Bitcoin `MAX_MONEY`.

Independent implementations MUST reproduce the [committed test vectors](test-vectors/v1/). Error strings may differ, but the published error codes and valid or invalid result must agree.

The authoritative confirmed-state snapshot is the exact object defined by the [state-snapshot schema](schemas/v1/state-snapshot.schema.json). `revision` starts at zero and increments once for each confirmed transaction that either applies a valid Circle or closes at least one active lineage through an ordinary spend. It does not increment for unrelated transactions or invalid candidates that close no active lineage. Rollback restores the prior revision.

Every JSON numeric field in the snapshot MUST be a nonnegative ECMAScript safe integer, except `circleCount`, which MUST also be at least one. Every display outpoint MUST use lowercase txid hex and a authoritative decimal `vout` from 0 through 4294967295. Every satoshi string MUST be authoritative unsigned decimal from zero through Bitcoin `MAX_MONEY`.

Before hashing, implementations MUST order lowercase ASCII fields as follows:

- `lineages` by `lineageId`.
- `shards` by the complete display outpoint string, using ordinal byte order.
- `circles` by `blockHeight`, then `transactionIndex`, then `txid`.
- Each Circle's `members` by numeric `slot`.
- `edges` by `toCircle`, then `lineageId`.

No implementation-specific database fields may enter this snapshot. The authoritative state hash is `SHA256(UTF8(RFC8785(snapshot)))`, with no prefix or trailing newline. The empty-state hash is `90e749b7720fac379610d979e29998c7d650150548622f0a47d9d3e181f1be52`. The golden transaction vector commits the first-transition state hash and block envelope. The state-lifecycle vector then commits a continuation, an ordinary-spend closure, and each reverse rollback root so independent indexers can reproduce the complete lifecycle exactly.

## 12. Upgrade policy

New protocol behavior requires a new version byte, a specification, threat model, schemas, cross-language vectors, activation policy, and independent implementation review. Implementations MUST NOT reinterpret finalized protocol history under a later version.

Unknown versions and operations MAY be retained as uninterpreted candidates but MUST NOT apply their version-specific transitions to authoritative state. If such a transaction spends an active shard, the lineage still closes under the ordinary-spend rule in section 8.

## 13. Wallet requirements

Before signing, a wallet MUST independently verify every rule in section 6 plus:

- The owned outpoint appears exactly once.
- The displayed context authoritativeizes to the marker hash.
- The owned successor and exact fee share are visible.
- Total fee and fee rate are within user-approved caps.
- No global xpub, peer derivation path, or unnecessary proprietary PSBT field is disclosed.
- The frozen unsigned transaction matches the invitation fingerprint.

The signer-specific PSBT SHOULD contain `witness_utxo` for every input. Only the owner's input SHOULD include its Taproot key origin data. Contributions SHOULD return non-finalized `PSBT_IN_TAP_KEY_SIG`; the coordinator MUST verify each contribution before merge.

## 14. Reference status

This repository is a reference implementation, not Bitcoin consensus software. Bitcoin Core remains authoritative for Bitcoin validity and local policy acceptance. Applications SHOULD call `testmempoolaccept` immediately before broadcast.
