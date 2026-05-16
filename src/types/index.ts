export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  output: string;
  is_error?: boolean;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface AgentConfig {
  model: string;
  apiEndpoint?: string;
  apiKey?: string;
  providers?: Record<string, {
    apiKey?: string;
    baseURL?: string;
  }>;
  maxTurns: number;
  sandbox: "read-only" | "restricted" | "full";
  approveCommands: string[];
  blockCommands: string[];
  temperature: number;
  timeout: number;
}

export interface TurnResult {
  text: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
}

export interface AgentState {
  messages: Message[];
  turnCount: number;
  config: AgentConfig;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
}

export interface SkillManifest {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  command?: string;
  instructions?: string;
}