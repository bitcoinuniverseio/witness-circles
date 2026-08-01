# Release Process

1. Confirm the specification version and package version are intentional.
2. Update `CHANGELOG.md`, support tables, vectors, schemas, and public API documentation.
3. Run `npm ci`, `npm audit`, `npm run verify`, and `npm pack --dry-run` in a clean checkout.
4. Compare golden state hashes with an independent implementation.
5. Review the package tarball for secrets, private files, test keys mistaken for live keys, and unintended generated content.
6. Obtain two maintainer approvals for parser or wallet-safety changes.
7. Create a signed annotated tag.
8. Build with short-lived, least-privilege registry credentials and provenance where the registry supports it.
9. Publish release notes containing compatibility, security, migration, and rollback information.
10. Monitor installation, vector verification, and vulnerability feeds.

Publishing a package does not enable mainnet application features. Mainnet activation is a separate reviewed decision.
