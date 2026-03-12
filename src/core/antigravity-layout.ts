import path from "node:path";

export function appResourcePath(installPath: string, relativePath: string): string {
  return path.join(installPath, "resources", "app", ...relativePath.split("/"));
}

export function antigravityFiles(installPath: string): Record<string, string> {
  return {
    productJson: appResourcePath(installPath, "product.json"),
    packageJson: appResourcePath(installPath, "package.json"),
    antigravityPackageJson: appResourcePath(installPath, "extensions/antigravity/package.json"),
    gitPackageJson: appResourcePath(installPath, "extensions/git/package.json"),
    extensionJs: appResourcePath(installPath, "extensions/antigravity/dist/extension.js"),
    workbenchJs: appResourcePath(installPath, "out/vs/workbench/workbench.desktop.main.js"),
    workbenchHtml: appResourcePath(installPath, "out/vs/code/electron-browser/workbench/workbench.html"),
    workbenchJetskiHtml: appResourcePath(installPath, "out/vs/code/electron-browser/workbench/workbench-jetski-agent.html"),
    workbenchBootstrapJs: appResourcePath(installPath, "out/vs/code/electron-browser/workbench/workbench.js"),
    jetskiAgentJs: appResourcePath(installPath, "out/jetskiAgent/main.js"),
    chromeDevtoolsPackageJson: appResourcePath(installPath, "extensions/chrome-devtools-mcp/package.json"),
    chromeDevtoolsMcpPackageJson: appResourcePath(installPath, "extensions/chrome-devtools-mcp/cdt_mcp/package.json")
  };
}
