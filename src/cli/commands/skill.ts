import { Command } from "commander";
import { SkillManager } from "../../core/skills.js";
import chalk from "chalk";
import ora from "ora";
import { symbols, box, COLORS } from "../tui.js";

export function skillCommand(): Command {
  const skill = new Command("skill");
  const manager = new SkillManager();

  skill
    .description("Manage agent skills");

  skill
    .command("list")
    .description("List installed skills")
    .action(async () => {
      const skills = await manager.listSkills();
      if (skills.length === 0) {
        console.log(`${symbols.warning} ${chalk.yellow("No skills installed.")}`);
        return;
      }

      const content = skills.map(s => `${chalk.green(s.name)}: ${s.description}`).join("\n");
      console.log(box(content, "INSTALLED SKILLS", COLORS.secondary));
    });

  skill
    .command("install <url>")
    .description("Install a skill from a Git URL or local path")
    .option("-s, --skill <name>", "Specific skill name in a monorepo")
    .action(async (url, opts) => {
      const spinner = ora(`Installing skill from ${url}...`).start();
      try {
        const name = await manager.installSkill(url, opts.skill);
        spinner.succeed(`Skill ${chalk.green(name)} installed successfully!`);
      } catch (e: any) {
        spinner.fail(`Failed to install skill: ${e.message}`);
      }
    });


  skill
    .command("uninstall <name>")
    .description("Uninstall a skill")
    .action(async (name) => {
      const spinner = ora(`Uninstalling skill ${name}...`).start();
      try {
        await manager.uninstallSkill(name);
        spinner.succeed(`Skill ${chalk.green(name)} uninstalled successfully!`);
      } catch (e: any) {
        spinner.fail(`Failed to uninstall skill: ${e.message}`);
      }
    });

  return skill;
}
