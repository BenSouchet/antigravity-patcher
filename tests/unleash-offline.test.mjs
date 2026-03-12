import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createInstallFixture, createTestContext, loadBuiltBlock, makeTempDir } from "./helpers.mjs";

test("unleash-offline short-circuits fetches and suppresses Unleash log noise", async () => {
  const installRoot = makeTempDir("agp-unleash-");
  createInstallFixture(installRoot, {
    "resources/app/extensions/antigravity/dist/extension.js":
      'function getProvider(){if(!R.instance)throw new Error("UnleashProvider must be initialized first!");return R.instance}',
    "resources/app/out/vs/workbench/workbench.desktop.main.js":
      'const service={r(e){const i=ETu,n=`https://127.0.0.1:${e}/proxy/unleash/frontend`;try{return new bTu({url:n,appName:yTu,clientKey:i,context:this.w(),usePOSTrequests:!0})}catch(s){console.debug("[AntigravityUnleashService] Failed to initialize Unleash client:",s)}},t(e,i=!0){(hRe(this.n)||!i)&&console.log(`[AntigravityUnleashService] ${e}`)}};'
  });

  const block = loadBuiltBlock("runtime/unleash-offline.js");
  const context = createTestContext(installRoot);
  const result = await block.apply(context);

  assert.equal(result.status, "applied");

  const extensionJs = fs.readFileSync(
    path.join(installRoot, "resources/app/extensions/antigravity/dist/extension.js"),
    "utf8"
  );
  const workbenchJs = fs.readFileSync(
    path.join(installRoot, "resources/app/out/vs/workbench/workbench.desktop.main.js"),
    "utf8"
  );

  assert.match(extensionJs, /getVariantFloat:\(e,t=.01\)=>t/);
  assert.match(extensionJs, /getVariantBoolean:\(e,t=!1\)=>t/);
  assert.match(extensionJs, /getVariantString:\(e,t=""\)=>t/);
  assert.ok(!workbenchJs.includes("proxy/unleash/frontend"));
  assert.ok(!workbenchJs.includes("[AntigravityUnleashService]"));
  assert.ok(workbenchJs.includes("r(e){return null}"));
  assert.ok(workbenchJs.includes("t(e,i=!0){}"));
});
