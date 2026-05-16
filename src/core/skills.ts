import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import type { ToolDefinition, AgentConfig, SkillManifest, Message } from "../types/index.js";
import type { Tool } from "./tools.js";


const execAsync = promisify(exec);


export class SkillTool implements Tool {
  constructor(
    public definition: ToolDefinition,
    private command: string | undefined,
    private skillDir: string,
    public instructions?: string
  ) {}


  async execute(args: Record<string, unknown>, config: AgentConfig): Promise<string> {
    if (!this.command) {
      return `This is a prompt-based skill. Instructions: ${this.instructions}`;
    }

    // Replace placeholders in command with arguments

    let cmd = this.command;
    cmd = cmd.replace(/{{skillDir}}/g, this.skillDir);
    
    for (const [key, value] of Object.entries(args)) {
      cmd = cmd.replace(new RegExp(`{{${key}}}`, "g"), String(value));
    }


    // Also support passing all args as JSON if needed, but for now simple replacement is fine
    // Or just pass them as env vars
    const env = { ...process.env };
    for (const [key, value] of Object.entries(args)) {
      env[`SKILL_ARG_${key.toUpperCase()}`] = String(value);
      env[`ARG_${key.toUpperCase()}`] = String(value);
    }

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: process.cwd(),
        env,
        timeout: config.timeout,
      });

      let output = stdout;
      if (stderr) output += "\n[stderr]\n" + stderr;
      return output || "[No output]";
    } catch (e: any) {
      return `Error executing skill ${this.definition.name}: ${e.message}\n${e.stderr || ""}`;
    }
  }

  needsApproval(args: Record<string, unknown>, config: AgentConfig): boolean {
    // Skills are generally considered potentially dangerous
    return config.sandbox !== "full";
  }
}

export class SkillManager {
  private skillsDir: string;

  constructor() {
    this.skillsDir = path.join(os.homedir(), ".kamla", "skills");
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  async loadSkills(): Promise<Tool[]> {
    const skills: Tool[] = [];
    if (!fs.existsSync(this.skillsDir)) return [];

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(this.skillsDir, entry.name);
        const manifestPath = path.join(skillPath, "skill.json");
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest: SkillManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            skills.push(new SkillTool(
              {
                name: manifest.name,
                description: manifest.description,
                parameters: (manifest.parameters as any) || { type: "object", properties: {} },
              },
              manifest.command,
              skillPath,
              manifest.instructions
            ));
          } catch (e) {
            console.error(`Failed to load skill from ${skillPath}:`, e);
          }
        } else {
          // Check for SKILL.md
          const skillMdPath = path.join(skillPath, "SKILL.md");
          if (fs.existsSync(skillMdPath)) {
            try {
              const content = fs.readFileSync(skillMdPath, "utf-8");
              const manifest = this.parseSkillMd(content);
              skills.push(new SkillTool(
                {
                  name: manifest.name,
                  description: manifest.description,
                  parameters: { type: "object", properties: {} },
                },
                undefined,
                skillPath,
                content // Use full content as instructions
              ));
            } catch (e) {}
          }
        }
      }
    }
    return skills;
  }

  private parseSkillMd(content: string): SkillManifest {
    let name = "unknown";
    let description = "";

    // Check for YAML frontmatter
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
    if (frontmatterMatch) {
      const yaml = frontmatterMatch[1];
      const nameMatch = yaml.match(/^name:\s*(.+)$/m);
      const descMatch = yaml.match(/^description:\s*([\s\S]+?)(?=\n\w+:|$)/m);
      
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim().replace(/\r?\n\s*/g, " ");
    } else {
      // Fallback to simple table parser
      const lines = content.split("\n");
      for (const line of lines) {
        const match = line.match(/\|\s*(name|description)\s*\|\s*([^|]+)\|/i);
        if (match) {
          const key = match[1].toLowerCase();
          const value = match[2].trim();
          if (key === "name") name = value;
          if (key === "description") description = value;
        }
      }
    }

    return {
      name,
      description,
      parameters: { type: "object", properties: {} },
      instructions: content
    };
  }


  async listSkills(): Promise<SkillManifest[]> {
    const skills: SkillManifest[] = [];
    if (!fs.existsSync(this.skillsDir)) return [];

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(this.skillsDir, entry.name);
        const manifestPath = path.join(skillPath, "skill.json");
        const skillMdPath = path.join(skillPath, "SKILL.md");

        if (fs.existsSync(manifestPath)) {
          try {
            const manifest: SkillManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            skills.push(manifest);
          } catch (e) {}
        } else if (fs.existsSync(skillMdPath)) {
          try {
            const content = fs.readFileSync(skillMdPath, "utf-8");
            skills.push(this.parseSkillMd(content));
          } catch (e) {}
        }
      }
    }
    return skills;
  }

  async installSkill(url: string, subPath?: string): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `kamla-skill-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      if (url.endsWith(".git") || url.includes("github.com")) {
        await execAsync(`git clone --depth 1 ${url} ${tempDir}`);
      } else {
        if (fs.existsSync(url)) {
          await execAsync(`cp -r ${url}/* ${tempDir}`);
        } else {
          throw new Error("Only Git repositories or local paths are supported for now.");
        }
      }

      let sourceDir = tempDir;
      if (subPath) {
        // Support common subpaths like 'skills/name' or just 'name'
        const possiblePaths = [
          path.join(tempDir, subPath),
          path.join(tempDir, "skills", subPath),
          path.join(tempDir, "packages", subPath),
        ];
        
        const found = possiblePaths.find(p => fs.existsSync(p));
        if (found) {
          sourceDir = found;
        } else {
          throw new Error(`Subpath ${subPath} not found in the repository.`);
        }
      }

      const manifestPath = path.join(sourceDir, "skill.json");
      const skillMdPath = path.join(sourceDir, "SKILL.md");
      
      let manifest: SkillManifest;
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      } else if (fs.existsSync(skillMdPath)) {
        manifest = this.parseSkillMd(fs.readFileSync(skillMdPath, "utf-8"));
      } else {
        throw new Error("No skill.json or SKILL.md found in the specified path.");
      }

      const skillName = (subPath || manifest.name).toLowerCase().replace(/[^a-z0-9]/g, "-");
      const targetDir = path.join(this.skillsDir, skillName);

      if (fs.existsSync(targetDir)) {
        await execAsync(`rm -rf ${targetDir}`);
      }

      fs.mkdirSync(targetDir, { recursive: true });
      await execAsync(`cp -r ${sourceDir}/* ${targetDir}`);

      return skillName;
    } finally {
      await execAsync(`rm -rf ${tempDir}`);
    }
  }


  async uninstallSkill(name: string): Promise<void> {
    const targetDir = path.join(this.skillsDir, name);
    if (fs.existsSync(targetDir)) {
      await execAsync(`rm -rf ${targetDir}`);
    } else {
      throw new Error(`Skill ${name} not found.`);
    }
  }
}

