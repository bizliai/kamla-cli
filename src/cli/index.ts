#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, validateConfig, saveGlobalConfig, needsSetup } from "../config/index.js";
import { runSetup, PROVIDERS, getModelsData } from "../config/setup.js";
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
import { printBanner, kamlaGradient, renderMarkdown, box, symbols, COLORS } from "./tui.js";

async function ensureConfig(opts?: { provider?: string; apiKey?: string; model?: string; sandbox?: string }): Promise<void> {
  if (needsSetup()) {
    printBanner();
    console.log(chalk.yellow("  No configuration found. Let's set up Kamla!\n"));
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
  .command("resume <sessionId>")
  .description("Resume a previous chat session")
  .option("-m, --model <model>", "Model to use")
  .option("-s, --sandbox <mode>", "Sandbox mode (read-only, restricted, full)")
  .action(async (sessionId, opts, cmd) => {
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

    await startChat(config, undefined, sessionId);
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
    
    const s = ora("Fetching models...").start();
    const modelsDev = await getModelsData();
    s.stop();

    let models: string[] = [];
    if (modelsDev && modelsDev[currentProvider]) {
      models = Object.keys(modelsDev[currentProvider].models).map(m => `${currentProvider}/${m}`);
    } else {
      const providerConfig = PROVIDERS.find(p => p.id === currentProvider);
      models = providerConfig?.models || [];
    }

    let filteredModels = models;
    while (true) {
      const { model } = await inquirer.prompt([
        {
          type: "list",
          name: "model",
          message: "Select a model:",
          choices: [
            "🔍 Search models...",
            ...filteredModels.slice(0, 50),
            "Enter custom model ID"
          ],
          default: config.model,
        },
      ]);

      if (model === "🔍 Search models...") {
        const { searchTerm } = await inquirer.prompt([
          {
            type: "input",
            name: "searchTerm",
            message: "Search for a model:",
          },
        ]);
        filteredModels = models.filter(m => m.toLowerCase().includes(searchTerm.toLowerCase()));
        continue;
      }
      
      if (model === "Enter custom model ID") {
        const { customModel } = await inquirer.prompt([{
          type: "input",
          name: "customModel",
          message: "Enter custom model ID:",
        }]);
        saveGlobalConfig({ model: customModel });
        console.log(chalk.green(`Model updated to: ${customModel}`));
        return;
      }

      saveGlobalConfig({ model });
      console.log(chalk.green(`Model updated to: ${model}`));
      break;
    }
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
  .command("sessions")
  .description("List all saved chat sessions")
  .action(() => {
    const sessions = sessionManager.listSessions();
    if (sessions.length === 0) {
      console.log(chalk.yellow("No sessions found."));
    } else {
      console.log(chalk.cyan("\nSaved Sessions:"));
      sessions.forEach((s) => console.log(`  - ${chalk.white(s)}`));
      console.log(chalk.gray(`\nUse 'kamla resume <sessionId>' to continue a session.\n`));
    }
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
    logger.debug("CLI starting parseAsync");
    await program.parseAsync();
    logger.debug("CLI parseAsync completed");
  } catch (err) {
    logger.error("CLI Execution error", err);
    process.exit(1);
  }
})();

async function startChat(config: ReturnType<typeof loadConfig>, initialMessage?: string, sessionId?: string): Promise<void> {
  const sessionStartTime = Date.now();
  let currentConfig = { ...config };
  
  const currentSessionId = sessionId || `session-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const initialHistoryLength = sessionManager.loadSession(currentSessionId).length;
  
  if (!sessionId) {
    printBanner();
  }

  const spinner = ora({
    text: "Starting agent...",
    color: "cyan"
  }).start();
  let isResponding = false;
  let responseBuffer = "";

  const createAgent = (conf: typeof currentConfig) => {
    const a = new Agent({
      config: conf,
      onToolCall: (tc) => {
        spinner.stop();
        logger.debug(`Tool Call: ${tc.name}`, tc.arguments);
        if (isResponding) {
          process.stdout.write("\n");
          isResponding = false;
        }
        console.log(`\n  ${chalk.blue("⚙")}  ${chalk.bold("Tool Call:")} ${chalk.cyan(tc.name)}`);
        if (tc.arguments && Object.keys(tc.arguments).length > 0) {
          const args = JSON.stringify(tc.arguments, null, 2)
            .split("\n")
            .map(line => `     ${chalk.gray(line)}`)
            .join("\n");
          console.log(args);
        }
        console.log();
        spinner.start(chalk.gray(`Executing ${tc.name}...`));
      },
      onToolResult: (tr) => {
        spinner.stop();
        if (tr.is_error) {
          logger.error(`Tool execution error`, tr);
          console.error(`  ${symbols.error} ${chalk.red("Error:")} ${chalk.red(tr.output.slice(0, 500))}`);
        } else {
          logger.debug(`Tool completed successfully`, tr);
          console.log(`  ${symbols.success} ${chalk.green("Tool completed.")}`);
        }
        console.log();
      },
      onResponse: (delta) => {
        if (!delta) return;
        if (spinner.isSpinning) {
          spinner.stop();
        }
        if (!isResponding) {
          process.stdout.write(`\n${symbols.agent} ${chalk.bold(kamlaGradient("Kamla"))} > `);
          isResponding = true;
        }
        process.stdout.write(delta);
        responseBuffer += delta;
      },
    });
    
    // Load session
    const history = sessionManager.loadSession(currentSessionId);
    if (history.length > 0) {
      a.setHistory(history);
    }
    return a;
  };

  let agent = createAgent(currentConfig);

  spinner.succeed(`Agent ready! (Model: ${chalk.cyan(currentConfig.model)})`);
  console.log(chalk.gray(`Session ID: ${chalk.white(currentSessionId)}`));
  
  const skillManager = new SkillManager();
  const skillsCount = (await skillManager.listSkills()).length;
  if (skillsCount > 0) {
    console.log(chalk.gray(`Loaded ${skillsCount} custom skills.`));
  }

  console.log(chalk.gray("Type your message. Use /help to see all commands or /exit to quit.\n"));

  const completions = ["/clear", "/model", "/provider", "/exit", "/quit", "/session", "/skill", "/help"];
  const skillSubcommands = ["list", "install", "uninstall"];

  const completer = (line: string) => {
    if (line.startsWith("/skill ")) {
      const sub = line.split(" ")[1] || "";
      const hits = skillSubcommands.filter((s) => s.startsWith(sub));
      return [hits.length ? hits.map(h => `/skill ${h}`) : skillSubcommands.map(h => `/skill ${h}`), line];
    }

    if (line.startsWith("/")) {
      const hits = completions.filter((c) => c.startsWith(line));
      return [hits.length ? hits : completions, line];
    }

    return [[], line];
  };

  // Keep stdin alive so the event loop doesn't exit between prompts
  process.stdin.resume();

  // Use the classic (non-promises) readline for event-driven line reading.
  // readline/promises rl.question() in a while-loop breaks after streaming
  // because the Vercel AI SDK's fullStream iteration causes Node.js to flush
  // the input stream state, making the next rl.question() resolve instantly.
  const rl = readline.createInterface({
    input,
    output,
    completer,
    terminal: true,
  });

  let isClosed = false;

  rl.on("close", () => {
    isClosed = true;
    logger.debug("Readline interface closed");
    process.stdin.pause();
  });

  let sigintCount = 0;
  let sigintTimer: NodeJS.Timeout | null = null;

  rl.on("SIGINT", () => {
    logger.debug("Readline SIGINT received");
    if (sigintCount === 0) {
      sigintCount++;
      // Move to a new line and show warning
      process.stdout.write(chalk.yellow("\n(Press Ctrl+C again within 3 seconds to exit)\n"));
      rl.prompt();
      
      sigintTimer = setTimeout(() => {
        if (sigintCount === 1) {
          sigintCount = 0;
          // Clear the warning and the extra prompt line
          // \x1b[2A moves up 2 lines, \x1b[J clears to end of screen
          process.stdout.write("\x1b[2A\x1b[J");
          rl.prompt();
        }
      }, 3000);
    } else {
      if (sigintTimer) clearTimeout(sigintTimer);
      sigintCount = 0;
      console.log(chalk.gray("\nExiting..."));
      rl.close();
    }
  });

  process.on("SIGINT", () => {
    logger.debug("Process SIGINT received");
  });

  async function processInput(inputStr: string): Promise<boolean> {
    if (inputStr === null || inputStr === undefined) {
      logger.debug("Received null or undefined input, closing...");
      return true;
    }

    const trimmedInput = inputStr.trim();
    logger.debug(`Processing input: ${trimmedInput}`);
    
    if (!trimmedInput) {
      return false;
    }

    if (trimmedInput === "/" || trimmedInput === "/help") {
      const helpText = [
        `${chalk.bold.cyan("/clear")}    Clear conversation history`,
        `${chalk.bold.cyan("/model")}    Switch LLM model`,
        `${chalk.bold.cyan("/provider")} Switch AI provider`,
        `${chalk.bold.cyan("/session")}  Manage chat sessions`,
        `${chalk.bold.cyan("/skill")}    Manage agent skills`,
        `${chalk.bold.cyan("/help")}     Show this help menu`,
        `${chalk.bold.cyan("/exit")}     Exit the chat`
      ].join("\n");
      
      console.log(box(helpText, "AVAILABLE COMMANDS", COLORS.secondary));
      return false;
    }

    if (trimmedInput === "/exit" || trimmedInput === "/quit") {
      logger.debug("Exiting chat session via command");
      return true;
    }

    if (trimmedInput === "/clear") {
      console.clear();
      agent.clearHistory();
      sessionManager.saveSession("latest", []);
      console.log(chalk.gray("Conversation history cleared.\n"));
      return false;
    }

    if (trimmedInput === "/session") {
      rl.pause();
      console.log(chalk.cyan(`\nCurrent Session: ${chalk.white.bold(currentSessionId)}`));
      const { action } = await inquirer.prompt([{
        type: "list",
        name: "action",
        message: "Session management:",
        choices: ["Save current session as...", "Load session", "List sessions", "Back"],
      }]);

      if (action === "Save current session as...") {
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
      return false;
    }

    if (trimmedInput === "/model") {
      rl.pause();
      const [currentProvider] = currentConfig.model.split("/");
      
      const s = ora("Fetching models...").start();
      const modelsDev = await getModelsData();
      s.stop();

      let models: string[] = [];
      if (modelsDev && modelsDev[currentProvider]) {
        models = Object.keys(modelsDev[currentProvider].models).map(m => `${currentProvider}/${m}`);
      } else {
        const providerConfig = PROVIDERS.find(p => p.id === currentProvider);
        models = providerConfig?.models || [];
      }
      
      let filteredModels = models;
      while (true) {
        const { model } = await inquirer.prompt([{
          type: "list",
          name: "model",
          message: "Switch to model:",
          choices: [
            "🔍 Search models...",
            ...filteredModels.slice(0, 50),
            "Enter custom model ID"
          ],
          default: currentConfig.model,
        }]);
        
        if (model === "🔍 Search models...") {
          const { searchTerm } = await inquirer.prompt([
            {
              type: "input",
              name: "searchTerm",
              message: "Search for a model:",
            },
          ]);
          filteredModels = models.filter(m => m.toLowerCase().includes(searchTerm.toLowerCase()));
          continue;
        }

        if (model === "Enter custom model ID") {
          const { customModel } = await inquirer.prompt([{
            type: "input",
            name: "customModel",
            message: "Enter custom model ID:",
          }]);
          currentConfig.model = customModel;
          agent = createAgent(currentConfig);
          console.log(chalk.green(`Switched to model: ${customModel}`));
          break;
        }

        currentConfig.model = model;
        agent = createAgent(currentConfig);
        console.log(chalk.green(`Switched to model: ${model}`));
        break;
      }
      rl.resume();
      return false;
    }

    if (trimmedInput === "/provider") {
      rl.pause();
      await runSetup(process.cwd(), { global: true });
      currentConfig = loadConfig();
      agent = createAgent(currentConfig);
      console.log(chalk.green(`Switched to provider and model: ${currentConfig.model}`));
      rl.resume();
      return false;
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
      return false;
    }

    try {
      isResponding = false;
      rl.pause(); // Pause readline during agent execution to avoid stream conflicts
      spinner.start("Thinking...");
      logger.debug(`Starting agent execution for: ${trimmedInput}`);
      responseBuffer = "";
      await agent.runStreaming(trimmedInput);
      logger.debug("Agent execution finished");
      
      if (isResponding) {
        process.stdout.write("\n");
        // Re-render the full response as markdown for better readability if it's long enough
        if (responseBuffer.includes("```") || responseBuffer.includes("#") || responseBuffer.length > 200) {
          process.stdout.write("\x1b[1A\x1b[2K"); // Move up and clear line
          // This is a bit tricky with streaming, so we just append the rendered version or 
          // we can just leave the streamed text as is. 
          // For now, let's just make sure the spacing is good.
        }
      }
      spinner.stop();
      
      // Save current session
      sessionManager.saveSession(currentSessionId, agent.getHistory());
      sessionManager.saveSession("latest", agent.getHistory());
    } catch (e: any) {
      spinner.stop();
      logger.error("Error during agent execution", e);
      console.error(chalk.red(`\nError: ${e.message}`));
    } finally {
      rl.resume(); // Ensure readline is resumed
    }
    
    return false;
  }

  logger.debug(`Starting chat. TTY: ${process.stdin.isTTY}`);

  // Gate to prevent concurrent processing of lines
  let processing = false;

  async function handleLine(line: string) {
    if (processing) return; // Ignore input while processing a previous message
    processing = true;
    try {
      const shouldExit = await processInput(line);
      if (shouldExit) {
        logger.debug("Process input requested exit");
        rl.close();
        return;
      }
    } finally {
      processing = false;
      if (!isClosed) {
        logger.debug("handleLine completed, showing prompt");
        rl.setPrompt(`${symbols.user} ${chalk.bold.green("You")} > `);
        rl.prompt();
      } else {
        logger.debug("handleLine completed but rl is closed");
      }
    }
  }

  try {
    // Handle initial message if provided (before entering the event loop)
    if (initialMessage) {
      logger.debug(`Processing initial message: ${initialMessage}`);
      const shouldExit = await processInput(initialMessage);
      if (shouldExit) {
        logger.debug("Initial message requested exit");
        rl.close();
        return;
      }
    }

    // Event-driven line handling — NOT a while+rl.question() loop.
    // This is robust because readline emits "line" events independently
    // of any async streaming happening inside processInput().
    logger.debug("Setting up event-driven chat loop");
    rl.setPrompt(`${symbols.user} ${chalk.bold.green("You")} > `);
    rl.prompt();

    rl.on("line", handleLine);

    // Wait until the readline interface closes (user types /exit or Ctrl+D)
    await new Promise<void>((resolve) => rl.once("close", resolve));
  } catch (err) {
    logger.error("Error in chat loop", err);
  } finally {
    logger.debug(`Chat session ending. isClosed=${isClosed}`);
    if (!isClosed) {
      try { rl.close(); } catch { /* already closed */ }
    }
    process.stdin.pause();

    const durationMs = Date.now() - sessionStartTime;
    const durationSec = Math.round(durationMs / 1000);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    
    // Calculate messages in this session
    const history = agent.getHistory();
    const sessionHistory = history.slice(initialHistoryLength);
    const userMessages = sessionHistory.filter((m: any) => m.role === "user").length;
    const aiMessages = sessionHistory.filter((m: any) => m.role === "assistant").length;

    const summary = [
      `${chalk.bold("Model:")}     ${currentConfig.model}`,
      `${chalk.bold("Duration:")}  ${durationStr}`,
      `${chalk.bold("Messages:")}  ${userMessages} User / ${aiMessages} AI`
    ].join("\n");

    console.log(box(summary, "SESSION SUMMARY", COLORS.primary));
    console.log(chalk.gray(`  To resume this session later, run: ${chalk.white.bold(`kamla resume ${currentSessionId}`)}\n`));
  }
}

async function runTask(config: ReturnType<typeof loadConfig>, task: string, stream: boolean): Promise<void> {
  const spinner = ora("Running task...").start();

  const agent = new Agent({
    config,
    onToolCall: (tc) => {
      logger.debug(`Task Tool Call: ${tc.name}`, tc.arguments);
      spinner.info(chalk.blue(`Executing: ${tc.name}(${JSON.stringify(tc.arguments).slice(0, 50)}...)`));
    },
    onToolResult: (tr) => {
      if (tr.is_error) {
        logger.error(`Task Tool execution error`, tr);
        console.error(chalk.red(`Error: ${tr.output.slice(0, 100)}`));
      } else {
        logger.debug(`Task Tool completed successfully`, tr);
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