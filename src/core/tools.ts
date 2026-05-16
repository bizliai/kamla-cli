import type { ToolDefinition, ToolCall, AgentConfig } from "../types/index.js";

export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, config: AgentConfig): Promise<string>;
  needsApproval?(args: Record<string, unknown>, config: AgentConfig): boolean;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(toolCall: ToolCall, config: AgentConfig): Promise<string> {
    const tool = this.get(toolCall.name);
    if (!tool) {
      return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
    }

    try {
      const result = await tool.execute(toolCall.arguments, config);
      return result;
    } catch (e) {
      return JSON.stringify({ error: String(e) });
    }
  }

  requiresApproval(toolCall: ToolCall, config: AgentConfig): boolean {
    const tool = this.get(toolCall.name);
    if (!tool) return false;
    return tool.needsApproval?.(toolCall.arguments, config) ?? false;
  }
}