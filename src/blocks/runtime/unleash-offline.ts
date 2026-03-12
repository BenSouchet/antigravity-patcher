import { antigravityFiles } from "../../core/antigravity-layout";
import { readTextFile, validateJavaScript, writeTextFile } from "../../core/file-utils";
import { replaceExactIfPresent } from "../../core/patch-helpers";
import { BlockDefinition } from "../../core/types";

const block: BlockDefinition = {
  id: "unleash-offline",
  name: "Unleash Offline",
  description: "Disable the Unleash network path, keep the extension on a safe local fallback, and silence remaining Unleash log noise.",
  category: "runtime",
  executionOrder: 4,
  defaultEnabled: true,
  parameters: [],
  async check(context) {
    const files = antigravityFiles(context.installPath);
    return {
      status: "skipped",
      message: "Unleash runtime targets detected.",
      touchedFiles: [files.extensionJs, files.workbenchJs]
    };
  },
  async apply(context) {
    const files = antigravityFiles(context.installPath);
    let extensionJs = readTextFile(files.extensionJs);
    let workbenchJs = readTextFile(files.workbenchJs);

    extensionJs = {
      ...extensionJs,
      text: replaceExactIfPresent(
        extensionJs.text,
        'if(!R.instance)throw new Error("UnleashProvider must be initialized first!");return R.instance',
        'if(!R.instance)R.instance={isEnabled:()=>false,getVariant:()=>({name:"disabled",enabled:false,payload:{type:"string",value:""}}),getVariantFloat:(e,t=.01)=>t,getVariantBoolean:(e,t=!1)=>t,getVariantString:(e,t="")=>t};return R.instance'
      ).content
    };
    extensionJs = {
      ...extensionJs,
      text: replaceExactIfPresent(
        extensionJs.text,
        'if(!R.instance)R.instance={isEnabled:()=>false,getVariant:()=>({name:"disabled",enabled:false,payload:{type:"string",value:""}})};return R.instance;return R.instance',
        'if(!R.instance)R.instance={isEnabled:()=>false,getVariant:()=>({name:"disabled",enabled:false,payload:{type:"string",value:""}}),getVariantFloat:(e,t=.01)=>t,getVariantBoolean:(e,t=!1)=>t,getVariantString:(e,t="")=>t};return R.instance'
      ).content
    };

    workbenchJs = {
      ...workbenchJs,
      text: replaceExactIfPresent(
        workbenchJs.text,
        'r(e){const i=ETu,n=`https://127.0.0.1:${e}/proxy/unleash/frontend`;try{return new bTu({url:n,appName:yTu,clientKey:i,context:this.w(),usePOSTrequests:!0})}catch(s){console.debug("[AntigravityUnleashService] Failed to initialize Unleash client:",s)}}',
        'r(e){return null}'
      ).content
    };
    workbenchJs = {
      ...workbenchJs,
      text: replaceExactIfPresent(
        workbenchJs.text,
        't(e,i=!0){(hRe(this.n)||!i)&&console.log(`[AntigravityUnleashService] ${e}`)}',
        't(e,i=!0){}'
      ).content
    };

    await validateJavaScript(extensionJs.text, "extension.js");
    await validateJavaScript(workbenchJs.text, "workbench.desktop.main.js");
    context.backups.backupFile(files.extensionJs);
    context.backups.backupFile(files.workbenchJs);
    writeTextFile(files.extensionJs, extensionJs.text, extensionJs.hasBom);
    writeTextFile(files.workbenchJs, workbenchJs.text, workbenchJs.hasBom);

    context.logger.info("Short-circuited Unleash client creation and logging.", "unleash-offline");
    return {
      status: "applied",
      message: "Unleash was forced offline and log noise was suppressed.",
      touchedFiles: [files.extensionJs, files.workbenchJs]
    };
  },
  async revert(context) {
    const touched = context.backups.listBackups().filter((filePath) => context.backups.restoreFile(filePath));
    return {
      status: touched.length > 0 ? "reverted" : "skipped",
      message: touched.length > 0 ? "Restored Unleash-related backups." : "No Unleash backups were available.",
      touchedFiles: touched
    };
  }
};

export default block;
