# Launch Kit

## Approved headline

**Witness Circles: sign one Bitcoin moment together**

## Launch announcement

Witness Circles is an open experimental protocol for creating one exact Bitcoin transaction across independent Taproot keys. Every participant sees the complete transaction, receives their dedicated Bitcoin input back to the same key minus an equal miner-fee share, and contributes to a public lineage graph.

The first release includes the draft specification, reference TypeScript SDK, strict parser and validator, signed golden vector, CLI, state engine, schemas, security model, and independent verification tools. Version 1 creates no token, market, reward, royalty, or identity claim.

The initial program is for regtest and Signet interoperability. Mainnet creation remains disabled while wallet display, public-linkage comprehension, independent indexer agreement, and security gates are tested.

## Technical announcement

Lead with exact marker bytes, input/output grammar, BIP341 verification, deterministic fee shares, lineage derivation, golden txid, and commands to reproduce the vector. Invite independent implementations and disclose every known limitation.

## GitHub announcement

Ask developers to run `npm ci && npm run verify`, reproduce `test-vectors/v1/golden-circle.json`, and submit parser-result attestations. Do not call a local-only or unavailable remote public.

## Creator announcement

Invite a small number of transparent Signet events around real collaborative releases. Provide a context template, fee examples, privacy copy, and accessible renderer guidelines.

## Short posts

1. "What if the shared moment was the Bitcoin transaction itself? Witness Circles v1 is open for regtest and Signet interoperability testing. No token. No market. Exact coauthorization."
2. "Three rules users should remember: dedicated input, equal fee share, permanent public linkage. A Circle proves a transaction signature, not a human identity."
3. "Builders: reproduce the signed golden vector, compare txid and lineage IDs, and tell us where the specification is ambiguous."

## Demo script

1. Explain the result in one sentence.
2. Show three dedicated inputs and their exact returns.
3. Freeze the session and inspect the context hash.
4. Show each signer reviewing the same outputs.
5. Verify the golden signature and txid.
6. Confirm on regtest or Signet.
7. Reveal the accessible constellation and raw transaction proof.
8. End with limitations and current launch gates.

## Community event

Run a Signet parser interop day. Teams implement the marker and transaction validator independently, publish state hashes, test malformed vectors, and compare results. Participation has no financial reward or permanent status penalty.

## Support macros

- **Fee changed:** "Do not sign. A changed fee requires a newly frozen transaction within every participant's cap."
- **Input exposed:** "A Circle intentionally creates public linkage. Do not join with an input connected to unrelated funds or activity."
- **Signature rejected:** "The contribution does not authorize the frozen transaction. Recheck network, prevouts, sighash, and fingerprint. Never send us a private key."
- **Metadata missing:** "The Circle remains verifiable. Restore the exact canonical manifest from a trusted copy and compare its SHA-256 hash."
