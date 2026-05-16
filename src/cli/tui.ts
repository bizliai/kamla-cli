import chalk from "chalk";
import gradient from "gradient-string";
import boxen from "boxen";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

// Initialize marked with terminal renderer
const renderer = new TerminalRenderer({
  code: chalk.yellow,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  heading: chalk.cyan.bold,
  firstHeading: chalk.magenta.bold,
  hr: chalk.gray,
  listitem: chalk.white,
  table: chalk.gray,
  paragraph: chalk.white,
  strong: chalk.bold,
  em: chalk.italic,
  codespan: chalk.yellow,
  del: chalk.dim.strikethrough,
  link: chalk.blue,
  href: chalk.blue.underline,
});

marked.setOptions({ renderer: renderer as any });

export const COLORS = {
  primary: "#00FFCC",
  secondary: "#3366FF",
  accent: "#FF00CC",
  success: "#00FF00",
  error: "#FF0000",
  warning: "#FFFF00",
};

export const kamlaGradient = gradient([COLORS.primary, COLORS.secondary]) as any;

export function printBanner() {
  const logo = `
   ██╗  ██╗ █████╗ ███╗   ███╗██╗      █████╗ 
   ██║ ██╔╝██╔══██╗████╗ ████║██║     ██╔══██╗
   █████╔╝ ███████║██╔████╔██║██║     ███████║
   ██╔═██╗ ██╔══██║██║╚██╔╝██║██║     ██╔══██║
   ██║  ██╗██║  ██║██║ ╚═╝ ██║███████╗██║  ██║
   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝
  `;
  
  console.log(kamlaGradient(logo));
  console.log(chalk.gray("   Code, create, and automate with AI\n"));
}

export function renderMarkdown(content: string): string {
  return marked.parse(content) as string;
}

export function box(content: string, title?: string, color: string = COLORS.primary) {
  return boxen(content, {
    padding: 1,
    margin: 1,
    borderStyle: "round",
    borderColor: color,
    title: title ? chalk.bold(title) : undefined,
    titleAlignment: "center",
  });
}

export const symbols = {
  info: chalk.blue("ℹ"),
  success: chalk.green("✔"),
  warning: chalk.yellow("⚠"),
  error: chalk.red("✖"),
  agent: kamlaGradient("◆"),
  user: chalk.bold.green("●"),
};
