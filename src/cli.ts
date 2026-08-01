#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bytesToHex, hexToBytes } from "./bytes.js";
import type { WitnessNetwork } from "./constants.js";
import { WitnessProtocolError } from "./errors.js";
import { canonicalizeContextManifest, contextHash } from "./manifest.js";
import { decodeMarkerScript, encodeMarkerScript } from "./marker.js";
import { buildCirclePlan, parseParticipantPlanJson, toCirclePsbtPlan } from "./planner.js";
import {
  decodeTransaction,
  transactionId,
  transactionMetrics,
  witnessTransactionId,
} from "./transaction.js";
import { type CirclePrevout, validateCircle } from "./validator.js";
import { type GoldenCircleVector, verifyGoldenCircleVector } from "./vectors.js";

function help(): string {
  return `Witness Circles reference CLI

Usage:
  witc manifest hash <manifest.json>
  witc marker encode --network <network> --participants <2-16> --context-hash <hex>
  witc marker decode <script-hex>
  witc tx decode <raw-transaction-hex>
  witc plan <request.json>
  witc validate --tx <raw.hex|json> --prevouts <prevouts.json> --height <n> --network <network> [--unsigned]
  witc vectors verify [golden-circle.json]

Networks: mainnet, testnet3, signet, regtest
Validation verifies signatures unless --unsigned is present.`;
}

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || args[index + 1] === undefined) throw new Error(`Missing ${name}`);
  return args[index + 1] as string;
}

function isNetwork(value: string): value is WitnessNetwork {
  return value === "mainnet" || value === "testnet3" || value === "signet" || value === "regtest";
}

function json(value: unknown): string {
  return `${JSON.stringify(
    value,
    (_key, child: unknown) => {
      if (typeof child === "bigint") return child.toString();
      if (child instanceof Uint8Array) return bytesToHex(child);
      return child;
    },
    2,
  )}\n`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function readTransactionArgument(path: string): Promise<string> {
  const content = (await readFile(resolve(path), "utf8")).trim();
  if (content.startsWith("{")) {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed["rawTransaction"] === "string") return parsed["rawTransaction"];
    throw new Error("Transaction JSON must contain rawTransaction");
  }
  return content;
}

async function run(args: readonly string[]): Promise<unknown> {
  const [group, command, positional] = args;
  if (group === undefined || group === "help" || group === "--help" || group === "-h")
    return help();
  if (group === "manifest" && command === "hash" && positional !== undefined) {
    const manifest = await readJson(positional);
    return { canonical: canonicalizeContextManifest(manifest), contextHash: contextHash(manifest) };
  }
  if (group === "marker" && command === "encode") {
    const network = option(args, "--network");
    if (!isNetwork(network)) throw new Error(`Unsupported network: ${network}`);
    const participantCount = Number(option(args, "--participants"));
    const hash = option(args, "--context-hash");
    return {
      script: bytesToHex(encodeMarkerScript({ network, participantCount, contextHash: hash })),
    };
  }
  if (group === "marker" && command === "decode" && positional !== undefined) {
    return decodeMarkerScript(hexToBytes(positional));
  }
  if (group === "tx" && command === "decode" && positional !== undefined) {
    const transaction = decodeTransaction(positional);
    return {
      txid: transactionId(transaction),
      wtxid: witnessTransactionId(transaction),
      metrics: transactionMetrics(transaction),
      transaction,
    };
  }
  if (group === "plan" && command !== undefined) {
    const request = (await readJson(command)) as Record<string, unknown>;
    const network = request["network"];
    if (typeof network !== "string" || !isNetwork(network))
      throw new Error("Plan network is invalid");
    if (!Array.isArray(request["participants"]))
      throw new Error("Plan participants must be an array");
    if (typeof request["feeRateSatsPerVbyte"] !== "string")
      throw new Error("feeRateSatsPerVbyte must be a decimal string");
    const plan = buildCirclePlan({
      network,
      manifest: request["manifest"] as never,
      participants: request["participants"].map(parseParticipantPlanJson),
      feeRateSatsPerVbyte: BigInt(request["feeRateSatsPerVbyte"]),
    });
    return { ...plan, psbtPlan: toCirclePsbtPlan(plan) };
  }
  if (group === "validate") {
    const raw = await readTransactionArgument(option(args, "--tx"));
    const prevoutData = await readJson(option(args, "--prevouts"));
    if (!Array.isArray(prevoutData)) throw new Error("Prevout file must contain an array");
    const network = option(args, "--network");
    if (!isNetwork(network)) throw new Error(`Unsupported network: ${network}`);
    const prevouts: CirclePrevout[] = prevoutData.map((item: unknown) => {
      const record = item as Record<string, unknown>;
      return {
        txid: String(record["txid"]),
        vout: Number(record["vout"]),
        value: BigInt(String(record["valueSats"])),
        scriptPubKey: hexToBytes(String(record["scriptPubKey"])),
        blockHeight: Number(record["blockHeight"]),
      };
    });
    return validateCircle(decodeTransaction(raw), {
      network,
      currentBlockHeight: Number(option(args, "--height")),
      prevouts,
      signatureMode: args.includes("--unsigned") ? "unsigned" : "verify",
    });
  }
  if (group === "vectors" && command === "verify") {
    const defaultPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "test-vectors",
      "v1",
      "golden-circle.json",
    );
    const vector = (await readJson(positional ?? defaultPath)) as GoldenCircleVector;
    return verifyGoldenCircleVector(vector);
  }
  throw new Error(`Unknown command\n\n${help()}`);
}

run(process.argv.slice(2))
  .then((result) => {
    process.stdout.write(typeof result === "string" ? `${result}\n` : json(result));
  })
  .catch((error: unknown) => {
    if (error instanceof WitnessProtocolError) {
      process.stderr.write(
        json({ error: error.code, message: error.message, details: error.details }),
      );
    } else {
      process.stderr.write(
        json({
          error: "CLI_ERROR",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    process.exitCode = 1;
  });
