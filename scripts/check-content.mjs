import { readdir, readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const excluded = new Set(["node_modules", "dist", "coverage", ".git"]);
const textExtensions = new Set([
  ".ts",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".html",
  ".css",
  ".svg",
  ".yml",
  ".yaml",
  ".txt",
]);
const files = [];

async function walk(directory) {
  for (const name of await readdir(directory)) {
    if (excluded.has(name)) continue;
    const path = resolve(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else if (textExtensions.has(extname(path)) || name === "Dockerfile" || name === "LICENSE")
      files.push(path);
  }
}

await walk(root);
const failures = [];
for (const path of files) {
  const content = await readFile(path, "utf8");
  if (content.includes("\u2014")) failures.push(`${path}: contains a prohibited em dash`);
  const placeholderPattern = new RegExp(
    `\\b(?:${["TO" + "DO", "T" + "BD", "Lorem" + " ipsum"].join("|")})\\b`,
    "i",
  );
  if (placeholderPattern.test(content)) failures.push(`${path}: contains placeholder text`);
  const placeholderLinkPattern = new RegExp(`${"java" + "script"}:void`, "i");
  if (placeholderLinkPattern.test(content)) failures.push(`${path}: contains a placeholder link`);
  if (extname(path) !== ".html") continue;
  for (const match of content.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (!target || target.startsWith("#") || /^(?:https?:|mailto:|tel:|data:)/.test(target))
      continue;
    const clean = target.split(/[?#]/, 1)[0];
    const destination = clean.startsWith("/")
      ? resolve(root, "site", clean.slice(1))
      : resolve(path, "..", clean);
    try {
      await stat(destination);
    } catch {
      failures.push(`${path}: broken local reference ${target}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Checked ${files.length} text files with no prohibited punctuation, placeholders, or broken HTML links.\n`,
  );
}
