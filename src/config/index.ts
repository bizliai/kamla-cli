import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { config as dotenvConfig } from "dotenv";
import { join } from "path";
import { homedir } from "os";
import type { AgentConfig } from "../types/index.js";
import Conf from "conf";

const schema = {
  model: { type: "string" as const, default: "opencode/minimax-m2.5-free" },
  maxTurns: { type: "number" as const, default: 50 },
  sandbox: { type: "string" as const, default: "restricted" },
  approveCommands: { type: "array" as const, items: { type: "string" as const }, default: ["npm test", "npm run", "git status", "git diff"] },
  blockCommands: { type: "array" as const, items: { type: "string" as const }, default: ["rm -rf /", "dd if=", ":(){ :|:& };:"] },
  temperature: { type: "number" as const, default: 0.7 },
  timeout: { type: "number" as const, default: 30000 },
  providers: { type: "object" as const, default: {} },
};

const globalConfig = new Conf({
  projectName: "kamla",
  schema,
});

const DEFAULT_CONFIG: AgentConfig = {
  model: "opencode/minimax-m2.5-free",
  maxTurns: 50,
  sandbox: "restricted",
  approveCommands: ["npm test", "npm run", "git status", "git diff"],
  blockCommands: ["rm -rf /", "dd if=", ":(){ :|:& };:"],
  temperature: 0.7,
  timeout: 30000,
  providers: {},
};

const CONFIG_FILENAME = "kamla.config.json";

export function findConfigFile(cwd: string = process.cwd()): string | null {
  let dir = cwd;
  while (dir !== homedir() && dir !== "/" && dir !== "") {
    const configPath = join(dir, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      return configPath;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadConfig(cwd: string = process.cwd()): AgentConfig {
  dotenvConfig(); // Load .env if present

  const configPath = findConfigFile(cwd);
  
  let fileConfig: Partial<AgentConfig> = {};
  if (configPath) {
    try {
      const content = readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(content);
    } catch (e) {
      console.warn(`Failed to load config from ${configPath}:`, e);
    }
  } else {
    // Load from global store if no local config
    fileConfig = globalConfig.store as Partial<AgentConfig>;
  }

  const config = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
  } as AgentConfig;

  // Backfill providers from environment variables (overriding file config for security)
  if (!config.providers) {
    config.providers = {};
  }

  const syncEnv = (id: string, envKey: string) => {
    const envValue = process.env[envKey];
    if (envValue) {
      config.providers![id] = { ...config.providers![id], apiKey: envValue };
    }
  };

  syncEnv("openai", "OPENAI_API_KEY");
  syncEnv("anthropic", "ANTHROPIC_API_KEY");
  syncEnv("opencode", "OPENCODE_API_KEY");
  syncEnv("google", "GOOGLE_API_KEY");
  syncEnv("mistral", "MISTRAL_API_KEY");
  syncEnv("groq", "GROQ_API_KEY");

  return config;
}

export function saveGlobalConfig(config: Partial<AgentConfig>): void {
  globalConfig.set(config);
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

export function needsSetup(cwd: string = process.cwd()): boolean {
  // Check local first
  const configPath = join(cwd, CONFIG_FILENAME);
  if (existsSync(configPath)) {
    try {
      const content = JSON.parse(readFileSync(configPath, "utf-8"));
      if (content.model) return false;
    } catch {}
  }

  // Check global
  const config = loadConfig(cwd);
  const [providerId] = config.model.split("/");
  const providerConfig = config.providers?.[providerId];
  
  return !providerConfig?.apiKey && !process.env[`${providerId.toUpperCase()}_API_KEY`];
}