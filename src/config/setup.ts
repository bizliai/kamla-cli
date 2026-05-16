import inquirer from "inquirer";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { isTTY } from "../cli/utils.js";

export interface ProviderConfig {
  name: string;
  id: string;
  apiEndpoint?: string;
  model: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    name: "OpenCode Zen (Free)",
    id: "opencode",
    model: "opencode/minimax-m2.5-free",
  },
  {
    name: "OpenAI",
    id: "openai",
    model: "openai/gpt-4o",
  },
  {
    name: "Anthropic",
    id: "anthropic",
    model: "anthropic/claude-3-5-sonnet-20240620",
  },
  {
    name: "Google Gemini",
    id: "google",
    model: "google/gemini-1.5-pro",
  },
  {
    name: "Mistral",
    id: "mistral",
    model: "mistral/mistral-large-latest",
  },
  {
    name: "Groq",
    id: "groq",
    model: "groq/llama3-70b-8192",
  },
];

const CONFIG_FILENAME = "kamla.config.json";

export interface SetupOptions {
  provider?: string;
  apiKey?: string;
  model?: string;
  sandbox?: string;
}

export async function runSetup(cwd: string = process.cwd(), opts?: SetupOptions): Promise<void> {
  console.log(chalk.cyan("\n🚀 Welcome to Kamla!\n"));
  console.log(chalk.gray("Let's set up your configuration.\n"));

  let answers: {
    provider: string;
    apiKey: string;
    model: string;
    sandbox: string;
  };

  if (!isTTY() || opts?.provider) {
    const providerId = opts?.provider || "opencode";
    const envKey = `${providerId.toUpperCase()}_API_KEY`;
    const apiKey = opts?.apiKey || process.env[envKey] || process.env.OPENAI_API_KEY || process.env.OPENCODE_API_KEY;
    
    if (!apiKey) {
      console.log(chalk.red(`Error: API key required for provider '${providerId}'. Set ${envKey} env variable, or run with interactive mode.`));
      process.exit(1);
    }

    answers = {
      provider: providerId,
      apiKey: apiKey,
      model: opts?.model || PROVIDERS.find((p) => p.id === providerId)?.model || `${providerId}/default`,
      sandbox: opts?.sandbox || "restricted",
    };
  } else {
    answers = await inquirer.prompt([
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
        default: "opencode",
      },
      {
        type: "input",
        name: "customProvider",
        message: "Enter provider ID (e.g. 'local'):",
        when: (a) => a.provider === "other",
      },
      {
        type: "input",
        name: "baseURL",
        message: "Base URL (e.g. http://localhost:11434/v1):",
        when: (a) => a.provider === "other",
      },
      {
        type: "password",
        name: "apiKey",
        message: "Enter your API key:",
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
        name: "model",
        message: "Model ID (e.g. 'openai/gpt-4o'):",
        default: (a: any) => {
          const provider = PROVIDERS.find((p) => p.id === a.provider);
          return provider?.model || (a.customProvider ? `${a.customProvider}/model` : "openai/gpt-4o");
        },
      },
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
  }

  const finalProviderId = answers.provider === "other" ? (answers as any).customProvider : answers.provider;
  
  const config: any = {
    model: answers.model,
    providers: {
      [finalProviderId]: {
        apiKey: answers.apiKey,
        baseURL: (answers as any).baseURL,
      },
    },
    maxTurns: 50,
    sandbox: answers.sandbox,
    approveCommands: ["npm test", "npm run", "git status", "git diff"],
    blockCommands: ["rm -rf /", "dd if=", ":(){ :|:& };:"],
    temperature: 0.7,
    timeout: 30000,
  };

  const configPath = join(cwd, CONFIG_FILENAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(chalk.green("\n✅ Configuration saved to ") + chalk.gray(configPath));
  console.log(chalk.gray("\nYou can now use ") + chalk.cyan(`kamla chat --model ${answers.model}`) + chalk.gray(" to start.\n"));
}

export function needsSetup(cwd: string = process.cwd()): boolean {
  const configPath = join(cwd, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    return true;
  }

  try {
    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    return !content.apiKey || content.apiKey === "";
  } catch {
    return true;
  }
}