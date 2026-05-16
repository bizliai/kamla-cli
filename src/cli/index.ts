#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, validateConfig, saveGlobalConfig, needsSetup } from "../config/index.js";
import { runSetup, PROVIDERS } from "../config/setup.js";
import { Agent } from "../core/agent.js";
import chalk from "chalk";
import ora from "ora";
import { stdin as input, stdout as output } from "process";
import readline from "readline";
import inquirer from "inquirer";

async function ensureConfig(opts?: { provider?: string; apiKey?: string; model?: string; sandbox?: string }): Promise<void> {
  if (needsSetup()) {
    console.log(chalk.yellow("No configuration found. Let's set up Kamla!\n"));
    await runSetup(process.cwd(), opts);
  }
}

const program = new Command();

program
  .name("kamla")
  .description("Code, create, and automate with AI")
  .version("1.0.0");

program
  .option("-p, --provider <provider>", "LLM provider (openai, anthropic, google, etc.)")
  .option("-k, --api-key <key>", "API key")
  .option("-m, --model <model>", "Model name (e.g. provider/model)")
  .option("-s, --sandbox <mode>", "Sandbox mode (read-only, restricted, full)");

program
  .command("chat")
  .description("Start an interactive chat session")
  .option("-m, --model <model>", "Model to use")
  .option("-s, --sandbox <mode>", "Sandbox mode (read-only, restricted, full)")
  .action(async (opts, cmd) => {
    const parentOpts = cmd.parent?.opts();
    await ensureConfig({
      provider: parentOpts?.provider,
      apiKey: parentOpts?.apiKey,
      model: parentOpts?.model,
      sandbox: parentOpts?.sandbox,
    });
    const config = loadConfig();
    if (opts.model) config.model = opts.model;
    if (opts.sandbox) config.sandbox = opts.sandbox as "read-only" | "restricted" | "full";

    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.error(chalk.red("Configuration errors:"));
      errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }

    await startChat(config);
  });

program
  .command("run <task>")
  .description("Run a task autonomously")
  .option("-m, --model <model>", "Model to use")
  .option("-s, --sandbox <mode>", "Sandbox mode")
  .option("--no-stream", "Disable streaming output")
  .action(async (task, opts, cmd) => {
    const parentOpts = cmd.parent?.opts();
    await ensureConfig({
      provider: parentOpts?.provider,
      apiKey: parentOpts?.apiKey,
      model: parentOpts?.model,
      sandbox: parentOpts?.sandbox,
    });
    const config = loadConfig();
    if (opts.model) config.model = opts.model;
    if (opts.sandbox) config.sandbox = opts.sandbox as "read-only" | "restricted" | "full";

    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.error(chalk.red("Configuration errors:"));
      errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }

    await runTask(config, task, opts.stream ?? true);
  });

program
  .command("model")
  .description("Change the current model")
  .action(async () => {
    const config = loadConfig();
    const [currentProvider] = config.model.split("/");
    const providerConfig = PROVIDERS.find(p => p.id === currentProvider);
    const models = providerConfig?.models || [];

    const { model } = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Select a model:",
        choices: [...models, "Enter custom model ID"],
        default: config.model,
      },
    ]);

    let finalModel = model;
    if (model === "Enter custom model ID") {
      const { customModel } = await inquirer.prompt([{ type: "input", name: "customModel", message: "Enter model ID:" }]);
      finalModel = customModel;
    }

    saveGlobalConfig({ model: finalModel });
    console.log(chalk.green(`Model updated to: ${finalModel}`));
  });

program
  .command("provider")
  .description("Change the current provider")
  .action(async () => {
    await runSetup(process.cwd(), { global: true });
  });

const setupAction = async (opts: any) => {
  await runSetup(process.cwd(), opts);
};

program
  .command("init")
  .description("Initialize configuration (alias for setup)")
  .option("-p, --provider <provider>", "LLM provider")
  .option("-k, --api-key <key>", "API key")
  .option("-m, --model <model>", "Model name")
  .option("-s, --sandbox <mode>", "Sandbox mode")
  .action(setupAction);

program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.gray("Current configuration:"));
    console.log(JSON.stringify(config, null, 2));
  });

program
  .command("setup")
  .description("Run the setup wizard")
  .option("-p, --provider <provider>", "LLM provider")
  .option("-k, --api-key <key>", "API key")
  .option("-m, --model <model>", "Model name")
  .option("-s, --sandbox <mode>", "Sandbox mode")
  .action(setupAction);

// Default action: if no command is provided, check config and start chat or setup
program.action(async () => {
  if (needsSetup()) {
    await runSetup();
  } else {
    const config = loadConfig();
    await startChat(config);
  }
});

program.parse();

async function startChat(config: ReturnType<typeof loadConfig>): Promise<void> {
  let currentConfig = { ...config };
  const spinner = ora("Starting agent...").start();

  let agent = new Agent({
    config: currentConfig,
    onToolCall: (tc) => {
      spinner.info(chalk.blue(`Executing tool: ${tc.name}`));
    },
    onToolResult: (tr) => {
      if (tr.is_error) {
        console.error(chalk.red(`Tool error: ${tr.output.slice(0, 200)}`));
      }
    },
  });

  spinner.succeed(`Agent ready! (Model: ${chalk.cyan(currentConfig.model)})`);

  console.log(chalk.gray("Type your message. Use /model to switch model, /provider for setup, or /exit to quit.\n"));

  const rl = readline.createInterface({ input, output });

  const ask = () => {
    rl.question(chalk.green("> "), async (inputStr) => {
      const trimmedInput = inputStr.trim();
      
      if (!trimmedInput) {
        ask();
        return;
      }

      if (trimmedInput === "/exit" || trimmedInput === "/quit") {
        rl.close();
        return;
      }

      if (trimmedInput === "/model") {
        rl.pause();
        const [currentProvider] = currentConfig.model.split("/");
        const providerConfig = PROVIDERS.find(p => p.id === currentProvider);
        const models = providerConfig?.models || [];
        
        const { model } = await inquirer.prompt([{
          type: "list",
          name: "model",
          message: "Switch to model:",
          choices: [...models, "Enter custom model ID"],
          default: currentConfig.model,
        }]);

        let finalModel = model;
        if (model === "Enter custom model ID") {
          const { customModel } = await inquirer.prompt([{ type: "input", name: "customModel", message: "Enter model ID:" }]);
          finalModel = customModel;
        }

        currentConfig.model = finalModel;
        saveGlobalConfig({ model: finalModel });
        
        agent = new Agent({ config: currentConfig }); // Re-init agent
        console.log(chalk.green(`Switched to model: ${finalModel}`));
        rl.resume();
        ask();
        return;
      }

      if (trimmedInput === "/provider") {
        rl.pause();
        await runSetup(process.cwd(), { global: true });
        currentConfig = loadConfig();
        agent = new Agent({ config: currentConfig });
        console.log(chalk.green(`Switched to provider and model: ${currentConfig.model}`));
        rl.resume();
        ask();
        return;
      }

      const response = await agent.run(trimmedInput);
      console.log(chalk.white(response));
      console.log();
      ask();
    });
  };

  ask();
}

async function runTask(config: ReturnType<typeof loadConfig>, task: string, stream: boolean): Promise<void> {
  const spinner = ora("Running task...").start();

  const agent = new Agent({
    config,
    onToolCall: (tc) => {
      spinner.info(chalk.blue(`Executing: ${tc.name}(${JSON.stringify(tc.arguments).slice(0, 50)}...)`));
    },
    onToolResult: (tr) => {
      if (tr.is_error) {
        console.error(chalk.red(`Error: ${tr.output.slice(0, 100)}`));
      }
    },
  });

  try {
    let result: string;
    if (stream) {
      result = await agent.runStreaming(task);
    } else {
      result = await agent.run(task);
    }

    spinner.succeed("Task complete");
    console.log(chalk.white(result));
  } catch (e) {
    spinner.fail(`Error: ${e}`);
    process.exit(1);
  }
}