# Witness Circles

Witness Circles is an experimental Bitcoin protocol for creating one exact, jointly authorized transaction across 2 to 16 independent Taproot output keys.

Each participant contributes a confirmed, dedicated native P2TR input. A valid Circle returns each participant's Bitcoin to the same output key minus a deterministic equal fee share and commits to a shared context hash in a 42-byte `OP_RETURN` output.

The defensible protocol claim is narrow:

> Distinct P2TR output keys jointly authorized this exact Bitcoin transaction.

It does not prove identity, attendance, friendship, intent outside the transaction, or one key per person.

## Status

Version 1 is experimental. The reference implementation is suitable for parser interoperability, wallet safety review, regtest, and Signet testing. Planning and marker creation fail closed outside Signet and regtest. Mainnet and testnet3 identifiers remain parseable for read-only interoperability only.

Public source repository: [github.com/bitcoinuniverse/witness-circles](https://github.com/bitcoinuniverse/witness-circles)

Version 1 supports only `CIRCLE`:

- No protocol transfer operation
- No marketplace or transferable asset
- No protocol fee, token, reward, royalty, or auction
- No CPFP workflow
- No rekey or refuel operation
- No script-path spending, annex, or partial sighash

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
| `SPECIFICATION.md` | Normative v1 protocol rules |
| `src/` | Reference codec, parser, validator, state engine, planner, SDK, and CLI |
| `schemas/v1/` | Versioned JSON schemas for optional metadata and interchange |
| `test-vectors/v1/` | Golden signed transaction, marker, and full state-lifecycle fixtures |
| `tests/` | Unit, property, schema, signature, validator, and state tests |
| `docs/` | User, creator, developer, operator, commercial, launch, and legal-review material |
| `site/` | Static commercial and documentation website |
| `ops/` | Static-site deployment and security-header configuration |

## Verification

```sh
npm ci
npm run verify
npm audit
```

`npm run verify` runs formatting/lint checks, strict type checking, tests, the build, content/link checks, and both transaction and state-lifecycle vector verification.

## Independence

Protocol correctness is derived from Bitcoin transaction data and confirmed prevouts. No Bitcoin Universe API, profile, manifest host, renderer, or commercial service is required. Optional metadata may disappear without changing protocol validity.

## Security

Read [SECURITY.md](SECURITY.md) before handling real funds. Report vulnerabilities through the private process described there. Do not open public issues for unpatched fund-loss findings.

## Licensing

Code is available under the MIT License. The normative specification and test vectors are dedicated under CC0 1.0 to encourage independent compatible implementations. See [LICENSE](LICENSE) and [LICENSE-SPEC](LICENSE-SPEC).
