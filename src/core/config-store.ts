import fs from "node:fs";
import { AppConfig } from "./types";
import { getConfigPath } from "./runtime-paths";
import { writeJsonFile } from "./file-utils";

const defaultConfig: AppConfig = {
  installPath: "",
  selectedBlocks: {},
  blockParameterValues: {},
  lastMode: "apply",
  lastRunAt: ""
};

export class ConfigStore {
  load(): AppConfig {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      this.save(defaultConfig);
      return { ...defaultConfig };
    }

    try {
      const loaded = {
        ...defaultConfig,
        ...(JSON.parse(fs.readFileSync(configPath, "utf8")) as AppConfig)
      };

      if (!loaded.lastRunAt && loaded.lastMode === "check") {
        loaded.lastMode = "apply";
      }

      return loaded;
    } catch {
      this.save(defaultConfig);
      return { ...defaultConfig };
    }
  }

  save(config: AppConfig): AppConfig {
    writeJsonFile(getConfigPath(), config);
    return config;
  }
}
