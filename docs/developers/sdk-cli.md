# SDK and CLI Reference

## Public API

The package root exports constants, types, codec utilities, parser and validator functions, the state engine, and `WitnessCirclesSdk`.

Primary APIs:

- `canonicalizeContextManifest(value)` and `contextHash(value)`
- `encodeMarkerPayload(input)`, `encodeMarkerScript(input)`, and `decodeMarkerScript(script)`
- `decodeTransaction(raw)`, `encodeTransaction(tx)`, `transactionId(tx)`, and `witnessTransactionId(tx)`
- `taprootKeyPathSighash(tx, index, prevouts)` and `verifyTaprootKeyPathSignature(...)`
- `validateCircle(tx, context)` and `safeValidateCircle(tx, context)`
- `estimateCircleVsize(N)` and `allocateEqualFeeShares(fee, N)`
- `buildCirclePlan(request)` and `toCirclePsbtPlan(plan)`
- `inspectUnsignedSigningIntent(unsignedHex, context, policy)`
- `deriveLineageId(outpoint)`, `WitnessStateEngine.apply(event)`, and `rollbackLast(txid)`
- `verifyGoldenCircleVector(vector)`

All satoshi values are `bigint` in TypeScript and decimal strings in JSON interchange. Scripts and hashes are `Uint8Array` internally and lowercase hex in JSON.

## Validation modes

- `verify`: confirmed or fully signed transactions; checks witness shape and Schnorr signatures.
- `shape`: checks required witness shape without cryptographic verification. Use only for narrow diagnostic tooling, not authoritative indexing.
- `unsigned`: requires empty witnesses for a frozen pre-signing transaction.

The default is `verify`.

## CLI

```text
witc manifest hash <manifest.json>
witc marker encode --network signet --participants 3 --context-hash <hex>
witc marker decode <script-hex>
witc tx decode <raw-transaction-hex>
witc plan <request.json>
witc validate --tx <file> --prevouts <file> --height 200 --network signet
witc validate --tx <file> --prevouts <file> --height 200 --network signet --unsigned

Circle planning and marker creation accept only `signet` or `regtest`. Validation can inspect all assigned network identifiers so independent tools can classify data without enabling creation or broadcast.
witc vectors verify [golden-circle.json]
```

CLI output is JSON except help text. Errors include stable protocol codes and human-readable detail. Exit status is nonzero on failure.

## Browser use

Core library hashing and Schnorr verification use portable noble packages. The CLI alone imports Node file APIs. Bundlers should import the package root, not `dist/cli.js`.
