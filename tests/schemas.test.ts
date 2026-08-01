import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  type GoldenCircleVector,
  type StateLifecycleVector,
  validateContextManifest,
  verifyGoldenCircleVector,
  verifyStateLifecycleVector,
  WitnessStateEngine,
} from "../src/index.js";
import { goldenContext, loadGolden } from "./fixture.js";

describe("published schemas and vectors", () => {
  it("compiles every v1 schema and validates the golden vector", () => {
    const ajv = new Ajv2020({
      allErrors: true,
      formats: {
        "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
      },
    });
    for (const filename of readdirSync(resolve("schemas/v1")).filter((name) =>
      name.endsWith(".json"),
    )) {
      ajv.addSchema(JSON.parse(readFileSync(resolve("schemas/v1", filename), "utf8")));
    }
    const goldenSchema = ajv.getSchema(
      "https://schemas.bitcoinuniverse.dev/witc/v1/golden-circle.schema.json",
    );
    expect(goldenSchema).toBeTypeOf("function");
    const vector = loadGolden();
    expect(goldenSchema?.(vector), JSON.stringify(goldenSchema?.errors)).toBe(true);
    expect(verifyGoldenCircleVector(vector as GoldenCircleVector).valid).toBe(true);
    const lifecycleSchema = ajv.getSchema(
      "https://schemas.bitcoinuniverse.dev/witc/v1/state-lifecycle.schema.json",
    );
    const lifecycle = JSON.parse(
      readFileSync(resolve("test-vectors/v1/state-lifecycle.json"), "utf8"),
    ) as StateLifecycleVector;
    expect(lifecycleSchema).toBeTypeOf("function");
    expect(lifecycleSchema?.(lifecycle), JSON.stringify(lifecycleSchema?.errors)).toBe(true);
    expect(verifyStateLifecycleVector(lifecycle, vector as GoldenCircleVector)).toMatchObject({
      valid: true,
      continuationTxid: lifecycle.continuation.txid,
      stateHashes: [
        lifecycle.genesis.expectedStateHash,
        lifecycle.continuation.expectedStateHash,
        lifecycle.closure.expectedStateHash,
      ],
      rollbackStateHashes: lifecycle.rollbackExpectedStateHashes,
    });
    const stateSchema = ajv.getSchema(
      "https://schemas.bitcoinuniverse.dev/witc/v1/state-snapshot.schema.json",
    );
    const { validated } = goldenContext(vector);
    const state = new WitnessStateEngine();
    state.apply({
      txid: validated.txid,
      spentOutpoints: validated.members.map((member) => member.input),
      blockHeight: vector.stateTransition.blockHeight,
      blockHash: vector.stateTransition.blockHash,
      transactionIndex: vector.stateTransition.transactionIndex,
      circle: validated,
    });
    const snapshot = state.snapshot();
    expect(stateSchema?.(snapshot), JSON.stringify(stateSchema?.errors)).toBe(true);
    expect(stateSchema?.({ ...snapshot, revision: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    const firstShard = snapshot.shards[0];
    if (!firstShard) throw new Error("Golden state has no shard");
    expect(
      stateSchema?.({
        ...snapshot,
        shards: [{ ...firstShard, outpoint: `${"aa".repeat(32)}:4294967296` }],
      }),
    ).toBe(false);
    expect(
      stateSchema?.({
        ...snapshot,
        shards: [{ ...firstShard, valueSats: "2100000000000001" }],
      }),
    ).toBe(false);
  });

  it("aligns the manifest schema with code-point, UTC, and alias-key rules", () => {
    const ajv = new Ajv2020({
      allErrors: true,
      formats: {
        "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
      },
    });
    const schema = JSON.parse(
      readFileSync(resolve("schemas/v1/context-manifest.schema.json"), "utf8"),
    );
    const validate = ajv.compile(schema);
    const manifest = validateContextManifest(loadGolden().manifest);

    expect(validate({ ...manifest, title: "\u754c".repeat(120) }), validate.errors?.join()).toBe(
      true,
    );
    expect(validate({ ...manifest, title: "\u754c".repeat(121) })).toBe(false);
    expect(validate({ ...manifest, title: `${manifest.title} ` })).toBe(false);
    expect(validate({ ...manifest, title: `\ufeff${manifest.title}` })).toBe(false);
    expect(validate({ ...manifest, created: "2026-08-01T18:00:00+00:00" })).toBe(false);
    expect(validate({ ...manifest, aliases: [{ key: "AA".repeat(32), label: "Alice" }] })).toBe(
      false,
    );
  });
});
