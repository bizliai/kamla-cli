import type { Message, ToolCall, AgentConfig } from "../types/index.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
  stream?: boolean;
  max_tokens?: number;
}

export interface ChatChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
    tool_call_id?: string;
  };
  finish_reason: string;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: ChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMClient {
  private config: AgentConfig;
  private headers: Record<string, string>;

  constructor(config: AgentConfig) {
    this.config = config;
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
  }

  async chat(
    messages: Message[],
    tools?: { name: string; description: string; parameters: Record<string, unknown> }[]
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const chatMessages: ChatMessage[] = messages.map((msg) => ({
      role: msg.role === "tool" ? "tool" : msg.role,
      content: msg.content,
      name: msg.name,
      tool_call_id: msg.tool_call_id,
    }));

    const request: ChatCompletionRequest = {
      model: this.config.model,
      messages: chatMessages,
      temperature: this.config.temperature,
    };

    if (tools && tools.length > 0) {
      request.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      request.tool_choice = "auto";
    }

    const url = `${this.config.apiEndpoint}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error("No response from LLM");
    }

    const content = choice.message.content || "";
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      }
    }

    return { content, toolCalls };
  }

  async *streamChat(
    messages: Message[],
    tools?: { name: string; description: string; parameters: Record<string, unknown> }[]
  ): AsyncGenerator<{ delta: string; toolCalls: ToolCall[]; done: boolean }> {
    const chatMessages: ChatMessage[] = messages.map((msg) => ({
      role: msg.role === "tool" ? "tool" : msg.role,
      content: msg.content,
      name: msg.name,
      tool_call_id: msg.tool_call_id,
    }));

    const request: ChatCompletionRequest = {
      model: this.config.model,
      messages: chatMessages,
      temperature: this.config.temperature,
      stream: true,
    };

    if (tools && tools.length > 0) {
      request.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      request.tool_choice = "auto";
    }

    const url = `${this.config.apiEndpoint}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error("Empty response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let toolCallBuffer: Map<string, { name: string; arguments: string }> = new Map();
    let currentToolCall: { id: string; name: string; arguments: string } | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            yield { delta: "", toolCalls: [], done: true };
            return;
          }

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content || "";
            const toolCalls = chunk.choices?.[0]?.delta?.tool_calls || [];

            for (const tc of toolCalls) {
              if (tc.id) {
                currentToolCall = { id: tc.id, name: tc.function?.name || "", arguments: tc.function?.arguments || "" };
                toolCallBuffer.set(tc.id, currentToolCall);
              } else if (currentToolCall) {
                const existing = toolCallBuffer.get(currentToolCall.id)!;
                existing.arguments += tc.function?.arguments || "";
              }
            }

            if (delta || toolCalls.length > 0) {
              const parsedToolCalls: ToolCall[] = [];
              for (const [id, tc] of toolCallBuffer) {
                if (tc.name) {
                  parsedToolCalls.push({
                    id,
                    name: tc.name,
                    arguments: JSON.parse(tc.arguments || "{}"),
                  });
                }
              }
              yield { delta, toolCalls: parsedToolCalls, done: false };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}