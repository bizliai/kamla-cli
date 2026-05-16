# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2024-01-01

### Added
- Interactive chat mode (`kamla chat`)
- Autonomous task runner (`kamla run <task>`)
- Configurable LLM provider support (OpenAI, OpenCode)
- Sandbox security modes (read-only, restricted, full)
- Configuration setup wizard
- File and shell tools for agent execution

### Dependencies
- commander - CLI parsing
- ora - Terminal spinners
- chalk - Terminal styling
- dotenv - Environment variables
- conf - Configuration storage
- inquirer - Interactive prompts