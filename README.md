# Witness Circles

**Documentation site: [bitcoinuniverseio.github.io/witness-circles](https://bitcoinuniverseio.github.io/witness-circles/)**

Witness Circles (`WITC`) is an original Bitcoin Universe protocol for membership records established by mutual witnessing. Two to sixteen independent Taproot output keys authorize one exact Bitcoin transaction. Each participant contributes a confirmed, dedicated native P2TR input, and each gets their Bitcoin back to the same output key minus a deterministic equal share of the miner fee. A 42-byte `OP_RETURN` output commits the participant count and a shared context hash.

A circle's state is derived entirely from confirmed Bitcoin data. There is no server, no registry and no coordinator in the trust path.

The defensible claim is narrow:

> Distinct P2TR output keys jointly authorized this exact Bitcoin transaction.

It does not prove identity, attendance, friendship, intent outside the transaction, or one key per person.

## Status

| Fact | Value |
|---|---|
| Specification version | 1.0.0, protocol version byte `0x01`, single operation `CIRCLE` (`0x01`) |
| Lifecycle | Experimental |
| Chain | Bitcoin |
| Creation enabled on | Signet and regtest only. Planning and marker creation fail closed elsewhere. |
| Parseable networks | mainnet (`0x00`), testnet3 (`0x01`), Signet (`0x02`), regtest (`0x03`) |
| Package | `@bitcoinuniverse/witness-circles` 0.1.0, MIT |
| Marketplace support | None. Witness Circles has no entry in the Bitcoin Universe marketplace protocol registry, and the protocol defines no transferable asset. |
| Wallet support | No wallet integration is verified in Bitcoin Universe code. Requirements are specified in section 13. |
| Indexing | [bitcoinuniverseio/index-witness-circles](https://github.com/bitcoinuniverseio/index-witness-circles), plus the reference state engine here. |

The protocol supports only `CIRCLE`:

- No protocol transfer operation
- No marketplace or transferable asset
- No protocol fee, token, reward, royalty or auction
- No CPFP workflow
- No rekey or refuel operation
- No script-path spending, annex or partial sighash

## Key numbers

- Participants per Circle: 2 to 16 inclusive
- Marker script: exactly 42 bytes, `6a28` followed by a 40-byte payload
- Minimum successor output: 1,000 sats
- Weight: `246 + 402N` for 64-byte signatures, virtual bytes `ceil(weight / 4)`
- Fee allocation: `q = floor(F / N)`, and the first `F mod N` slots each pay one extra satoshi
- Lineage id: `SHA256(UTF8("WITC/lineage/v1") || wire_serialized_genesis_outpoint)`
- Authoritative at one confirmation. Six confirmations is a display convention only.
- Empty state hash: `90e749b7720fac379610d979e29998c7d650150548622f0a47d9d3e181f1be52`

## Install

```sh
npm install @bitcoinuniverse/witness-circles
```

Until a reviewed package release exists, install from a verified local checkout and compare its commit and package digest.

## SDK example

```ts
import {
  WitnessCirclesSdk,
  hexToBytes,
  type CirclePlanRequest
} from "@bitcoinuniverse/witness-circles";

const sdk = new WitnessCirclesSdk();

const request: CirclePlanRequest = {
  network: "signet",
  manifest: {
    protocol: "witc",
    version: 1,
    kind: "circle",
    nonce: "90e8f5cf27f04c89a6657bc9c60e3021",
    title: "Signet builders circle",
    created: "2026-08-01T18:00:00Z",
    expires: "2026-08-01T19:00:00Z"
  },
  participants: [
    {
      txid: "11".repeat(32),
      vout: 0,
      value: 30_000n,
      scriptPubKey: hexToBytes(`5120${"22".repeat(32)}`),
      blockHeight: 250,
      maximumFeeShare: 2_000n
    },
    {
      txid: "33".repeat(32),
      vout: 1,
      value: 40_000n,
      scriptPubKey: hexToBytes(`5120${"44".repeat(32)}`),
      blockHeight: 250,
      maximumFeeShare: 2_000n
    }
  ],
  feeRateSatsPerVbyte: 5n
};

const plan = sdk.createPlan(request);
console.log(plan.unsignedTransactionHex, plan.totalFee);
```

Wallets must independently validate the frozen unsigned transaction before signing. Building a plan does not prove that inputs are unspent, that keys are controlled by distinct people, or that a transaction will relay.

## CLI

```sh
npm run build
node dist/cli.js manifest hash examples/context-manifest.json
node dist/cli.js marker decode 6a28...
node dist/cli.js vectors verify
```

Run `node dist/cli.js help` for complete usage.

## Repository map

| Path | Purpose |
|---|---|
| `SPECIFICATION.md` | Normative protocol rules |
| `src/` | Reference codec, parser, validator, state engine, planner, SDK and CLI |
| [`schemas/v1/`](schemas/v1/) | Seven JSON Schemas for metadata, interchange and state |
| [`test-vectors/v1/`](test-vectors/v1/) | Golden signed transaction, marker cases and full state-lifecycle fixtures |
| `tests/` | Unit, property, schema, signature, validator, state and site tests |
| `docs/` | User, creator, developer, operator and legal-review material |
| `assets/`, `*.html` | The published documentation site, served by GitHub Pages from `main` at the repository root |
| `ops/` | Static-site deployment and security-header configuration |

## Documentation site

The site is hand-authored static HTML, CSS and vanilla JavaScript with no build step, no framework, no external fonts and no trackers. It is served by GitHub Pages from `main` at the repository root.

| Page | Contents |
|---|---|
| [Overview](https://bitcoinuniverseio.github.io/witness-circles/) | What the protocol is, what a Circle proves, current status |
| [Specification](https://bitcoinuniverseio.github.io/witness-circles/specification.html) | The normative rules with the full error code table |
| [Guide](https://bitcoinuniverseio.github.io/witness-circles/guide.html) | Three worked examples taken from the committed vectors |
| [Reference](https://bitcoinuniverseio.github.io/witness-circles/reference.html) | Terminology, indexer semantics, sizing, limits, security, checklist |
| [Test vectors](https://bitcoinuniverseio.github.io/witness-circles/test-vectors.html) | Every valid and invalid case with its required outcome |
| [Schemas](https://bitcoinuniverseio.github.io/witness-circles/schemas.html) | All seven published JSON Schemas |
| [Simulator](https://bitcoinuniverseio.github.io/witness-circles/simulator.html) | Client-side circle builder, marker decoder and vector replay |
| [Conformance](https://bitcoinuniverseio.github.io/witness-circles/conformance.html) | What a second implementation has to reproduce |

`assets/witc.js` is a dependency-free browser reimplementation of the marker decoder, transaction codec, validator, fee allocator, lineage derivation and state engine. It reproduces every published vector, and `tests/site.test.ts` asserts that in CI. It checks witness shape only and never verifies Schnorr signatures, so it is not sufficient for authoritative indexing.

## Verification

```sh
npm ci
npm run verify
npm audit
```

`npm run verify` runs formatting and lint checks, strict type checking, tests, the build, content and link checks, and both transaction and state-lifecycle vector verification.

## Independence

Protocol correctness is derived from Bitcoin transaction data and confirmed prevouts. No Bitcoin Universe API, profile, manifest host, renderer or commercial service is required. Optional metadata may disappear without changing protocol validity.

## Security

Read [SECURITY.md](SECURITY.md) before handling real funds. Report vulnerabilities through the private process described there. Do not open public issues for unpatched fund-loss findings.

## Licensing

Code is available under the MIT License. The normative specification and test vectors are dedicated under CC0 1.0 to encourage independent compatible implementations. See [LICENSE](LICENSE) and [LICENSE-SPEC](LICENSE-SPEC).
