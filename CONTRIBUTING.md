# Contributing

## Before opening a change

Read `SPECIFICATION.md`, `SECURITY.md`, and `GOVERNANCE.md`. Discuss protocol-semantic changes before writing a large patch. Security findings follow the private disclosure process.

## Local checks

```sh
npm ci
npm run verify
npm audit
```

Changes to parsing, validation, lineages, serialization, fees, signatures, or versions must add valid and invalid vectors plus cross-implementation reasoning.

## Pull request expectations

- One focused purpose
- No credentials, keys, production configuration, or user data
- Strict types and explicit error handling
- No hidden network calls in protocol validation
- No metadata dependency for protocol correctness
- Documentation for exported APIs and user-visible safety behavior
- Changelog entry for public behavior changes
- Passing CI from a clean checkout

Generated artifacts must identify their source and regeneration process. Do not edit package-lock entries by hand.

By contributing code, you agree to the MIT license. Contributions to the normative specification and vectors are offered under CC0 1.0.
