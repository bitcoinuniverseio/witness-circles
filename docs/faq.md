# Frequently Asked Questions

## Is a Circle an NFT or token?

No. It creates no transferable protocol asset, token balance, royalty, floor price, or marketplace entitlement.

## Does it prove everyone attended an event?

No. It proves that the listed output keys authorized one exact transaction. Keys can be remote, shared, automated, sold, or controlled by the same party.

## Can the coordinator steal my Bitcoin?

A malicious coordinator can stall or censor. It cannot redirect a correctly validated signature because every permitted sighash commits to all inputs and outputs. A wallet that skips validation can still lose funds.

## Why return to the same key?

Exact script reuse makes continuation deterministic for independent indexers. It also creates explicit public linkage. This is a deliberate tradeoff, not a privacy feature.

## Can I transfer a lineage?

The final protocol has no transfer operation. An ordinary spend remains valid Bitcoin but closes the lineage.

## Can I sell a Circle or shard?

There is no protocol market or safe listing operation. People can sell keys outside the protocol, which is risky and does not create an authoritative ownership claim.

## Where is the description stored?

Only a 32-byte hash is in the transaction. The authoritative manifest can be private, self-hosted, or mirrored. Losing it does not invalidate the transaction, but its human description may become unavailable.

## Why no CPFP?

The final protocol has no shared anchor and requires confirmed inputs for new Circles. Coordinated RBF is the supported fee-bump model. CPFP may be researched separately but is not implied.

## Is mainnet supported?

The transaction grammar uses current Bitcoin primitives. The final protocol and wallet stack are not designated for unrestricted mainnet creation.

## What happens during a reorganization?

Indexers reverse affected state to the common ancestor and replay the new best chain. Pending or previously confirmed status can change.

## Does Bitcoin Universe control the protocol?

No proprietary API is needed for correctness. Anyone can verify the marker, prevouts, signatures, fees, and lineage rules from Bitcoin data. Bitcoin Universe can provide optional coordination and presentation services.
