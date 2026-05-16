import { ShellTool } from "../dist/tools/shell.js";
import { jest } from "@jest/globals";

describe("ShellTool", () => {
  const mockConfig = { sandbox: "full", blockCommands: [], approveCommands: [] };

  describe("execute", () => {
    it("should execute a simple command", async () => {
      const tool = new ShellTool();
      const result = await tool.execute({ command: "echo 'hello world'" }, mockConfig);
      expect(result.trim()).toBe("hello world");
    });

    it("should return error for invalid command", async () => {
      const tool = new ShellTool();
      const result = await tool.execute({ command: "non-existent-command-12345" }, mockConfig);
      expect(result).toContain("not found");
    });

    it("should respect sandbox read-only mode", async () => {
      const tool = new ShellTool();
      const result = await tool.execute({ command: "ls" }, { ...mockConfig, sandbox: "read-only" });
      expect(JSON.parse(result).error).toContain("disabled in read-only mode");
    });
  });

  describe("needsApproval", () => {
    it("should require approval for dangerous commands in restricted mode", () => {
      const tool = new ShellTool();
      const dangerousConfig = { sandbox: "restricted", blockCommands: [], approveCommands: [] };
      
      expect(tool.needsApproval({ command: "rm -rf /" }, dangerousConfig)).toBe(true);
      expect(tool.needsApproval({ command: "ls" }, dangerousConfig)).toBe(false);
    });

    it("should not require approval in full sandbox mode", () => {
      const tool = new ShellTool();
      const fullConfig = { sandbox: "full", blockCommands: [], approveCommands: [] };
      
      expect(tool.needsApproval({ command: "rm -rf /" }, fullConfig)).toBe(false);
    });

    it("should respect blockCommands", () => {
      const tool = new ShellTool();
      const config = { sandbox: "full", blockCommands: ["secret-cmd"], approveCommands: [] };
      
      expect(tool.needsApproval({ command: "secret-cmd" }, config)).toBe(true);
    });
  });
});
