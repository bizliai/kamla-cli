<p align="center">
  <img src="assets/logo.png" alt="Kamla Logo" width="200" />
</p>

# Kamla 🤖

[![npm version](https://img.shields.io/npm/v/kamla-cli.svg?style=flat-square)](https://www.npmjs.com/package/kamla-cli)
[![Documentation](https://img.shields.io/badge/docs-online-brightgreen?style=flat-square)](https://bizliai.github.io/kamla-cli/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green.svg?style=flat-square)](https://nodejs.org/)

**Kamla** is an AI-powered CLI tool to code, create, and automate tasks directly from your terminal. Built with safety and speed in mind, Kamla leverages Large Language Models (LLMs) to perform complex tasks across your filesystem while providing a secure sandbox environment.

---

## 📚 Documentation

View the full documentation at **[bizliai.github.io/kamla-cli](https://bizliai.github.io/kamla-cli/)**.

---

## ✨ Features

- 🧠 **Autonomous Task Execution**: Give a high-level instruction, and Kamla will plan and execute it.
- 💬 **Interactive Chat**: Pair-program with the agent in a real-time terminal interface.
- 🛡️ **Multi-level Sandboxing**: Control what the agent can do with `read-only`, `restricted`, and `full` access modes.
- 🛠️ **Custom Skills**: Extend the agent's capabilities with dynamic tools installed via Git or local scripts.
- ⚙️ **Provider Agnostic**: Support for OpenAI, OpenCode, and other LLM providers.

- 🚀 **Built for Developers**: Fast, lightweight, and written in TypeScript.
- 🔒 **Security First**: Configurable command blocklists and manual approval workflows.

---

## 🚀 Quick Start

### Installation

Install Kamla globally via npm:

```bash
npm install -g kamla-cli
```

### Initial Setup

Initialize Kamla and configure your LLM provider:

```bash
kamla init
```

Alternatively, you can set environment variables:

```bash
export OPENAI_API_KEY='your-key-here'
```

---

## 🛠️ Usage

### 💬 Interactive Mode
Collaborate with Kamla in a continuous session. This is perfect for complex debugging or architectural discussions.

```bash
kamla chat
```

### ⚡ Run a Task
Execute a specific task autonomously and exit when finished.

```bash
kamla run "Refactor all exported functions in src/utils.ts to use arrow functions"
```

### 🔍 Configuration Management
View or update your current settings.

```bash
kamla config
```

### 🛠️ Skills Management
Extend Kamla's capabilities by installing new skills.

```bash
# List installed skills
kamla skill list

# Install a skill from a Git repository
kamla skill install https://github.com/user/my-skill.git

# Install skills from the local installer
./skills.sh
```

Within the chat, you can also use `/skill` to manage tools dynamically.


---

## 🛡️ Sandbox & Security

Kamla provides granular control over the agent's environment to ensure your system remains safe.

| Mode | Capabilities | Description |
| :--- | :--- | :--- |
| `read-only` | 👀 Read | Agent can only read files. No modifications or command execution. |
| `restricted` | ✍️ Read/Write | Agent can modify files but requires approval for most shell commands. |
| `full` | 🔥 Unlimited | Full access to filesystem and terminal execution. Use with caution. |

### Command Filtering
Configure `kamla.config.json` to block specific dangerous commands (e.g., `rm -rf /`) or require explicit approval for sensitive operations.

---

## ⚙️ Configuration

Kamla uses a `kamla.config.json` file in your project root or home directory.

```json
{
  "model": "minimax-m2.5-free",
  "apiEndpoint": "https://opencode.ai/zen/v1",
  "sandbox": "restricted",
  "approveCommands": ["npm test", "git commit"],
  "blockCommands": ["rm -rf", "dd"]
}
```

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ by the Kamla Contributors
</p>