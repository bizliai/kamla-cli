# Kamla

Autonomous code agent powered by LLMs

## Installation

```bash
npm install -g kamla
```

## Usage

### Interactive Chat

Start an interactive chat session with the agent:

```bash
kamla chat
```

### Run Autonomous Task

Run a task autonomously:

```bash
kamla run "Create a new file called hello.txt with 'Hello World'"
```

### Configuration

Show current configuration:

```bash
kamla config
```

### Setup

Run the setup wizard to configure your LLM provider:

```bash
kamla setup
```

Or use the `init` command:

```bash
kamla init
```

## Options

Global options that can be used with any command:

- `-p, --provider <provider>` - LLM provider (openai, opencode)
- `-k, --api-key <key>` - API key
- `-m, --model <model>` - Model name
- `-s, --sandbox <mode>` - Sandbox mode (read-only, restricted, full)

### Sandbox Modes

- `read-only` - Can only read files, cannot execute commands
- `restricted` - Can read and write files, but with limited command execution
- `full` - Full access to file operations and shell commands

## Commands

- `chat` - Start an interactive chat session
- `run <task>` - Run a task autonomously
- `init` - Run the setup wizard
- `config` - Show current configuration
- `setup` - Run the setup wizard

## Configuration

Kamla uses `kamla.config.json` in the project root for configuration. You can also set environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENCODE_API_KEY` - Your OpenCode API key

## License

MIT