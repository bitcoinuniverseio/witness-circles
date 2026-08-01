# Security Policy

## Experimental status

Witness Circles v1 has not been represented as safe for unrestricted mainnet use. The package provides deterministic parsing, BIP341 signature verification, wallet intent inspection, and test vectors, but those controls do not replace independent review, Bitcoin Core policy preflight, hardware-wallet testing, or operational monitoring.

## Supported versions

| Version | Status |
|---|---|
| 0.1.x | Security fixes accepted while the v1 specification is draft |

No version is currently designated as a production mainnet release.

## Private reporting

Do not disclose an unpatched fund-loss, signature-substitution, parser-divergence, or remote-code-execution issue in a public issue.

The [public source repository](https://github.com/bitcoinuniverse/witness-circles) does not currently expose a verified private reporting channel. Do not place an unpatched vulnerability in a public issue. Provide an encrypted report directly to the Bitcoin Universe security owner through a separately verified contact route. Never send private keys, seed phrases, live PSBT signatures, or credentials as evidence.

A useful report includes:

- Affected package version and commit
- Network and Bitcoin Core version
- Minimal reproduction with regtest funds
- Expected and actual behavior
- Impact and plausible exploit path
- Proposed mitigation, if known
- Whether public disclosure has occurred

## Response targets

These are operational targets, not guarantees:

- Acknowledge a critical report within 2 business days
- Confirm triage within 5 business days
- Coordinate a disclosure date after a tested fix exists
- Credit reporters who request credit and comply with coordinated disclosure

## Security invariants

1. Exact 42-byte marker grammar
2. Confirmed earlier-height P2TR prevouts
3. Canonical input ordering
4. Distinct outpoints and output keys
5. Same-script successor mapping
6. Deterministic equal fee shares
7. Successors of at least 1,000 sats
8. Taproot key-path `DEFAULT` or `ALL` only
9. Independent wallet validation of all inputs and outputs
10. Invalid candidates never mutate state
11. One active shard per lineage
12. Best-chain state only
13. Metadata never affects protocol validity
14. Checked integer arithmetic

## Threat boundaries

- A coordinator can censor, stall, withhold, or show different invitations. A correct wallet prevents it from changing a signed transaction without detection.
- A Circle intentionally creates public input linkage. Dedicated UTXOs reduce unrelated exposure but do not create privacy.
- Distinct keys can belong to one person or organization.
- Optional manifests can contain malicious content. Treat them as untrusted and render as text after sanitization.
- Relay and miner policy vary. Preflight does not guarantee confirmation.
- Key loss is not recoverable by this protocol.
- No marketplace is part of v1. Private key or account sales can still occur outside the protocol.

## Dependency and release controls

- Runtime and development dependencies are exact-version pinned in `package-lock.json`.
- CI runs `npm audit`, strict type checks, tests, build, content checks, and vector verification.
- Releases require a clean checkout, reproducible package contents, changelog entry, signed tag, and human review.
- Do not publish from an unreviewed workstation or with broad long-lived registry credentials.
- Never log private keys, seeds, complete signing secrets, authorization headers, or unredacted capabilities.

See `docs/operators/incident-response.md` for containment and recovery steps.
