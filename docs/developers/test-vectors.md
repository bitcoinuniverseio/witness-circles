# Test Vectors

The [golden three-participant Signet vector](../../test-vectors/v1/golden-circle.json) contains a complete deterministic transaction. It commits to:

- Canonical manifest and SHA-256 hash
- Exact marker script
- Confirmed prevouts and P2TR output keys
- Raw signed transaction
- txid and wtxid
- Fee and virtual size
- Derived lineage IDs

Fixture private keys are small public test constants used only to generate deterministic signatures. They must never receive real funds.

`marker-vectors.json` contains valid and invalid encodings, including direct-push ambiguity, reserved operation, and zero context hash.

## Independent implementation procedure

1. Parse the raw transaction without this SDK.
2. Load all listed prevouts.
3. Verify every BIP341 signature.
4. Reproduce marker fields, fee shares, txid, wtxid, vsize, and lineage IDs.
5. Reject every invalid vector at the same semantic boundary.
6. Publish the implementation language, version, parser digest, and result.

Adding or changing a normative rule requires a vector that fails before the change and passes after it, plus an inverse invalid case where appropriate.
