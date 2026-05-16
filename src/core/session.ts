import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Message } from "../types/index.js";

export class SessionManager {
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = join(homedir(), ".kamla", "sessions");
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  saveSession(name: string, messages: Message[]): void {
    const filePath = join(this.sessionsDir, `${name}.json`);
    writeFileSync(filePath, JSON.stringify(messages, null, 2));
  }

  loadSession(name: string): Message[] {
    const filePath = join(this.sessionsDir, `${name}.json`);
    if (!existsSync(filePath)) return [];
    try {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }

  listSessions(): string[] {
    if (!existsSync(this.sessionsDir)) return [];
    return readdirSync(this.sessionsDir)
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(".json", ""));
  }
}

export const sessionManager = new SessionManager();
