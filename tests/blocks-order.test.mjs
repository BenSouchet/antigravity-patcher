import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadBuiltBlock } from "./helpers.mjs";

const canonicalOrder = [
  "backup-core",
  "auth-integrity",
  "extension-runtime",
  "unleash-offline",
  "auto-run",
  "auto-retry",
  "community-fixes",
  "checksums"
];

test("built Blocks expose valid metadata and canonical execution order", async () => {
  const blocksRoot = path.resolve(process.cwd(), "dist", "blocks");
  const categoryDirs = fs.readdirSync(blocksRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const loadedBlocks = [];

  for (const category of categoryDirs) {
    const categoryPath = path.join(blocksRoot, category.name);
    for (const file of fs.readdirSync(categoryPath, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".js")) {
        continue;
      }
      loadedBlocks.push(loadBuiltBlock(`${category.name}/${file.name}`));
    }
  }

  assert.equal(loadedBlocks.length, canonicalOrder.length);

  const ids = loadedBlocks.map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate Block ids found");

  for (const block of loadedBlocks) {
    assert.equal(typeof block.id, "string");
    assert.equal(typeof block.name, "string");
    assert.equal(typeof block.description, "string");
    assert.equal(typeof block.category, "string");
    assert.equal(typeof block.executionOrder, "number");
    assert.equal(typeof block.defaultEnabled, "boolean");
    assert.ok(Array.isArray(block.parameters));
    assert.equal(typeof block.check, "function");
    assert.equal(typeof block.apply, "function");
  }

  const sorted = [...loadedBlocks].sort((left, right) => left.executionOrder - right.executionOrder);
  assert.deepEqual(
    sorted.map((block) => block.id),
    canonicalOrder
  );
});
