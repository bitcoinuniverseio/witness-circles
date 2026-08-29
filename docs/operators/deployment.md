# Operator Deployment

## Reference package and site

```sh
npm ci
npm audit
npm run verify
docker compose build
docker compose up -d
```

The container serves only static files on port 8080 with a restrictive Content Security Policy. The compose example binds to localhost port 8088 and uses a read-only filesystem.

## Bitcoin indexer prerequisites

An independent indexer needs a fully validating Bitcoin Core node, RPC access restricted to the indexer network, ZMQ block and transaction notifications, and a reliable prevout source. Historical replay normally requires `txindex=1` or a complete local prevout store.

Suggested Core settings must be reviewed for the actual environment:

```ini
server=1
txindex=1
zmqpubrawblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
```

Do not expose RPC or ZMQ to an untrusted network. Use cookie authentication or a narrowly scoped secret distribution system. Never place credentials in image layers or repository files.

## Environments

- Development: generated transactions and no persistent keys
- Regtest: deterministic mining, conflicts, RBF, and reorganization fixtures
- Signet: independent wallet and relay compatibility pilot
- Mainnet read-only: index and compare before enabling any creation flow
- Mainnet create: separately approved, default disabled

## Backups and recovery

Bitcoin-derived authoritative state can be rebuilt, but checkpoints, parser versions, configuration, alerts, and optional manifests still require backup policy. Verify restores routinely. Keep immutable block references and state hashes so corruption can be detected before cutover.

For parser or schema migration, replay into shadow tables, compare state hashes and query projections, stop writers briefly, then atomically switch. Rollback restores the previous parser and tables. Never perform an in-place semantic rewrite without a reproducible snapshot.
