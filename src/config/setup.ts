import inquirer from "inquirer";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { isTTY } from "../cli/utils.js";
import { saveGlobalConfig } from "./index.js";

export interface ProviderConfig {
  name: string;
  id: string;
  apiEndpoint?: string;
  model: string;
  models?: string[];
}

export const PROVIDERS: ProviderConfig[] = [
  {
    name: "Google Gemini",
    id: "google",
    model: "google/gemini-1.5-pro",
    models: ["google/gemini-1.5-pro", "google/gemini-1.5-flash", "google/gemini-2.0-flash-exp"],
  },
  {
    name: "OpenAI",
    id: "openai",
    model: "openai/gpt-4o",
    models: ["openai/gpt-4o", "openai/gpt-4o-mini", "openai/gpt-3.5-turbo"],
  },
  {
    name: "Anthropic",
    id: "anthropic",
    model: "anthropic/claude-3-5-sonnet-20240620",
    models: ["anthropic/claude-3-5-sonnet-20240620", "anthropic/claude-3-opus-20240229", "anthropic/claude-3-haiku-20240307"],
  },

  {
    name: "Mistral",
    id: "mistral",
    model: "mistral/mistral-large-latest",
    models: ["mistral/mistral-large-latest", "mistral/mistral-small-latest"],
  },
  {
    name: "Groq",
    id: "groq",
    model: "groq/llama3-70b-8192",
    models: ["groq/llama3-70b-8192", "groq/llama3-8b-8192", "groq/mixtral-8x7b-32768"],
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

export async function runSetup(cwd: string = process.cwd(), opts?: SetupOptions): Promise<void> {
  console.log(chalk.cyan("\n🚀 Welcome to Kamla!\n"));
  console.log(chalk.gray("Let's set up your configuration.\n"));

  let answers: any;

  if (!isTTY() || (opts?.provider && opts?.apiKey)) {
    const providerId = opts?.provider || "google";
    const apiKey = opts?.apiKey;
    
    if (!apiKey) {
      console.log(chalk.red(`Error: API key required for provider '${providerId}'.`));
      process.exit(1);
    }

    answers = {
      provider: providerId,
      apiKey: apiKey,
      model: opts?.model || PROVIDERS.find((p) => p.id === providerId)?.model || `${providerId}/default`,
      sandbox: opts?.sandbox || "restricted",
    };
  } else {
    const providerResponse = await inquirer.prompt([
      {
        type: "list",
        name: "provider",
        message: "Which LLM provider do you want to use?",
        choices: [
          ...PROVIDERS.map((p) => ({
            name: p.name,
            value: p.id,
          })),
          { name: "Other (OpenAI Compatible)", value: "other" },
        ],
        default: "google",
      },
    ]);

    const finalProviderId = providerResponse.provider === "other" 
      ? (await inquirer.prompt([{ type: "input", name: "id", message: "Enter provider ID:" }])).id
      : providerResponse.provider;

    const apiKeyResponse = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: `Enter your API key for ${finalProviderId}:`,
        mask: "*",
        validate: (input: string) => {
          if (!input || input.trim().length < 5) {
            return "Please enter a valid API key";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "baseURL",
        message: "Base URL (optional, e.g. http://localhost:11434/v1):",
        when: () => providerResponse.provider === "other",
      },
    ]);

    // Now offer model selection based on provider
    const providerConfig = PROVIDERS.find(p => p.id === finalProviderId);
    const modelChoices = providerConfig?.models || [];

    const modelResponse = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Select a model:",
        choices: [...modelChoices, "Enter custom model ID"],
        when: () => modelChoices.length > 0,
      },
      {
        type: "input",
        name: "customModel",
        message: "Enter custom model ID (e.g. 'openai/gpt-4o'):",
        when: (a) => a.model === "Enter custom model ID" || modelChoices.length === 0,
      },
    ]);

    const sandboxResponse = await inquirer.prompt([
      {
        type: "list",
        name: "sandbox",
        message: "Sandbox mode (controls what the agent can do):",
        choices: [
          { name: "Read-only - Can only read files (safest)", value: "read-only" },
          { name: "Restricted - Can read/write and run safe commands", value: "restricted" },
          { name: "Full - Can do anything (use with caution)", value: "full" },
        ],
        default: "restricted",
      },
    ]);

    const saveModeResponse = await inquirer.prompt([
      {
        type: "list",
        name: "saveMode",
        message: "Where do you want to save this configuration?",
        choices: [
          { name: "Global - Save to your home directory (recommended for general use)", value: "global" },
          { name: "Local - Save to current directory (kamla.config.json)", value: "local" },
        ],
        default: "global",
      },
    ]);

    answers = {
      provider: finalProviderId,
      apiKey: apiKeyResponse.apiKey,
      baseURL: apiKeyResponse.baseURL,
      model: modelResponse.customModel || modelResponse.model,
      sandbox: sandboxResponse.sandbox,
      saveMode: saveModeResponse.saveMode,
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
    console.log(chalk.green("\n✅ Global configuration saved!"));
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
      console.log(chalk.green("\n✅ Configuration saved!"));
      console.log(chalk.gray(`- Settings: ${configPath}`));
      console.log(chalk.gray(`- API Key:  ${envPath} (Git-ignored)`));
    } catch (err) {
      console.warn(chalk.yellow(`\n⚠️  Could not save API key to .env: ${err}`));
      console.log(chalk.green("✅ Non-sensitive configuration saved to ") + chalk.gray(configPath));
    }
  }

  console.log(chalk.gray("\nYou can now use ") + chalk.cyan("kamla chat") + chalk.gray(" to start.\n"));
}