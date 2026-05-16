import { intro, outro, select, text, password, spinner, note, isCancel, cancel } from "@clack/prompts";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { isTTY } from "../cli/utils.js";
import { saveGlobalConfig } from "./index.js";
import { kamlaGradient } from "../cli/tui.js";

export interface ProviderConfig {
  name: string;
  id: string;
  apiEndpoint?: string;
  model?: string;
  models?: string[];
}

export const PROVIDERS: ProviderConfig[] = [
  {
    name: "Google Gemini",
    id: "google",
  },
  {
    name: "OpenAI",
    id: "openai",
  },
  {
    name: "Anthropic",
    id: "anthropic",
  },
  {
    name: "Mistral",
    id: "mistral",
  },
  {
    name: "Groq",
    id: "groq",
  },
];

const CONFIG_FILENAME = "kamla.config.json";

export interface SetupOptions {
  provider?: string;
  apiKey?: string;
  model?: string;
  sandbox?: string;
  global?: boolean;
}

function handleCancel(value: any) {
  if (isCancel(value)) {
    cancel("Setup cancelled.");
    process.exit(0);
  }
  return value;
}

export async function getModelsData() {
  try {
    const response = await fetch("https://models.dev/api.json");
    if (!response.ok) return null;
    return await response.json() as Record<string, any>;
  } catch {
    return null;
  }
}

export async function runSetup(cwd: string = process.cwd(), opts?: SetupOptions): Promise<void> {
  intro(kamlaGradient(" Kamla Setup "));

  let answers: any = {};

  if (!isTTY() || (opts?.provider && opts?.apiKey)) {
    const providerId = opts?.provider || "google";
    const apiKey = opts?.apiKey;
    
    if (!apiKey) {
      cancel(`Error: API key required for provider '${providerId}'.`);
      process.exit(1);
    }

    answers = {
      provider: providerId,
      apiKey: apiKey,
      model: opts?.model || PROVIDERS.find((p) => p.id === providerId)?.model || `${providerId}/default`,
      sandbox: opts?.sandbox || "restricted",
    };
  } else {
    const s = spinner();
    s.start("Fetching models database from models.dev...");
    const modelsDev = await getModelsData();
    if (modelsDev) {
      s.stop("Models database loaded.");
    } else {
      s.stop("Failed to load models database. Using offline defaults.");
    }

    const providerId = handleCancel(await select({
      message: "Which LLM provider do you want to use?",
      options: [
        ...PROVIDERS.map((p) => ({
          label: p.name,
          value: p.id,
        })),
        { label: "Other / Browse models.dev", value: "other" },
      ],
      initialValue: "google",
    }));

    let finalProviderId = providerId;
    let providerFromDev: any = null;

    if (providerId === "other") {
      if (modelsDev) {
        let providerChoices = Object.values(modelsDev).sort((a: any, b: any) => a.name.localeCompare(b.name));
        let filteredProviders = providerChoices;
        
        while (true) {
          const devProviderId = handleCancel(await select({
            message: "Select a provider from models.dev:",
            options: [
              { label: "🔍 Search providers...", value: "search" },
              ...filteredProviders.slice(0, 50).map((p: any) => ({
                label: p.name,
                value: p.id,
                hint: p.api
              }))
            ]
          }));

          if (devProviderId === "search") {
            const searchTerm = handleCancel(await text({
              message: "Enter search term for provider:",
              placeholder: "e.g. together, fireworks, ollama..."
            }));
            filteredProviders = providerChoices.filter((p: any) => 
              p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
              p.id.toLowerCase().includes(searchTerm.toLowerCase())
            );
            continue;
          }

          finalProviderId = devProviderId;
          providerFromDev = modelsDev[devProviderId];
          break;
        }
      } else {
        finalProviderId = handleCancel(await text({ message: "Enter provider ID:" }));
      }
    } else {
      if (modelsDev && modelsDev[providerId]) {
        providerFromDev = modelsDev[providerId];
      }
    }

    const apiKey = handleCancel(await password({
      message: `Enter your API key for ${providerFromDev?.name || finalProviderId}:`,
      validate: (input?: string) => {
        if (!input || input.trim().length < 5) {
          return "Please enter a valid API key";
        }
      },
    }));

    const providerConfig = PROVIDERS.find(p => p.id === finalProviderId);
    let baseURL = providerFromDev?.api || providerConfig?.apiEndpoint;
    if (providerId === "other" && !providerFromDev) {
      baseURL = handleCancel(await text({
        message: "Base URL (optional, e.g. http://localhost:11434/v1):",
      }));
    }

    // Now offer model selection based on provider
    let modelChoices: string[] = [];
    
    if (providerFromDev) {
      modelChoices = Object.keys(providerFromDev.models).map(m => `${finalProviderId}/${m}`);
    } else if (providerConfig) {
      modelChoices = providerConfig.models || [];
    }

    let selectedModel;
    if (modelChoices.length > 0) {
      let filteredModels = modelChoices;
      while (true) {
        selectedModel = handleCancel(await select({
          message: "Select a model:",
          options: [
            { label: "🔍 Search models...", value: "search" },
            ...filteredModels.slice(0, 50).map(m => ({ label: m, value: m })),
            { label: "Enter custom model ID", value: "custom" },
          ],
        }));

        if (selectedModel === "search") {
          const searchTerm = handleCancel(await text({
            message: "Enter search term for model:",
            placeholder: "e.g. gpt-4, claude, llama..."
          }));
          filteredModels = modelChoices.filter(m => m.toLowerCase().includes(searchTerm.toLowerCase()));
          continue;
        }
        break;
      }
    }

    if (!selectedModel || selectedModel === "custom") {
      selectedModel = handleCancel(await text({
        message: "Enter custom model ID (e.g. 'openai/gpt-4o'):",
        placeholder: providerFromDev?.model ? `${finalProviderId}/${providerFromDev.model}` : (providerConfig?.model || "provider/model"),
      }));
    }

    const sandbox = handleCancel(await select({
      message: "Sandbox mode (controls what the agent can do):",
      options: [
        { label: "Read-only - Can only read files (safest)", value: "read-only" },
        { label: "Restricted - Can read/write and run safe commands", value: "restricted" },
        { label: "Full - Can do anything (use with caution)", value: "full" },
      ],
      initialValue: "restricted",
    }));

    const saveMode = handleCancel(await select({
      message: "Where do you want to save this configuration?",
      options: [
        { label: "Global - Save to your home directory (recommended)", value: "global" },
        { label: "Local - Save to current directory (kamla.config.json)", value: "local" },
      ],
      initialValue: "global",
    }));

    answers = {
      provider: finalProviderId,
      apiKey: apiKey,
      baseURL: baseURL,
      model: selectedModel,
      sandbox: sandbox,
      saveMode: saveMode,
    };
  }

  const config: any = {
    model: answers.model,
    providers: {
      [answers.provider]: {
        apiKey: answers.apiKey,
        baseURL: answers.baseURL,
      },
    },
    sandbox: answers.sandbox,
  };

  if (answers.saveMode === "global" || opts?.global) {
    saveGlobalConfig(config);
    note("Global configuration saved successfully!", "Success");
  } else {
    // For local setup, we save non-sensitive config to kamla.config.json
    // and sensitive keys to .env (which should be git-ignored)
    const configPath = join(cwd, CONFIG_FILENAME);
    const envPath = join(cwd, ".env");

    const providerId = answers.provider;
    const apiKey = answers.apiKey;
    const envVarName = `${providerId.toUpperCase()}_API_KEY`;

    // Remove apiKey from the config that gets saved to JSON
    if (config.providers && config.providers[providerId]) {
      delete config.providers[providerId].apiKey;
    }

    writeFileSync(configPath, JSON.stringify({
      ...config,
      maxTurns: 50,
      approveCommands: ["npm test", "npm run", "git status", "git diff"],
      blockCommands: ["rm -rf /", "dd if=", ":(){ :|:& };:"],
      temperature: 0.7,
      timeout: 30000,
    }, null, 2));

    // Append/Write to .env
    const envLine = `${envVarName}=${apiKey}\n`;
    try {
      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, "utf-8");
        if (!envContent.includes(envVarName)) {
          appendFileSync(envPath, `\n${envLine}`);
        } else {
          // Update existing line
          const lines = envContent.split("\n");
          const newLines = lines.map(line => line.startsWith(`${envVarName}=`) ? `${envVarName}=${apiKey}` : line);
          writeFileSync(envPath, newLines.join("\n"));
        }
      } else {
        writeFileSync(envPath, envLine);
      }
      note(
        `Configuration saved!\n\n` +
        `• Settings: ${chalk.cyan(configPath)}\n` +
        `• API Key:  ${chalk.cyan(envPath)} (Git-ignored)`,
        "Success"
      );
    } catch (err) {
      note(
        `Could not save API key to .env: ${err}\n` +
        `Non-sensitive configuration saved to ${configPath}`,
        "Warning"
      );
    }
  }

  outro(`You can now use ${chalk.cyan("kamla chat")} to start.`);
}