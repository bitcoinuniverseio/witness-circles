# Support

Witness Circles is an experimental protocol reference implementation. There is no commercial support contract and no service-level commitment.

## Where to start

| You want to | Go to |
|---|---|
| Understand the protocol | [Documentation site](https://bitcoinuniverseio.github.io/witness-circles/) |
| Read the normative rules | [SPECIFICATION.md](SPECIFICATION.md) or the [specification page](https://bitcoinuniverseio.github.io/witness-circles/specification.html) |
| See a worked transaction | [Guide](https://bitcoinuniverseio.github.io/witness-circles/guide.html) |
| Check your implementation | [Conformance](https://bitcoinuniverseio.github.io/witness-circles/conformance.html) and [test vectors](https://bitcoinuniverseio.github.io/witness-circles/test-vectors.html) |
| Try the rules interactively | [Circle simulator](https://bitcoinuniverseio.github.io/witness-circles/simulator.html) |
| Find the wider Bitcoin Universe docs | [docs.bitcoinuniverse.io](https://docs.bitcoinuniverse.io) |

## Asking a question

Open a [GitHub issue](https://github.com/bitcoinuniverseio/witness-circles/issues) on this repository. Include:

- the specification version and the commit you are working against,
- the exact input (raw transaction hex, marker script, or manifest JSON),
- what you expected and what you observed, including any protocol error code,
- your implementation language and version if you are reporting an interoperability difference.

Interoperability reports are the most useful thing you can send. If your implementation and the reference disagree about a verdict, an error code, a txid, a fee share, a lineage identifier or a state hash, that is a bug in one of them and we want to know.

## Reporting a vulnerability

Do not open a public issue for an unpatched fund-loss finding. Use [private vulnerability reporting](https://github.com/bitcoinuniverseio/witness-circles/security/policy) as described in [SECURITY.md](SECURITY.md).

## What is out of scope

- Mainnet deployment help. Planning and marker creation fail closed outside Signet and regtest.
- Wallet integration support. No wallet integration is verified in Bitcoin Universe code today.
- Trading, listing, pricing or custody. The protocol defines no transferable asset and has no marketplace registry entry.
- Recovery of coins spent outside the protocol. An ordinary spend of an active shard closes that lineage permanently and cannot be undone.
