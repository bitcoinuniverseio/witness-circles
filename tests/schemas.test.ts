import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { type GoldenCircleVector, verifyGoldenCircleVector } from "../src/index.js";
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
});
