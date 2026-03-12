import { build, context } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
const appDir = path.join(distDir, "app");
const blocksSrcDir = path.join(srcDir, "blocks");
const blocksDistDir = path.join(distDir, "blocks");
const runtimeDir = path.join(root, "runtime");
const watchMode = process.argv.includes("--watch");

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function listBlockEntries(baseDir) {
  const entries = [];
  for (const category of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!category.isDirectory()) {
      continue;
    }
    const categoryDir = path.join(baseDir, category.name);
    for (const file of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".ts")) {
        continue;
      }
      entries.push({
        entry: path.join(categoryDir, file.name),
        outfile: path.join(blocksDistDir, category.name, file.name.replace(/\.ts$/, ".js"))
      });
    }
  }
  return entries;
}

function getAppBuildOptions() {
  return {
    entryPoints: {
      main: path.join(srcDir, "main.ts"),
      preload: path.join(srcDir, "preload.ts")
    },
    outdir: appDir,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    sourcemap: true,
    external: ["electron", "node:*"]
  };
}

function getRendererBuildOptions() {
  return {
    entryPoints: {
      renderer: path.join(srcDir, "renderer", "index.tsx")
    },
    outdir: appDir,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome120",
    sourcemap: true,
    loader: {
      ".css": "text"
    }
  };
}

function getBlockBuildOptions(entry, outfile) {
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    sourcemap: true,
    external: ["node:*"]
  };
}

function writeRuntimeFiles() {
  ensureDir(runtimeDir);
  ensureDir(path.join(runtimeDir, "backups"));
  ensureDir(path.join(runtimeDir, "logs"));

  const configPath = path.join(runtimeDir, "config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          installPath: "",
          selectedBlocks: {},
          blockParameterValues: {},
          lastMode: "check",
          lastRunAt: ""
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

function copyStaticAssets() {
  copyFile(path.join(srcDir, "renderer", "index.html"), path.join(appDir, "index.html"));
  copyFile(path.join(srcDir, "renderer", "styles.css"), path.join(appDir, "styles.css"));
}

function watchStaticAssets() {
  const files = [
    {
      from: path.join(srcDir, "renderer", "index.html"),
      to: path.join(appDir, "index.html")
    },
    {
      from: path.join(srcDir, "renderer", "styles.css"),
      to: path.join(appDir, "styles.css")
    }
  ];

  const watchers = files.map(({ from, to }) =>
    fs.watch(from, () => {
      try {
        copyFile(from, to);
        console.log(`[watch] copied ${path.relative(root, from)}`);
      } catch (error) {
        console.error(`[watch] failed to copy ${path.relative(root, from)}`, error);
      }
    })
  );

  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

async function buildOnce() {
  await build(getAppBuildOptions());
  await build(getRendererBuildOptions());
  await Promise.all(
    listBlockEntries(blocksSrcDir).map(({ entry, outfile }) => build(getBlockBuildOptions(entry, outfile)))
  );
}

async function watchAll() {
  const contexts = [
    await context(getAppBuildOptions()),
    await context(getRendererBuildOptions()),
    ...(await Promise.all(
      listBlockEntries(blocksSrcDir).map(({ entry, outfile }) => context(getBlockBuildOptions(entry, outfile)))
    ))
  ];

  for (const buildContext of contexts) {
    await buildContext.watch();
  }

  const stopStaticWatch = watchStaticAssets();
  console.log("[watch] build pipeline is watching for source changes");
  console.log("[watch] adding or removing Block files still requires restarting the watcher");

  const shutdown = async () => {
    stopStaticWatch();
    await Promise.all(contexts.map((buildContext) => buildContext.dispose()));
  };

  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}

async function main() {
  ensureDir(appDir);
  ensureDir(blocksDistDir);
  writeRuntimeFiles();
  copyStaticAssets();

  if (watchMode) {
    await watchAll();
    return;
  }

  await buildOnce();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
