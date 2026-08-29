# Integration Guide

## Wallets

1. Discover confirmed native P2TR inputs without protocol assets or unrelated metadata.
2. Protect active shards from automatic selection.
3. Accept an invitation capability bound to session, slot, outpoint, context hash, and fee caps.
4. Rebuild or decode the unsigned transaction locally.
5. Call `inspectUnsignedSigningIntent` and display its complete result.
6. Attach `witness_utxo` for every PSBT input.
7. Reveal derivation data only for the owner's input and successor.
8. Return non-finalized `PSBT_IN_TAP_KEY_SIG`.
9. Track unanimous RBF and explicit ordinary lineage closure.

Watch-only wallets can inspect, export, and monitor but cannot join. External wallets that auto-finalize or hide outputs are unsupported until tested.

## Indexers

Use Bitcoin Core blocks and prevouts as the only authoritative input. Store blocks, raw transactions, invalid candidates, Circles, members, lineages, shards, edges, conflicts, replacements, reorganizations, checkpoints, parser versions, and state hashes.

Never accept frontend-provided validity or optional manifest fields as state. Verify the golden vector at startup and expose the parser version in status responses.

## Explorers

Every detail page should show raw marker bytes, decoded fields, input and successor mapping, fee shares, confirmation position, lineage edges, reorganization status, parser version, and a link to raw Bitcoin data. Clearly label optional manifest and profile data.

Graph traversal must be bounded and paginated. Provide text alternatives for constellation visuals.

## Data platforms and exchanges

WITC creates no balance, asset, supply, price, transfer, deposit, or market. Useful data products include protocol transaction decoding, lineage status, fee statistics, activity concentration, invalid-event inspection, and parser-state verification.

Do not treat active shards as exchange deposit identifiers or listable assets.

## Marketplaces

There is no marketplace integration. A safe platform should exclude active shards from listings and transaction builders. A read-only gallery may render confirmed Circles without prices or ownership claims.

## Coordinators

Recommended states are `INVITING`, `FROZEN`, `SIGNING`, `COMPLETE`, `BROADCAST`, `CONFIRMED`, `EXPIRED`, `CANCELLED`, and `REPLACED`.

Use per-participant expiring capabilities, immutable unsigned-transaction fingerprints, idempotent signature merge, bounded storage, rate limits, and direct Schnorr verification. A coordinator must never store a private key or seed phrase.
