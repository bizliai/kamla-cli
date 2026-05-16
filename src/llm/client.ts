import { 
  generateText, 
  streamText, 
  LanguageModel, 
  tool
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createCohere } from "@ai-sdk/cohere";
import { replicate } from "@ai-sdk/replicate";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Message, ToolCall, AgentConfig } from "../types/index.js";
import { logger } from "../core/logger.js";
import { z } from "zod";

export class LLMClient {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  private getModel(modelId: string): LanguageModel {
    const [providerId, ...modelNameParts] = modelId.split("/");
    const modelName = modelNameParts.join("/");

    // Fallback for old config style (no provider prefix)
    if (!modelName && providerId) {
      const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY || process.env.OPENCODE_API_KEY;
      const baseURL = this.config.apiEndpoint || "https://api.openai.com/v1";
      
      const provider = createOpenAI({
        apiKey,
        baseURL,
      });
      return provider(providerId);
    }

    const providerConfig = this.config.providers?.[providerId];
    const apiKey = providerConfig?.apiKey || (providerId !== "other" ? process.env[`${providerId.toUpperCase()}_API_KEY`] : undefined);
    const baseURL = providerConfig?.baseURL;

    switch (providerId) {
      case "openai":
        return createOpenAI({ apiKey, baseURL })(modelName);
      case "anthropic":
        return createAnthropic({ apiKey, baseURL })(modelName);
      case "google":
        return createGoogleGenerativeAI({ apiKey, baseURL })(modelName);
      case "mistral":
        return createMistral({ apiKey, baseURL })(modelName);
      case "groq":
        return createGroq({ apiKey, baseURL })(modelName);
      case "deepseek":
        return createDeepSeek({ apiKey, baseURL })(modelName);
      case "cohere":
        return createCohere({ apiKey, baseURL })(modelName);
      case "replicate":
        return (replicate as any).model(modelName);
      case "opencode":
        return createOpenAICompatible({
          name: "opencode",
          apiKey: apiKey || this.config.apiKey,
          baseURL: baseURL || "https://opencode.ai/zen/v1",
        })(modelName);
      default:
        if (baseURL) {
          return createOpenAICompatible({
            name: providerId,
            apiKey,
            baseURL,
          })(modelName);
        }
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }

  async chat(
    messages: Message[],
    tools?: { name: string; description: string; parameters: Record<string, any> }[]
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const coreMessages: any[] = otherMessages.map((msg) => {
      if (msg.role === "tool") {
        let resultValue: any = msg.content;
        try {
          if (msg.content.startsWith("{") || msg.content.startsWith("[")) {
            resultValue = JSON.parse(msg.content);
          }
        } catch { /* not json */ }

        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: msg.tool_call_id!,
              toolName: msg.name!,
              output: {
                type: "json",
                value: resultValue,
              },
            },
          ],
        };
      }
      if (msg.role === "assistant") {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ type: "text", text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            parts.push({
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.arguments,
            });
          }
        }
        return {
          role: "assistant",
          content: parts.length > 0 ? parts : "",
        };
      }
      return {
        role: "user",
        content: msg.content,
      };
    });

    const aiTools: Record<string, any> = {};
    if (tools) {
      for (const t of tools) {
        aiTools[t.name] = tool({
          description: t.description,
          parameters: z.object(t.parameters as any),
        } as any);
      }
    }

    const model = this.getModel(this.config.model);
    const { text, toolCalls } = await generateText({
      model,
      system: systemMessages.map((m) => m.content).join("\n"),
      messages: coreMessages,
      tools: aiTools,
      temperature: this.config.temperature,
    });

    return {
      content: text,
      toolCalls: (toolCalls || []).map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: (tc as any).args || (tc as any).input || {},
      })),
    };
  }

  async *streamChat(
    messages: Message[],
    tools?: { name: string; description: string; parameters: Record<string, any> }[]
  ): AsyncGenerator<{ delta: string; toolCalls: ToolCall[]; done: boolean }> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const coreMessages: any[] = otherMessages.map((msg) => {
      if (msg.role === "tool") {
        let resultValue: any = msg.content;
        try {
          if (msg.content.startsWith("{") || msg.content.startsWith("[")) {
            resultValue = JSON.parse(msg.content);
          }
        } catch { /* not json */ }

        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: msg.tool_call_id!,
              toolName: msg.name!,
              output: {
                type: "json",
                value: resultValue,
              },
            },
          ],
        };
      }
      if (msg.role === "assistant") {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ type: "text", text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            parts.push({
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.arguments,
            });
          }
        }
        return {
          role: "assistant",
          content: parts.length > 0 ? parts : "",
        };
      }
      return {
        role: "user",
        content: msg.content,
      };
    });

    const aiTools: Record<string, any> = {};
    if (tools) {
      for (const t of tools) {
        aiTools[t.name] = tool({
          description: t.description,
          parameters: z.object(t.parameters as any),
        } as any);
      }
    }

    const model = this.getModel(this.config.model);
    const result = await streamText({
      model,
      system: systemMessages.map((m) => m.content).join("\n"),
      messages: coreMessages,
      tools: aiTools,
      temperature: this.config.temperature,
    });

    let toolCalls: ToolCall[] = [];

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        const delta = (part as any).text || (part as any).textDelta || "";
        if (delta) {
          yield { delta, toolCalls: [], done: false };
        }
      } else if (part.type === "tool-call") {
        const tc: ToolCall = {
          id: part.toolCallId,
          name: part.toolName,
          arguments: (part as any).args || (part as any).input || {},
        };
        toolCalls.push(tc);
        yield { delta: "", toolCalls, done: false };
      } else if (part.type === "finish") {
        yield { delta: "", toolCalls, done: true };
      }
    }
  }
}