# Changelog

All notable changes are documented here. Versions follow Semantic Versioning while the package API is pre-1.0. Protocol semantics use their own explicit version byte.

## 0.1.0 - 2026-08-01

### Added

- Complete draft v1 `CIRCLE` specification
- Exact marker and RFC 8785 manifest utilities
- Strict Bitcoin transaction codec with minimal CompactSize enforcement
- BIP341 key-path sighash and BIP340 signature verification
- Deterministic validator and equal fee allocation
- Transaction and PSBT planning model
- Wallet signing-intent inspector
- Rollback-capable reference lineage state engine
- SDK, CLI, versioned schemas, golden signed transaction, and tests
- User, creator, developer, operator, commercial, launch, security, governance, and legal-review documentation
- Static commercial and documentation website
- CI, container, security-header, and configuration examples

### Fixed

- Aligned manifest runtime validation with JSON Schema code-point limits, exact UTC timestamps, well-formed Unicode, and lowercase alias keys

### Deliberate exclusions

- Mainnet production declaration
- Transfer, market, CPFP, refuel, rekey, token, reward, and governance operations
