import chalk from "chalk";
import type { LogLevel } from "../types/index.js";
import { appendFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

export class Logger {
  private level: LogLevel = "info";
  private logFile: string;

  constructor(level: LogLevel = "info") {
    this.level = level;
    this.logFile = join(process.cwd(), "kamla.log");
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private writeToFile(level: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message} ${data ? JSON.stringify(data) : ""}\n`;
    try {
      appendFileSync(this.logFile, logEntry);
    } catch (e) {
      // Ignore logging errors
    }
  }

  debug(message: string, data?: unknown): void {
    this.writeToFile("debug", message, data);
    if (this.shouldLog("debug")) {
      console.log(chalk.gray(`[DEBUG] ${message}`), data || "");
    }
  }

  info(message: string): void {
    this.writeToFile("info", message);
    if (this.shouldLog("info")) {
      console.log(chalk.blue(`[INFO] ${message}`));
    }
  }

  warn(message: string, error?: unknown): void {
    this.writeToFile("warn", message, error);
    if (this.shouldLog("warn")) {
      console.warn(chalk.yellow(`[WARN] ${message}`), error || "");
    }
  }

  error(message: string, error?: unknown): void {
    this.writeToFile("error", message, error);
    if (this.shouldLog("error")) {
      console.error(chalk.red(`[ERROR] ${message}`), error || "");
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
}

export const logger = new Logger();
