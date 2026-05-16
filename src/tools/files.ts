import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import type { ToolDefinition, AgentConfig } from "../types/index.js";
import type { Tool } from "../core/tools.js";

function isPathSafe(cwd: string, filePath: string): boolean {
  const resolvedPath = resolve(cwd, filePath);
  const resolvedCwd = resolve(cwd);
  return resolvedPath.startsWith(resolvedCwd);
}

const readFileDefinition: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file. Returns the file content or an error if the file doesn't exist or can't be read.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to read (relative to current directory or absolute)",
      },
    },
    required: ["path"],
  },
};

const writeFileDefinition: ToolDefinition = {
  name: "write_file",
  description: "Create or overwrite a file with new content. Use this to create new files or completely replace existing files.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to create/write",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["path", "content"],
  },
};

const editFileDefinition: ToolDefinition = {
  name: "edit_file",
  description: "Apply a targeted edit to an existing file. Specify the exact text to replace and what to replace it with.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to edit",
      },
      find: {
        type: "string",
        description: "The exact text to find in the file",
      },
      replace: {
        type: "string",
        description: "The text to replace it with",
      },
    },
    required: ["path", "find", "replace"],
  },
};

const listDirDefinition: ToolDefinition = {
  name: "list_dir",
  description: "List files and directories in a given path. Shows file names, sizes, and whether each item is a file or directory.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the directory to list (default: current directory)",
      },
    },
    required: [],
  },
};

export class ReadFileTool implements Tool {
  definition = readFileDefinition;

  async execute(args: Record<string, unknown>, config: AgentConfig): Promise<string> {
    const filePath = args.path as string;
    if (!filePath) return JSON.stringify({ error: "No path provided" });

    const cwd = process.cwd();
    if (!isPathSafe(cwd, filePath)) {
      return JSON.stringify({ error: "Access denied: path outside working directory" });
    }

    try {
      const resolvedPath = join(cwd, filePath);
      if (!existsSync(resolvedPath)) {
        return JSON.stringify({ error: `File not found: ${filePath}` });
      }
      const content = readFileSync(resolvedPath, "utf-8");
      return content;
    } catch (e) {
      return JSON.stringify({ error: String(e) });
    }
  }
}

export class WriteFileTool implements Tool {
  definition = writeFileDefinition;

  async execute(args: Record<string, unknown>, config: AgentConfig): Promise<string> {
    const filePath = args.path as string;
    const content = args.content as string;

    if (!filePath) return JSON.stringify({ error: "No path provided" });
    if (content === undefined) return JSON.stringify({ error: "No content provided" });

    if (config.sandbox === "read-only") {
      return JSON.stringify({ error: "Writing is disabled in read-only mode" });
    }

    const cwd = process.cwd();
    if (!isPathSafe(cwd, filePath)) {
      return JSON.stringify({ error: "Access denied: path outside working directory" });
    }

    try {
      const resolvedPath = join(cwd, filePath);
      writeFileSync(resolvedPath, content, "utf-8");
      return JSON.stringify({ success: true, path: filePath });
    } catch (e) {
      return JSON.stringify({ error: String(e) });
    }
  }
}

export class EditFileTool implements Tool {
  definition = editFileDefinition;

  async execute(args: Record<string, unknown>, config: AgentConfig): Promise<string> {
    const filePath = args.path as string;
    const findText = args.find as string;
    const replaceText = args.replace as string;

    if (!filePath) return JSON.stringify({ error: "No path provided" });
    if (!findText) return JSON.stringify({ error: "No find text provided" });
    if (replaceText === undefined) return JSON.stringify({ error: "No replace text provided" });

    if (config.sandbox === "read-only") {
      return JSON.stringify({ error: "Editing is disabled in read-only mode" });
    }

    const cwd = process.cwd();
    if (!isPathSafe(cwd, filePath)) {
      return JSON.stringify({ error: "Access denied: path outside working directory" });
    }

    try {
      const resolvedPath = join(cwd, filePath);
      if (!existsSync(resolvedPath)) {
        return JSON.stringify({ error: `File not found: ${filePath}` });
      }
      const content = readFileSync(resolvedPath, "utf-8");
      if (!content.includes(findText)) {
        return JSON.stringify({ error: "Text not found in file" });
      }
      const newContent = content.split(findText).join(replaceText);
      writeFileSync(resolvedPath, newContent, "utf-8");
      return JSON.stringify({ success: true, path: filePath });
    } catch (e) {
      return JSON.stringify({ error: String(e) });
    }
  }
}

export class ListDirTool implements Tool {
  definition = listDirDefinition;

  async execute(args: Record<string, unknown>, _config: AgentConfig): Promise<string> {
    const dirPath = (args.path as string) || ".";
    const cwd = process.cwd();

    if (!isPathSafe(cwd, dirPath)) {
      return JSON.stringify({ error: "Access denied: path outside working directory" });
    }

    const resolvedPath = join(cwd, dirPath);

    try {
      if (!existsSync(resolvedPath)) {
        return JSON.stringify({ error: `Directory not found: ${dirPath}` });
      }

      const entries = readdirSync(resolvedPath);
      const items = entries.map((name) => {
        const fullPath = join(resolvedPath, name);
        const stats = statSync(fullPath);
        return {
          name,
          type: stats.isDirectory() ? "dir" : "file",
          size: stats.size,
        };
      });

      return JSON.stringify(items, null, 2);
    } catch (e) {
      return JSON.stringify({ error: String(e) });
    }
  }
}