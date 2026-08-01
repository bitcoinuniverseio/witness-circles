# Monitoring and Analytics

## Protocol health

Alert on:

- Core and indexer tip mismatch
- State-hash disagreement between independent instances
- Reorganization depth and rollback failure
- Parser error-rate change
- Invalid-marker spikes
- Mempool conflict and replacement spikes
- ZMQ disconnect or RPC latency
- Replay/checkpoint failure
- API p95 latency and error rate
- Database saturation, replication lag, disk growth, and backup failure

Every log should include network, parser version, block hash or txid, stable error code, and correlation ID. Never log authorization capabilities, full user PSBTs, private derivation paths, seeds, or keys.

## Product health

Privacy-conscious aggregate metrics include discovery views, tutorial completion, invite to preview, preview to sign, started session completion, confirmation, failure reason, repeat participation, share conversion, creator activation, support demand, fees, participant counts, concentration, and obvious bot indicators.

Keep protocol health separate from commercial conversion. Never reward transaction volume or rank wealth.

## Initial service targets

- Confirmed index lag below two blocks
- ZMQ event handling below ten seconds under normal load
- Cached read API p95 below 250 ms
- Started 3 to 8 participant session completion at or above 80 percent
- Failed transaction rate below 5 percent
- Indexer state-hash agreement at 100 percent

Targets are pilot gates, not uptime warranties.
