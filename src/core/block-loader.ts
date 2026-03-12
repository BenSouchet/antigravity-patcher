import { recursiveFiles } from "./file-utils";
import { BlockDefinition } from "./types";

export function loadBlocks(blocksRoot: string): BlockDefinition[] {
  const files = recursiveFiles(blocksRoot, ".js");
  const blocks = files.map((filePath) => {
    delete require.cache[require.resolve(filePath)];
    const loaded = require(filePath);
    const block = (loaded.default ?? loaded) as BlockDefinition;
    validateBlock(block, filePath);
    return block;
  });

  const ids = new Set<string>();
  for (const block of blocks) {
    if (ids.has(block.id)) {
      throw new Error(`Duplicate block id detected: ${block.id}`);
    }
    ids.add(block.id);
  }

  return blocks.sort((left, right) => left.executionOrder - right.executionOrder);
}

function validateBlock(block: BlockDefinition, filePath: string): void {
  if (!block || typeof block !== "object") {
    throw new Error(`Invalid block export in ${filePath}`);
  }

  for (const key of ["id", "name", "description", "category"]) {
    if (!(key in block) || typeof (block as Record<string, unknown>)[key] !== "string") {
      throw new Error(`Block ${filePath} is missing required string field ${key}`);
    }
  }

  if (typeof block.executionOrder !== "number" || !Number.isFinite(block.executionOrder)) {
    throw new Error(`Block ${filePath} has invalid executionOrder`);
  }

  if (!Array.isArray(block.parameters)) {
    throw new Error(`Block ${filePath} has invalid parameters`);
  }

  if (typeof block.check !== "function" || typeof block.apply !== "function") {
    throw new Error(`Block ${filePath} must export check and apply handlers`);
  }
}
