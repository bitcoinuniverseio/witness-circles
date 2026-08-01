# Witness Circles Technical Whitepaper

## Abstract

Witness Circles turns exact multi-input Bitcoin authorization into a simple social object. Two to sixteen participants sign one Taproot transaction that returns each participant's value to the same output key after a deterministic equal fee share. A compact marker commits to optional context. Independent indexers derive lineages and relationships directly from Bitcoin.

## Motivation

Bitcoin applications commonly attach social meaning to issuer records, tokens, or private databases. Those systems can be useful, but their social claim is separate from Bitcoin's actual authorization model. Witness Circles explores a narrower question: can exact transaction coauthorization itself be the memorable event?

## Construction

The transaction uses version 2, zero locktime, RBF-signaling sequences, 2 to 16 confirmed native P2TR inputs, a zero-sat 42-byte marker, and one same-script successor per input. Every key-path signature uses default or all-output sighash, so each participant authorizes the full participant set, context commitment, returns, and fee.

Input ordering and equal fee allocation remove coordinator discretion. Same-script successors form independently indexable lineages. Ordinary spending closes a lineage without restricting Bitcoin control.

## Security and privacy

Correct wallet validation prevents output substitution, partial-sighash theft, hidden payment outputs, and unilateral fee changes. It cannot prevent coordinator censorship, signer disappearance, key compromise, public linkage, Sybil keys, or changing relay policy.

Public linkage is intrinsic. Witness Circles is not a CoinJoin and should never claim anonymity. Users should contribute dedicated inputs and review exact return amounts.

## Economic design

Version 1 has no token, reward, protocol fee, royalty, market, artificial supply, or transferable claim. Miners receive normal transaction fees. Optional creators and coordinators can charge separately for services, with clear disclosure that the charge is not protocol-enforced.

This design removes direct wash-trading incentives and keeps success metrics focused on completion, repeat use, comprehension, sharing, creator activity, costs, and state correctness.

## Independence

The complete protocol can be reproduced from Bitcoin data, the specification, and published vectors. Bitcoin Universe may operate convenient coordinators, explorers, metadata mirrors, and social presentation, but none is a protocol authority.

## Status

The reference implementation supports strict parsing, Schnorr verification, deterministic state, planning, wallet intent inspection, SDK, CLI, schemas, and a golden transaction. Production mainnet readiness depends on independent parser agreement, hardware-wallet testing, a sustained Signet pilot, security review, and user privacy comprehension.
