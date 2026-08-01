# Changelog

All notable changes are documented here. Versions follow Semantic Versioning while the package API is pre-1.0. Protocol semantics use their own explicit version byte.

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
- Defined the canonical state-root preimage and committed a reproducible golden transition hash
- Rejected nonintegral planner positions, whitespace-padded manifest text, and aggregate inputs above Bitcoin MAX_MONEY
- Rejected unsafe state integers, outpoint indices above uint32, and state amounts above Bitcoin MAX_MONEY before hashing

### Deliberate exclusions

- Mainnet production declaration
- Transfer, market, CPFP, refuel, rekey, token, reward, and governance operations
