import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { AgentConfig } from "../types/index.js";

const DEFAULT_CONFIG: AgentConfig = {
  model: "opencode/minimax-m2.5-free",
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

  const config = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
  };

  // Backfill providers from legacy env vars if needed
  if (!config.providers) {
    config.providers = {};
  }

  if (process.env.OPENAI_API_KEY && !config.providers.openai) {
    config.providers.openai = { apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY && !config.providers.anthropic) {
    config.providers.anthropic = { apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENCODE_API_KEY && !config.providers.opencode) {
    config.providers.opencode = { apiKey: process.env.OPENCODE_API_KEY };
  }

  return config;
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
  
  if (!config.model) {
    errors.push("Model is required");
  }

  const [providerId] = config.model.split("/");
  if (providerId && config.providers) {
    const providerConfig = config.providers[providerId];
    const envKey = `${providerId.toUpperCase()}_API_KEY`;
    if (!providerConfig?.apiKey && !process.env[envKey] && !config.apiKey) {
      errors.push(`API key for provider '${providerId}' is missing (set in config or ${envKey} env var)`);
    }
  }
  
  if (config.maxTurns < 1 || config.maxTurns > 200) {
    errors.push("maxTurns must be between 1 and 200");
  }
  
  if (!["read-only", "restricted", "full"].includes(config.sandbox)) {
    errors.push("sandbox must be one of: read-only, restricted, full");
  }
  
  return errors;
}