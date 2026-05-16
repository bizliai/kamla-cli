#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, validateConfig } from "../config/index.js";
import { runSetup, needsSetup } from "../config/setup.js";
import { Agent } from "../core/agent.js";
import chalk from "chalk";
import ora from "ora";
import { stdin as input, stdout as output } from "process";
import readline from "readline";

async function ensureConfig(opts?: { provider?: string; apiKey?: string; model?: string; sandbox?: string }): Promise<void> {
  if (needsSetup()) {
    console.log(chalk.yellow("No configuration found. Let's set up Kamla!\n"));
    await runSetup(process.cwd(), opts);
  }
}

const program = new Command();

program
  .name("kamla")
  .description("Autonomous code agent powered by LLMs")
  .version("1.0.0");

program
  .option("-p, --provider <provider>", "LLM provider (openai, opencode)")
  .option("-k, --api-key <key>", "API key")
  .option("-m, --model <model>", "Model name")
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
  .command("init")
  .description("Run the setup wizard")
  .option("-p, --provider <provider>", "LLM provider (openai, opencode)")
  .option("-k, --api-key <key>", "API key")
  .option("-m, --model <model>", "Model name")
  .option("-s, --sandbox <mode>", "Sandbox mode")
  .action(async (opts) => {
    await runSetup(process.cwd(), opts);
  });

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
  .option("-p, --provider <provider>", "LLM provider (openai, opencode)")
  .option("-k, --api-key <key>", "API key")
  .option("-m, --model <model>", "Model name")
  .option("-s, --sandbox <mode>", "Sandbox mode")
  .action(async (opts) => {
    await runSetup(process.cwd(), opts);
  });

program.parse();

async function startChat(config: ReturnType<typeof loadConfig>): Promise<void> {
  const spinner = ora("Starting agent...").start();

  const agent = new Agent({
    config,
    onToolCall: (tc) => {
      spinner.info(chalk.blue(`Executing tool: ${tc.name}`));
    },
    onToolResult: (tr) => {
      if (tr.is_error) {
        console.error(chalk.red(`Tool error: ${tr.output.slice(0, 200)}`));
      }
    },
    onResponse: (text) => {
      // Will be printed at end
    },
  });

  spinner.succeed("Agent ready!");

  console.log(chalk.gray("Type your message and press Enter. Ctrl+C to exit.\n"));

  const rl = readline.createInterface({ input, output });

  const ask = () => {
    rl.question(chalk.green("> "), async (input) => {
      if (!input.trim()) {
        ask();
        return;
      }

      const response = await agent.run(input);
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