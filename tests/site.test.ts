import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

const PAGES = [
  "index.html",
  "specification.html",
  "guide.html",
  "reference.html",
  "test-vectors.html",
  "schemas.html",
  "simulator.html",
  "conformance.html",
  "changelog.html",
  "404.html",
];

function read(file: string): string {
  return readFileSync(resolve(file), "utf8");
}

function loadPage(filename: string): Window {
  const window = new Window({ url: `http://127.0.0.1/${filename}` });
  window.document.write(read(filename));
  return window;
}

describe("documentation site", () => {
  it("publishes every page with unique metadata and the shared chrome", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const filename of PAGES) {
      const window = loadPage(filename);
      const document = window.document;
      const title = document.title;
      const description = document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content");
      expect(title, `${filename} title`).toBeTruthy();
      expect(description, `${filename} description`).toBeTruthy();
      expect(titles.has(title), `${filename} duplicate title`).toBe(false);
      expect(descriptions.has(description ?? ""), `${filename} duplicate description`).toBe(false);
      titles.add(title);
      descriptions.add(description ?? "");
      expect(document.querySelector("a.skip-link")).not.toBeNull();
      expect(document.querySelector("main#main")).not.toBeNull();
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(document.querySelector("footer.site-footer")).not.toBeNull();
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain(
        "https://bitcoinuniverseio.github.io/witness-circles/",
      );
      window.close();
    }
  });

  it("keeps every diagram and image described in text", () => {
    for (const filename of PAGES) {
      const window = loadPage(filename);
      for (const image of [...window.document.querySelectorAll("img")]) {
        expect(image.hasAttribute("alt"), `${filename} image without alt`).toBe(true);
      }
      for (const svg of [...window.document.querySelectorAll('svg[role="img"]')]) {
        const described =
          svg.getAttribute("aria-labelledby") !== null || svg.getAttribute("aria-label") !== null;
        expect(described, `${filename} svg without a text alternative`).toBe(true);
      }
      window.close();
    }
  });

  it("wires the simulator to the protocol engine", () => {
    const window = loadPage("simulator.html");
    const sources = [...window.document.querySelectorAll("script")].map((node) =>
      node.getAttribute("src"),
    );
    expect(sources).toContain("assets/witc.js");
    expect(sources).toContain("assets/simulator.js");
    expect(window.document.querySelector("[data-builder]")).not.toBeNull();
    expect(window.document.querySelector("[data-replay]")).not.toBeNull();
    expect(window.document.querySelector("noscript")).not.toBeNull();
    window.close();
  });

  it("ships a search index whose targets all exist", () => {
    const index = JSON.parse(read("search-index.json")) as {
      entries: { url: string; page: string; heading: string; text: string }[];
    };
    expect(index.entries.length).toBeGreaterThan(40);
    for (const entry of index.entries) {
      const separator = entry.url.indexOf("#");
      const file = separator === -1 ? entry.url : entry.url.slice(0, separator);
      const anchor = separator === -1 ? "" : entry.url.slice(separator + 1);
      expect(PAGES, `unknown search target ${entry.url}`).toContain(file);
      expect(entry.heading.length).toBeGreaterThan(0);
      if (anchor !== "") {
        expect(read(file), `${file} is missing anchor ${anchor}`).toContain(`id="${anchor}"`);
      }
    }
  });

  it("lists every indexable page in the sitemap and llms.txt", () => {
    const sitemap = read("sitemap.xml");
    const llms = read("llms.txt");
    for (const filename of PAGES) {
      if (filename === "404.html") {
        expect(sitemap).not.toContain(filename);
        continue;
      }
      const slug = filename === "index.html" ? "witness-circles/</loc>" : `${filename}</loc>`;
      expect(sitemap, `${filename} missing from sitemap`).toContain(slug);
      if (filename !== "index.html") {
        expect(llms, `${filename} missing from llms.txt`).toContain(filename);
      }
    }
    expect(read("robots.txt")).toContain("sitemap.xml");
    expect(existsSync(resolve(".nojekyll"))).toBe(true);
  });

  it("publishes a self hosted social card at the declared size", () => {
    const image = readFileSync(resolve("assets/og-card.png"));
    expect(image.toString("ascii", 1, 4)).toBe("PNG");
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
    const window = loadPage("index.html");
    expect(
      window.document.querySelector('meta[property="og:image:width"]')?.getAttribute("content"),
    ).toBe("1200");
    expect(
      window.document.querySelector('meta[property="og:image:height"]')?.getAttribute("content"),
    ).toBe("630");
    window.close();
  });
});

describe("browser protocol engine", () => {
  interface WitcApi {
    hexToBytes: (value: string) => Uint8Array;
    decodeMarkerScript: (script: Uint8Array) => {
      network: string;
      participantCount: number;
      contextHash: string;
    };
    decodeTransaction: (raw: string) => unknown;
    validateCircle: (
      transaction: unknown,
      context: unknown,
    ) => Promise<{
      txid: string;
      wtxid: string;
      fee: bigint;
      metrics: { virtualBytes: number };
      members: { input: { txid: string; vout: number } }[];
    }>;
    deriveLineageId: (outpoint: { txid: string; vout: number }) => Promise<string>;
    WitnessStateEngine: new () => {
      stateHash: () => Promise<string>;
      apply: (event: unknown) => Promise<{ stateHash: string; kind: string }>;
      rollbackLast: (txid: string) => Promise<string>;
    };
  }

  async function api(): Promise<WitcApi> {
    // The site engine is untyped browser JavaScript, loaded here by URL so that
    // TypeScript does not try to resolve declarations for it.
    const enginePath = new URL("../assets/witc.js", import.meta.url).href;
    await import(enginePath);
    return (globalThis as unknown as { WITC: WitcApi }).WITC;
  }

  const golden = JSON.parse(read("test-vectors/v1/golden-circle.json"));
  const lifecycle = JSON.parse(read("test-vectors/v1/state-lifecycle.json"));
  const markers = JSON.parse(read("test-vectors/v1/marker-vectors.json"));

  function prevouts(witc: WitcApi, list: Record<string, string | number>[]): unknown[] {
    return list.map((prevout) => ({
      txid: prevout["txid"],
      vout: prevout["vout"],
      value: BigInt(prevout["valueSats"] as string),
      scriptPubKey: witc.hexToBytes(prevout["scriptPubKey"] as string),
      blockHeight: prevout["blockHeight"],
    }));
  }

  it("reproduces the published marker vectors", async () => {
    const witc = await api();
    for (const vector of markers.valid) {
      const marker = witc.decodeMarkerScript(witc.hexToBytes(vector.script));
      expect(marker.network).toBe(vector.network);
      expect(marker.participantCount).toBe(vector.participants);
      expect(marker.contextHash).toBe(vector.contextHash);
    }
    for (const vector of markers.invalid) {
      let code: string | undefined;
      try {
        witc.decodeMarkerScript(witc.hexToBytes(vector.script));
      } catch (error) {
        code = (error as { code: string }).code;
      }
      expect(code, vector.name).toBe(vector.error);
    }
  });

  it("reproduces the golden circle and the complete state lifecycle", async () => {
    const witc = await api();
    const genesis = await witc.validateCircle(witc.decodeTransaction(golden.rawTransaction), {
      network: golden.network,
      currentBlockHeight: golden.currentBlockHeight,
      prevouts: prevouts(witc, golden.prevouts),
      signatureMode: "shape",
    });
    expect(genesis.txid).toBe(golden.txid);
    expect(genesis.wtxid).toBe(golden.wtxid);
    expect(genesis.fee.toString()).toBe(golden.feeSats);
    expect(genesis.metrics.virtualBytes).toBe(golden.virtualBytes);

    const lineages: string[] = [];
    for (const member of genesis.members) lineages.push(await witc.deriveLineageId(member.input));
    expect(lineages).toEqual(golden.expectedLineageIds);

    const engine = new witc.WitnessStateEngine();
    expect(await engine.stateHash()).toBe(lifecycle.rollbackExpectedStateHashes[2]);

    const first = await engine.apply({
      txid: genesis.txid,
      spentOutpoints: genesis.members.map((member) => member.input),
      blockHeight: golden.stateTransition.blockHeight,
      blockHash: golden.stateTransition.blockHash,
      transactionIndex: golden.stateTransition.transactionIndex,
      circle: genesis,
    });
    expect(first.stateHash).toBe(golden.stateTransition.expectedStateHash);

    const continuation = lifecycle.continuation;
    const second = await witc.validateCircle(witc.decodeTransaction(continuation.rawTransaction), {
      network: golden.network,
      currentBlockHeight: continuation.currentBlockHeight,
      prevouts: prevouts(witc, continuation.prevouts),
      signatureMode: "shape",
    });
    expect(second.txid).toBe(continuation.txid);
    expect(second.wtxid).toBe(continuation.wtxid);
    const secondTransition = await engine.apply({
      txid: second.txid,
      spentOutpoints: second.members.map((member) => member.input),
      blockHeight: continuation.blockHeight,
      blockHash: continuation.blockHash,
      transactionIndex: continuation.transactionIndex,
      circle: second,
    });
    expect(secondTransition.stateHash).toBe(continuation.expectedStateHash);

    const closure = lifecycle.closure;
    const third = await engine.apply({
      txid: closure.txid,
      spentOutpoints: closure.spentOutpoints,
      blockHeight: closure.blockHeight,
      blockHash: closure.blockHash,
      transactionIndex: closure.transactionIndex,
      circle: null,
    });
    expect(third.kind).toBe("ordinary-spend");
    expect(third.stateHash).toBe(closure.expectedStateHash);

    expect([
      await engine.rollbackLast(closure.txid),
      await engine.rollbackLast(continuation.txid),
      await engine.rollbackLast(golden.txid),
    ]).toEqual(lifecycle.rollbackExpectedStateHashes);
  });
});
