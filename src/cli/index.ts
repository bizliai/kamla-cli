#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, validateConfig, saveGlobalConfig, needsSetup } from "../config/index.js";
import { runSetup, PROVIDERS } from "../config/setup.js";
import { Agent } from "../core/agent.js";
import { SkillManager } from "../core/skills.js";
import { logger } from "../core/logger.js";
import { sessionManager } from "../core/session.js";
import chalk from "chalk";
import ora from "ora";
import { stdin as input, stdout as output } from "process";
import readline from "readline";
import inquirer from "inquirer";
import { skillCommand } from "./commands/skill.js";

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

program.addCommand(skillCommand());

program
  .command("chat [message...]")
  .description("Start an interactive chat session")
  .option("-m, --model <model>", "Model to use")
  .option("-s, --sandbox <mode>", "Sandbox mode (read-only, restricted, full)")
  .action(async (message, opts, cmd) => {
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

    const initialMessage = message && message.length > 0 ? message.join(" ") : undefined;
    await startChat(config, initialMessage);
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

program
  .arguments("[message...]")
  .action(async (message) => {
    if (needsSetup()) {
      await runSetup();
    } else {
      const config = loadConfig();
      const initialMessage = message && message.length > 0 ? message.join(" ") : undefined;
      await startChat(config, initialMessage);
    }
  });

// Execute CLI
(async () => {
  try {
    await program.parseAsync();
  } catch (err) {
    logger.error("CLI Execution error", err);
    process.exit(1);
  }
})();

async function startChat(config: ReturnType<typeof loadConfig>, initialMessage?: string): Promise<void> {
  let currentConfig = { ...config };
  const spinner = ora("Starting agent...").start();
  let isResponding = false;

  const createAgent = (conf: typeof currentConfig) => {
    const a = new Agent({
      config: conf,
      onToolCall: (tc) => {
        spinner.stop();
        if (isResponding) {
          process.stdout.write("\n");
          isResponding = false;
        }
        console.log(chalk.blue(`\n  ⚙️  Executing: ${chalk.bold(tc.name)}`));
        if (tc.arguments && Object.keys(tc.arguments).length > 0) {
          console.log(chalk.gray(`     ${JSON.stringify(tc.arguments).slice(0, 100)}`));
        }
      },
      onToolResult: (tr) => {
        if (tr.is_error) {
          console.error(chalk.red(`  ❌ Tool error: ${tr.output.slice(0, 200)}`));
        } else {
          console.log(chalk.gray(`  ✅ Tool completed.`));
        }
      },
      onResponse: (delta) => {
        spinner.stop();
        if (!isResponding) {
          process.stdout.write(chalk.cyan.bold("\nKamla > "));
          isResponding = true;
        }
        process.stdout.write(chalk.white(delta));
      },
    });
    
    // Load latest session
    const history = sessionManager.loadSession("latest");
    if (history.length > 0) {
      a.setHistory(history);
    }
    return a;
  };

  let agent = createAgent(currentConfig);

  spinner.succeed(`Agent ready! (Model: ${chalk.cyan(currentConfig.model)})`);
  
  const skillManager = new SkillManager();
  const skillsCount = (await skillManager.listSkills()).length;
  if (skillsCount > 0) {
    console.log(chalk.gray(`Loaded ${skillsCount} custom skills.`));
  }

  console.log(chalk.gray("Type your message. Use /model, /skill, /provider, /session, /clear or /exit.\n"));

  const rl = readline.createInterface({ input, output });

  return new Promise((resolve) => {
    rl.on("close", () => {
      logger.debug("Readline interface closed");
      resolve();
    });

    const ask = () => {
      rl.question(chalk.bold.green("You > "), handleInput);
    };

    async function handleInput(inputStr: string) {
      const trimmedInput = inputStr.trim();
      logger.debug(`Received input: ${trimmedInput}`);
      
      if (!trimmedInput) {
        ask();
        return;
      }

      if (trimmedInput === "/exit" || trimmedInput === "/quit") {
        logger.debug("Exiting chat session via command");
        rl.close();
        return;
      }

      if (trimmedInput === "/clear") {
        console.clear();
        agent.clearHistory();
        sessionManager.saveSession("latest", []);
        console.log(chalk.gray("Conversation history cleared.\n"));
        ask();
        return;
      }

      if (trimmedInput === "/session") {
        rl.pause();
        const { action } = await inquirer.prompt([{
          type: "list",
          name: "action",
          message: "Session management:",
          choices: ["Save current session", "Load session", "List sessions", "Back"],
        }]);

        if (action === "Save current session") {
          const { name } = await inquirer.prompt([{ type: "input", name: "name", message: "Enter session name:" }]);
          sessionManager.saveSession(name, agent.getHistory());
          console.log(chalk.green(`Session saved as ${name}`));
        } else if (action === "Load session") {
          const sessions = sessionManager.listSessions();
          if (sessions.length === 0) {
            console.log(chalk.yellow("No sessions found."));
          } else {
            const { name } = await inquirer.prompt([{ type: "list", name: "name", message: "Select session:", choices: sessions }]);
            const history = sessionManager.loadSession(name);
            agent.setHistory(history);
            console.log(chalk.green(`Session ${name} loaded. (${history.length} messages)`));
          }
        } else if (action === "List sessions") {
          const sessions = sessionManager.listSessions();
          console.log(chalk.cyan("\nSaved Sessions:"));
          sessions.forEach(s => console.log(`- ${s}`));
          console.log();
        }
        rl.resume();
        ask();
        return;
      }

      // ... other slash commands ...
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
        
        agent = createAgent(currentConfig);
        console.log(chalk.green(`Switched to model: ${finalModel}`));
        rl.resume();
        ask();
        return;
      }

      if (trimmedInput === "/provider") {
        rl.pause();
        await runSetup(process.cwd(), { global: true });
        currentConfig = loadConfig();
        agent = createAgent(currentConfig);
        console.log(chalk.green(`Switched to provider and model: ${currentConfig.model}`));
        rl.resume();
        ask();
        return;
      }

      if (trimmedInput.startsWith("/skill")) {
        const parts = trimmedInput.split(" ");
        const subCommand = parts[1];
        const arg = parts[2];

        if (subCommand === "list") {
          const skills = await skillManager.listSkills();
          if (skills.length === 0) {
            console.log(chalk.yellow("No skills installed."));
          } else {
            console.log(chalk.cyan("\nInstalled Skills:"));
            skills.forEach((s) => console.log(`${chalk.green(s.name)}: ${s.description}`));
            console.log();
          }
        } else if (subCommand === "install" && arg) {
          const s = ora(`Installing skill from ${arg}...`).start();
          try {
            await skillManager.installSkill(arg);
            s.succeed(`Skill installed!`);
            agent = createAgent(currentConfig);
          } catch (e: any) {
            s.fail(`Error: ${e.message}`);
          }
        } else if (subCommand === "uninstall" && arg) {
          const s = ora(`Uninstalling skill ${arg}...`).start();
          try {
            await skillManager.uninstallSkill(arg);
            s.succeed(`Skill uninstalled!`);
            agent = createAgent(currentConfig);
          } catch (e: any) {
            s.fail(`Error: ${e.message}`);
          }
        } else {
          console.log(chalk.yellow("Usage: /skill [list|install <url>|uninstall <name>]"));
        }
        ask();
        return;
      }

      try {
        isResponding = false;
        spinner.start("Thinking...");
        logger.debug(`Starting agent execution for: ${trimmedInput}`);
        await agent.runStreaming(trimmedInput);
        logger.debug("Agent execution finished");
        if (isResponding) {
          process.stdout.write("\n");
        }
        spinner.stop();
        
        // Save current session automatically
        sessionManager.saveSession("latest", agent.getHistory());
      } catch (e: any) {
        spinner.stop();
        logger.error("Error during agent execution", e);
        console.error(chalk.red(`\nError: ${e.message}`));
      }
      
      logger.debug("Calling ask() for next input");
      ask();
    }

    if (initialMessage) {
      handleInput(initialMessage);
    } else {
      ask();
    }
  });
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