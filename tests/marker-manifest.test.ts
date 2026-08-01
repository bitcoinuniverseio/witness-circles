import fc from "fast-check";
import {
  canonicalizeContextManifest,
  canonicalizeJson,
  contextHash,
  decodeMarkerScript,
  encodeMarkerScript,
  hexToBytes,
  validateContextManifest,
  WitnessProtocolError,
} from "../src/index.js";
import { loadGolden } from "./fixture.js";

describe("context manifests and markers", () => {
  it("matches the canonical golden manifest", () => {
    const vector = loadGolden();
    expect(canonicalizeContextManifest(vector.manifest)).toBe(vector.canonicalManifest);
    expect(contextHash(vector.manifest)).toBe(vector.contextHash);
  });

  it("uses deterministic JCS property ordering", () => {
    expect(canonicalizeJson({ z: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"z":1}');
  });

  it("rejects unknown fields and invalid Unicode", () => {
    const vector = loadGolden();
    const manifest = validateContextManifest(vector.manifest);
    expect(() => canonicalizeContextManifest({ ...manifest, transfer: true })).toThrow(
      WitnessProtocolError,
    );
    expect(() => canonicalizeJson("\ud800")).toThrow(WitnessProtocolError);
    expect(() => validateContextManifest({ ...manifest, title: "\ud800" })).toThrow(
      WitnessProtocolError,
    );
  });

  it("matches schema code-point, timestamp, and lowercase alias rules", () => {
    const vector = loadGolden();
    const manifest = validateContextManifest(vector.manifest);
    expect(() =>
      validateContextManifest({ ...manifest, title: "\u754c".repeat(120) }),
    ).not.toThrow();
    expect(() => validateContextManifest({ ...manifest, title: "\u754c".repeat(121) })).toThrow(
      WitnessProtocolError,
    );
    expect(() => validateContextManifest({ ...manifest, title: ` ${manifest.title}` })).toThrow(
      WitnessProtocolError,
    );
    expect(() =>
      validateContextManifest({ ...manifest, title: `${manifest.title}\ufeff` }),
    ).toThrow(WitnessProtocolError);
    expect(() =>
      validateContextManifest({
        ...manifest,
        created: "2026-08-01T18:00:00+00:00",
      }),
    ).toThrow(WitnessProtocolError);
    expect(() =>
      validateContextManifest({
        ...manifest,
        created: "2026-02-30T18:00:00Z",
      }),
    ).toThrow(WitnessProtocolError);
    expect(() => validateContextManifest({ ...manifest, expires: manifest.created })).toThrow(
      WitnessProtocolError,
    );
    expect(() =>
      validateContextManifest({
        ...manifest,
        aliases: [{ key: "AA".repeat(32), label: "Alice" }],
      }),
    ).toThrow(WitnessProtocolError);
  });

  it("round trips markers across every network and participant count", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("mainnet", "testnet3", "signet", "regtest" as const),
        fc.integer({ min: 2, max: 16 }),
        fc
          .uint8Array({ minLength: 32, maxLength: 32 })
          .filter((hash) => hash.some((byte) => byte !== 0)),
        (network, participantCount, hash) => {
          const context = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
          const decoded = decodeMarkerScript(
            encodeMarkerScript({ network, participantCount, contextHash: context }),
          );
          expect(decoded).toMatchObject({ network, participantCount, contextHash: context });
        },
      ),
    );
  });

  it("rejects noncanonical marker pushes", () => {
    const vector = loadGolden();
    const payload = vector.markerScript.slice(4);
    expect(() => decodeMarkerScript(hexToBytes(`6a4c28${payload}`))).toThrow(WitnessProtocolError);
  });
});
