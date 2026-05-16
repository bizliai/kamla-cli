import { exec, spawn } from "child_process";
import { promisify } from "util";
import type { ToolDefinition, AgentConfig } from "../types/index.js";
import type { Tool } from "../core/tools.js";

const execAsync = promisify(exec);

const shellDefinition: ToolDefinition = {
  name: "shell",
  description: "Execute a shell command in the current working directory. Use this for running programs, git commands, npm scripts, etc.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to execute (e.g., 'npm install', 'git status')",
      },
      timeout: {
        type: "number",
        description: "Maximum execution time in seconds (default: 30)",
      },
    },
    required: ["command"],
  },
};

export class ShellTool implements Tool {
  definition = shellDefinition;

  async execute(args: Record<string, unknown>, config: AgentConfig): Promise<string> {
    const command = args.command as string;
    const timeout = (args.timeout as number) || 30;

    if (!command) {
      return JSON.stringify({ error: "No command provided" });
    }

    if (config.sandbox === "read-only") {
      return JSON.stringify({ error: "Shell commands are disabled in read-only mode" });
    }

    try {
      const cwd = process.cwd();
      const result = await execAsync(command, {
        cwd,
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024,
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      });

      let output = "";
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += "\n[stderr]\n" + result.stderr;

      return output || "[No output]";
    } catch (e: unknown) {
      const error = e as { message?: string; stdout?: string; stderr?: string };
      let errorOutput = error.message || String(e);
      if (error.stdout) errorOutput += "\n[stdout]\n" + error.stdout;
      if (error.stderr) errorOutput += "\n[stderr]\n" + error.stderr;
      return errorOutput;
    }
  }

  needsApproval(args: Record<string, unknown>, config: AgentConfig): boolean {
    const command = (args.command as string) || "";
    const cmdLower = command.toLowerCase();

    if (config.blockCommands.some((blocked) => cmdLower.includes(blocked.toLowerCase()))) {
      return true;
    }

    const isApproved = config.approveCommands.some((approved) => 
      cmdLower.includes(approved.toLowerCase())
    );
    
    if (config.sandbox === "full") {
      return false;
    }

    const dangerousPatterns = [
      "rm -rf",
      "git push",
      "git push --force",
      "curl | sh",
      "wget | sh",
      "npm publish",
      "pip install",
      "apt-get install",
      "docker run",
      "kubectl delete",
    ];

    return !isApproved && dangerousPatterns.some((p) => cmdLower.includes(p));
  }
}