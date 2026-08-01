import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  type GoldenCircleVector,
  validateContextManifest,
  verifyGoldenCircleVector,
} from "../src/index.js";
import { loadGolden } from "./fixture.js";

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
    expect(validate({ ...manifest, created: "2026-08-01T18:00:00+00:00" })).toBe(false);
    expect(validate({ ...manifest, aliases: [{ key: "AA".repeat(32), label: "Alice" }] })).toBe(
      false,
    );
  });
});
