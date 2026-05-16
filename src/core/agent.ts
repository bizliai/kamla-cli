import type { AgentConfig, Message, ToolCall, ToolResult, ToolDefinition } from "../types/index.js";
import { LLMClient } from "../llm/client.js";
import { ToolRegistry } from "./tools.js";
import { ShellTool } from "../tools/shell.js";
import { ReadFileTool, WriteFileTool, EditFileTool, ListDirTool } from "../tools/files.js";
import { SkillManager, SkillTool } from "./skills.js";
import { logger } from "./logger.js";



export interface AgentOptions {
  config: AgentConfig;
  systemPrompt?: string;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
  onThinking?: (thinking: string) => void;
  onResponse?: (text: string) => void;
}

export class Agent {
  private config: AgentConfig;
  private llm: LLMClient;
  private registry: ToolRegistry;
  private messages: Message[] = [];
  private systemPrompt: string;
  private skillManager: SkillManager;
  private initialized: Promise<void>;


  private callbacks: {
    onToolCall?: (toolCall: ToolCall) => void;
    onToolResult?: (result: ToolResult) => void;
    onThinking?: (thinking: string) => void;
    onResponse?: (text: string) => void;
  };

  constructor(options: AgentOptions) {
    this.config = options.config;
    this.llm = new LLMClient(this.config);
    this.registry = new ToolRegistry();
    this.skillManager = new SkillManager();
    this.systemPrompt = options.systemPrompt || this.getDefaultSystemPrompt();

    this.callbacks = {
      onToolCall: options.onToolCall,
      onToolResult: options.onToolResult,
      onThinking: options.onThinking,
      onResponse: options.onResponse,
    };
    this.initialized = this.init();
  }


  private async init(): Promise<void> {
    await this.registerTools();
  }

  private async registerTools(): Promise<void> {

    this.registry.register(new ShellTool());
    this.registry.register(new ReadFileTool());
    this.registry.register(new WriteFileTool());
    this.registry.register(new EditFileTool());
    this.registry.register(new ListDirTool());

    const skills = await this.skillManager.loadSkills();
    for (const skill of skills) {
      this.registry.register(skill);
    }
  }


  private getDefaultSystemPrompt(): string {
    return `You are Kamla, an autonomous coding agent. Your job is to help the user accomplish programming tasks.

Available tools:
- shell: Execute shell commands
- read_file: Read file contents
- write_file: Create or overwrite files
- edit_file: Edit existing files
- list_dir: List directory contents

Guidelines:
1. Think step by step before taking actions
2. Execute commands to explore the codebase and run tests
3. Read files to understand the code
4. Make targeted edits to fix issues or add features
5. Always verify your changes work by running tests
6. If something doesn't work, try alternative approaches

The current working directory is: ${process.cwd()}`;
  }

  private getSkillInstructions(): string {
    const tools = this.registry.getTools();
    let instructions = "";
    for (const tool of tools) {
      if (tool instanceof SkillTool && tool.instructions) {
        instructions += `\n\n--- Skill: ${tool.definition.name} ---\n${tool.instructions}`;
      }
    }
    return instructions;
  }

  private buildMessages(): Message[] {
    const skillInstructions = this.getSkillInstructions();
    const msgs: Message[] = [
      { role: "system", content: this.systemPrompt + skillInstructions },
      ...this.messages,
    ];
    return msgs;
  }


  async run(userInput: string): Promise<string> {
    await this.initialized;
    this.messages.push({ role: "user", content: userInput });


    let turnCount = 0;
    const maxTurns = this.config.maxTurns;

    while (turnCount < maxTurns) {
      turnCount++;
      const toolDefs: ToolDefinition[] = this.registry.getAll();
      const msgs = this.buildMessages();

      const response = await this.llm.chat(msgs, toolDefs);
      const { content, toolCalls } = response;

      if (content || toolCalls.length > 0) {
        this.messages.push({
          role: "assistant",
          content: content || "",
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined
        });
        if (content) {
          this.callbacks.onResponse?.(content);
        }

        if (toolCalls.length === 0 && content) {
          return content;
        }
      }

      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          this.callbacks.onToolCall?.(toolCall);

          const needsApproval = this.registry.requiresApproval(toolCall, this.config);
          let result: string;

          if (needsApproval && this.config.sandbox !== "full") {
            result = JSON.stringify({
              error: "This command requires approval",
              tool: toolCall.name,
              args: toolCall.arguments,
            });
          } else {
            result = await this.registry.execute(toolCall, this.config);
          }

          const toolResult: ToolResult = {
            tool_call_id: toolCall.id,
            output: result,
            is_error: result.includes("error"),
          };

          this.callbacks.onToolResult?.(toolResult);
          this.messages.push({
            role: "tool",
            content: result,
            tool_call_id: toolCall.id,
            name: toolCall.name,
          });
        }
      } else if (content) {
        return content;
      }
    }

    return `Reached maximum turns (${maxTurns}). The task may not be complete.`;
  }

  async runStreaming(userInput: string): Promise<string> {
    await this.initialized;
    this.messages.push({ role: "user", content: userInput });


    let turnCount = 0;
    const maxTurns = this.config.maxTurns;
    let fullContent = "";

    while (turnCount < maxTurns) {
      turnCount++;
      const toolDefs: ToolDefinition[] = this.registry.getAll();
      const msgs = this.buildMessages();

      const generator = this.llm.streamChat(msgs, toolDefs);
      let currentToolCalls: ToolCall[] = [];

      for await (const chunk of generator) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          this.callbacks.onResponse?.(chunk.delta);
        }

        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          currentToolCalls = chunk.toolCalls;
        }

        if (chunk.done) break;
      }

      if (fullContent || currentToolCalls.length > 0) {
        this.messages.push({
          role: "assistant",
          content: fullContent,
          tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined
        });
      }

      if (currentToolCalls.length > 0) {
        for (const toolCall of currentToolCalls) {
          this.callbacks.onToolCall?.(toolCall);

          const needsApproval = this.registry.requiresApproval(toolCall, this.config);
          let result: string;

          if (needsApproval && this.config.sandbox !== "full") {
            result = JSON.stringify({
              error: "This command requires approval",
              tool: toolCall.name,
              args: toolCall.arguments,
            });
          } else {
            result = await this.registry.execute(toolCall, this.config);
          }

          const toolResult: ToolResult = {
            tool_call_id: toolCall.id,
            output: result,
            is_error: result.includes("error"),
          };

          this.callbacks.onToolResult?.(toolResult);
          this.messages.push({
            role: "tool",
            content: result,
            tool_call_id: toolCall.id,
            name: toolCall.name,
          });
        }
      } else {
        return fullContent;
      }

      fullContent = "";
    }

    return `Reached maximum turns (${maxTurns}). The task may not be complete.`;
  }

  getHistory(): Message[] {
    return [...this.messages];
  }

  setHistory(messages: Message[]): void {
    this.messages = messages;
  }

  clearHistory(): void {
    this.messages = [];
  }
}