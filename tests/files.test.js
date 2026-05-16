import { ReadFileTool, WriteFileTool, EditFileTool, ListDirTool } from "../dist/tools/files.js";
import fs from "fs";
import { jest } from "@jest/globals";

describe("File Tools", () => {
  const mockConfig = { sandbox: "restricted" };
  const testFile = "test-file-js.txt";
  const testContent = "Hello, World!\nThis is a test file.";

  afterEach(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  describe("WriteFileTool", () => {
    it("should write content to a file", async () => {
      const tool = new WriteFileTool();
      const result = await tool.execute({ path: testFile, content: testContent }, mockConfig);
      
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(fs.readFileSync(testFile, "utf-8")).toBe(testContent);
    });
  });

  describe("ReadFileTool", () => {
    it("should read content from a file", async () => {
      fs.writeFileSync(testFile, testContent);
      const tool = new ReadFileTool();
      const result = await tool.execute({ path: testFile }, mockConfig);
      
      expect(result).toBe(testContent);
    });
  });

  describe("EditFileTool", () => {
    it("should replace all occurrences of text in a file", async () => {
      const multiContent = "abc abc abc";
      fs.writeFileSync(testFile, multiContent);
      const tool = new EditFileTool();
      const result = await tool.execute(
        { path: testFile, find: "abc", replace: "xyz" },
        mockConfig
      );
      
      expect(JSON.parse(result).success).toBe(true);
      expect(fs.readFileSync(testFile, "utf-8")).toBe("xyz xyz xyz");
    });
  });
});
