import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createInstallFixture, createTestContext, loadBuiltBlock, makeTempDir } from "./helpers.mjs";

test("auto-retry applies configured retry delay and limit to both runtime targets", async () => {
  const installRoot = makeTempDir("agp-autoretry-");
  createInstallFixture(installRoot, {
    "resources/app/out/vs/workbench/workbench.desktop.main.js": 'const x=a("Try again","Try again");',
    "resources/app/out/jetskiAgent/main.js": 'const y=b("Retry","Continue");'
  });

  const block = loadBuiltBlock("automation/auto-retry.js");
  const context = createTestContext(installRoot, { delayMs: 1750, maxRetries: 7 });
  const firstRun = await block.apply(context);

  assert.equal(firstRun.status, "applied");

  const workbenchJs = fs.readFileSync(
    path.join(installRoot, "resources/app/out/vs/workbench/workbench.desktop.main.js"),
    "utf8"
  );
  const jetskiAgentJs = fs.readFileSync(
    path.join(installRoot, "resources/app/out/jetskiAgent/main.js"),
    "utf8"
  );

  for (const content of [workbenchJs, jetskiAgentJs]) {
    assert.ok(content.includes("/*AGP:autoretry*/"));
    assert.ok(content.includes("window.__agp_rt"));
    assert.ok(content.includes("setTimeout(()=>{_r.t=null;_a.onClick()},1750)"));
    assert.ok(content.includes('console.log("[AGP] Auto-retry #"+_r.c+"/7 in 1.75s'));
  }

  const secondRun = await block.apply(context);
  assert.equal(secondRun.status, "skipped");
});
