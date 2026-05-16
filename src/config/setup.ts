import inquirer from "inquirer";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { isTTY } from "../cli/utils.js";

export interface ProviderConfig {
  name: string;
  id: string;
  apiEndpoint: string;
  model: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    name: "OpenAI",
    id: "openai",
    apiEndpoint: "https://api.openai.com/v1",
    model: "gpt-4",
  },
  {
    name: "OpenCode Zen (OpenAI Compatible)",
    id: "opencode",
    apiEndpoint: "https://opencode.ai/zen/v1",
    model: "minimax-m2.5-free",
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
    const apiKey = opts?.apiKey || process.env.OPENCODE_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log(chalk.red("Error: API key required. Set OPENCODE_API_KEY or OPENAI_API_KEY env variable, or run with interactive mode."));
      console.log(chalk.gray("\nOr use: kamla setup --provider opencode --apiKey YOUR_KEY\n"));
      process.exit(1);
    }

    answers = {
      provider: opts?.provider || "opencode",
      apiKey: apiKey,
      model: opts?.model || PROVIDERS.find((p) => p.id === (opts?.provider || "opencode"))?.model || "gpt-4",
      sandbox: opts?.sandbox || "restricted",
    };
  } else {
    answers = await inquirer.prompt([
      {
        type: "list",
        name: "provider",
        message: "Which LLM provider do you want to use?",
        choices: PROVIDERS.map((p) => ({
          name: p.name,
          value: p.id,
        })),
        default: "opencode",
      },
      {
        type: "password",
        name: "apiKey",
        message: "Enter your API key:",
        mask: "*",
        validate: (input: string) => {
          if (!input || input.trim().length < 10) {
            return "Please enter a valid API key";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "model",
        message: "Model name (press Enter for default):",
        default: (answers: { provider: string }) => {
          const provider = PROVIDERS.find((p) => p.id === answers.provider);
          return provider?.model || "gpt-4";
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

  const provider = PROVIDERS.find((p) => p.id === answers.provider)!;

  const config = {
    model: answers.model || provider.model,
    apiEndpoint: provider.apiEndpoint,
    apiKey: answers.apiKey,
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
  console.log(chalk.gray("\nYou can always edit this file or run ") + chalk.cyan("kamla config") + chalk.gray(" to view it.\n"));
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