import chalk from "chalk";
import type { LogLevel } from "../types/index.js";

export class Logger {
  private level: LogLevel = "info";

  constructor(level: LogLevel = "info") {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog("debug")) {
      console.log(chalk.gray(`[DEBUG] ${message}`), data || "");
    }
  }

  info(message: string): void {
    if (this.shouldLog("info")) {
      console.log(chalk.blue(`[INFO] ${message}`));
    }
  }

  warn(message: string, error?: unknown): void {
    if (this.shouldLog("warn")) {
      console.warn(chalk.yellow(`[WARN] ${message}`), error || "");
    }
  }

  error(message: string, error?: unknown): void {
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
