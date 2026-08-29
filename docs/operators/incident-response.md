# Incident Response

## Severity

- Critical: fund theft, unsafe signing, remote execution, parser divergence that changes ownership state, or credential compromise
- High: persistent invalid state, deep rollback failure, broad XSS, or API authorization bypass
- Medium: degraded indexing, metadata abuse, incorrect presentation, or bounded denial of service
- Low: cosmetic, documentation, or non-sensitive availability defect

## First actions

1. Preserve evidence without copying secrets into tickets.
2. Disable mainnet creation and broadcast first; keep read-only verification available when safe.
3. Revoke affected credentials and isolate compromised systems.
4. Record exact Core tip, parser version, state hash, package digest, and deployment version.
5. Compare with an independent node and parser.
6. Notify the designated security and incident owners.

## Recovery by incident type

- Parser divergence: freeze writes, replay both parsers into shadow state, publish the differing transaction, fix and verify vectors, then controlled cutover.
- Reorganization failure: stop authoritative writer, locate the common ancestor in Core, restore checkpoint, reverse state, replay, and compare state hash.
- Malicious metadata: disable fetching, retain hashes, sanitize or remove cached content, rotate media-proxy credentials, and audit CSP reports.
- Signing vulnerability: disable coordinator broadcast and wallet entry points, revoke sessions, prepare a reviewed wallet patch, and warn affected users with exact transaction checks.
- Dependency compromise: isolate build credentials, identify package and digest, rebuild from a known clean lockfile, rotate tokens, and publish affected versions.

## Communication

State confirmed facts, user impact, safe actions, current system status, and the next update time. Never minimize uncertainty or speculate about an attacker. After containment, publish a timeline, root cause, detection gap, corrective work, and vector or test added.
