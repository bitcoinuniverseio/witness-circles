# User Guide

## What Witness Circles is

A Circle is one Bitcoin transaction signed by 2 to 16 independent Taproot output keys. Each participant contributes a dedicated Bitcoin input and receives the value back to the same key minus an equal fee share. The transaction commits to a shared description hash, and an explorer can draw its participant lineages as a constellation.

It proves exact transaction authorization. It does not prove who held a key, where they were, or why they signed.

## Before starting

You need:

- A wallet that explicitly supports Witness Circles
- A confirmed native Taproot UTXO dedicated to the Circle
- Enough value for the successor to remain at least 1,000 sats after fees
- A fee cap you are comfortable paying
- An understanding that the input will be publicly linked with every other participant input

Do not use an input that also reveals unrelated savings, inscriptions, tokens, marketplace inventory, or private payment history. A compliant Universe integration should classify and protect inputs, but you remain responsible for the keys and transaction.

## Your first Circle

1. Open a verified invitation.
2. Read the title and optional description.
3. Confirm the invitation network and expiry.
4. Select or create a dedicated confirmed P2TR input.
5. Set an absolute fee-share cap and fee-rate cap.
6. Join the participant slot with your outpoint and successor key information.
7. Wait for the host to freeze the session.
8. Review every input, every output, the context hash, your return amount, and exact fee share.
9. Confirm the public-linkage warning.
10. Sign only if the wallet reports `CIRCLE`, safe sighash, exact same-key successor, and no extra output.
11. Submit the non-finalized Taproot signature contribution.
12. Follow pending, replacement, confirmation, and reorganization state.

No funds are locked on-chain before broadcast. A coordinator can waste time but cannot redirect funds if your wallet validates the complete transaction correctly.

## Fees

Participants share the transaction fee equally after canonical input sorting. When the total fee does not divide evenly, the first sorted slots pay one extra sat until the remainder is exhausted.

Typical signed sizes are:

| Participants | Virtual bytes |
|---:|---:|
| 2 | 263 |
| 4 | 464 |
| 8 | 866 |
| 16 | 1,670 |

At 10 sat/vB, an eight-person Circle costs 8,660 sats, about 1,083 sats each. Your wallet must show the actual calculation. Wait when fees exceed your cap. An honest product never pressures you to sign during a fee spike.

## Pending and confirmation

- **Inviting:** participants can still join or leave.
- **Frozen:** the unsigned transaction and context hash cannot change.
- **Signing:** signatures are being collected.
- **Complete:** all signatures verify locally.
- **Broadcast:** the coordinator submitted the transaction to a Bitcoin node.
- **Pending:** one node observes it in its mempool; this is not final.
- **Replaced:** every signer authorized a different replacement transaction.
- **Confirmed:** included in the best chain.
- **Settled display:** six confirmations, an application convention only.
- **Reorganized:** the confirming block left the best chain and state was rolled back.

RBF requires everyone to sign again. Version 1 does not offer CPFP. Cancellation after broadcast is not reliable.

## Continuing or closing a lineage

A confirmed Circle creates a successor shard controlled by the same Taproot key. Joining another Circle with that shard continues the lineage.

Spending a shard in an ordinary transaction closes its lineage. The Bitcoin remains spendable, but future Circles cannot extend that historical path. A compliant wallet protects shards from automatic coin selection and asks for explicit closure confirmation.

Version 1 has no protocol transfer or rekey. Moving control to another key closes the old lineage and can begin a new one later.

## Recovery

- Export the shard outpoint, scriptPubKey, derivation information, and wallet backup through a secure wallet workflow.
- Never send a seed phrase or private key to a coordinator, explorer, manifest host, or support agent.
- If the application disappears, use a compatible wallet to spend the P2TR shard normally.
- If the key is lost, Witness Circles cannot recover it.
- If an indexer is wrong, compare the raw transaction and prevouts with Bitcoin Core and a second independent parser.
- If metadata disappears, retain the original canonical manifest locally. Its hash can still be checked against the transaction.

## Common errors

| Error | Meaning | Safe response |
|---|---|---|
| `INPUT_UNCONFIRMED` | An input is not in an earlier block | Wait for confirmation and rebuild |
| `INPUT_ORDER` | Inputs are not canonically sorted | Reject and rebuild the entire session |
| `OUTPUT_MAPPING` | A return script or amount is wrong | Do not sign |
| `SIGHASH_UNSAFE` | Signature mode could authorize substitution | Do not sign |
| `FEE_CAP_EXCEEDED` | Your agreed fee limit is exceeded | Wait, lower fee, or leave |
| `INVALID_SIGNATURE` | A contribution does not authorize the frozen transaction | Remove it and request a fresh contribution |
| `INPUT_PREVOUT_MISSING` | The wallet cannot verify complete amounts/scripts | Do not sign until every prevout is known |
| `INVALID_MARKER` | The commitment is malformed or ambiguous | Treat it as an ordinary transaction, not a Circle |

## Privacy checklist

- Use a dedicated input.
- Avoid aliases that reveal more than needed.
- Assume chain analysts can link every input and every same-key successor.
- Assume the coordinator sees invitations and timing.
- Treat external share cards as additional public disclosure.
- Do not call a Circle private, anonymous, or proof of a person.
