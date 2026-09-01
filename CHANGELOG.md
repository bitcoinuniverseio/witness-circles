# Changelog

All notable changes are documented here. Versions follow Semantic Versioning while the package API is pre-1.0. Protocol semantics use their own explicit version byte.

## Unreleased

### Added

- Independent documentation site published from the repository root and served by GitHub Pages: overview, normative specification, guide with worked examples, reference, test vectors, JSON Schema reference, conformance material, changelog and a helpful 404 page.
- `assets/witc.js`, a dependency-free browser reimplementation of the marker decoder, transaction codec, validator, fee allocator, lineage derivation and state engine, which reproduces every published vector.
- Circle state simulator with a live rule verdict, fee allocation table, marker decoder and a full replay of the committed vectors in the browser.
- Build-free local search over an authored `search-index.json`, plus `llms.txt`, `sitemap.xml`, `robots.txt` and a self-hosted Open Graph card.
- `SUPPORT.md`.
- `tests/site.test.ts` now asserts that the browser engine reproduces the marker vectors, the golden circle and the complete state lifecycle including all three rollback roots.

### Changed

- Replaced the previous marketing-oriented site under `site/` with the protocol documentation site at the repository root.
- Corrected repository links from the `bitcoinuniverse` organization to the owning organization `bitcoinuniverseio` in `README.md` and `package.json`.
- Enriched `docs.manifest.json`: declared the specification, all seven JSON Schemas and the CLI and SDK entry points, listed every parseable network rather than mainnet alone, added the security-verifier audience, and updated the verified commit.
- `Dockerfile` and `ops/nginx.conf` now serve the root site.

### Fixed

- Repaired mangled wording in `SPECIFICATION.md` sections 5, 8, 11 and 13 introduced by an earlier find-and-replace over the document.

## 0.1.0 - 2026-08-01

### Added

- Complete final `CIRCLE` protocol specification
- Exact marker and RFC 8785 manifest utilities
- Strict Bitcoin transaction codec with minimal CompactSize enforcement
- BIP341 key-path sighash and BIP340 signature verification
- Deterministic validator and equal fee allocation
- Transaction and PSBT planning model
- Wallet signing-intent inspector
- Rollback-capable reference lineage state engine
- SDK, CLI, versioned schemas, golden signed transaction, state-lifecycle vector, and tests
- User, creator, developer, operator, commercial, launch, security, governance, and legal-review documentation
- Static commercial and documentation website
- CI, container, security-header, and configuration examples

### Fixed

- Aligned manifest runtime validation with JSON Schema code-point limits, exact UTC timestamps, well-formed Unicode, and lowercase alias keys
- Defined the authoritative state-root preimage and committed a reproducible golden transition hash
- Rejected nonintegral planner positions, whitespace-padded manifest text, and aggregate inputs above Bitcoin MAX_MONEY
- Rejected unsafe state integers, outpoint indices above uint32, and state amounts above Bitcoin MAX_MONEY before hashing

### Deliberate exclusions

- Mainnet production declaration
- Transfer, market, CPFP, refuel, rekey, token, reward, and governance operations
