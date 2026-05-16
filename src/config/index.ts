import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { AgentConfig } from "../types/index.js";

const DEFAULT_CONFIG: AgentConfig = {
  model: "minimax-m2.5-free",
  apiEndpoint: "https://opencode.ai/zen/v1",
  apiKey: process.env.OPENCODE_API_KEY || process.env.OPENAI_API_KEY || "",
  maxTurns: 50,
  sandbox: "restricted",
  approveCommands: ["npm test", "npm run", "git status", "git diff"],
  blockCommands: ["rm -rf /", "dd if=", ":(){ :|:& };:"],
  temperature: 0.7,
  timeout: 30000,
};

const CONFIG_FILENAME = "kamla.config.json";

export function findConfigFile(cwd: string = process.cwd()): string | null {
  let dir = cwd;
  while (dir !== homedir() && dir !== "/") {
    const configPath = join(dir, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      return configPath;
    }
    dir = join(dir, "..");
  }
  return null;
}

export function loadConfig(cwd: string = process.cwd()): AgentConfig {
  const configPath = findConfigFile(cwd);
  
  let fileConfig: Partial<AgentConfig> = {};
  if (configPath) {
    try {
      const content = readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(content);
    } catch (e) {
      console.warn(`Failed to load config from ${configPath}:`, e);
    }
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    apiKey: fileConfig.apiKey || process.env.OPENCODE_API_KEY || process.env.OPENAI_API_KEY || "",
  };
}

export function createDefaultConfig(cwd: string = process.cwd()): void {
  const configPath = join(cwd, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log(`Created default config at ${configPath}`);
  }
}

export function validateConfig(config: AgentConfig): string[] {
  const errors: string[] = [];
  
  if (!config.apiKey) {
    errors.push("API key is required (set apiKey in config or OPENAI_API_KEY env var)");
  }
  
  if (!config.model) {
    errors.push("Model is required");
  }
  
  if (config.maxTurns < 1 || config.maxTurns > 200) {
    errors.push("maxTurns must be between 1 and 200");
  }
  
  if (!["read-only", "restricted", "full"].includes(config.sandbox)) {
    errors.push("sandbox must be one of: read-only, restricted, full");
  }
  
  return errors;
}