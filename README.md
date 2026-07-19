# defold-mcp

> An MCP server that gives AI coding agents full control over Defold game engine projects — inspect, scaffold, edit, build, run, and test.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)
![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-ff69b4.svg)

An MCP (Model Context Protocol) server that gives AI coding agents — **Claude Code**, **OpenCode**, and **Codex** — full control over a [Defold](https://defold.com) game engine project. It lets an agent inspect a project, scaffold brand-new projects, write scripts, edit collections, build with `bob.jar`, run the game headlessly, and run a Lua test suite — all over a local **stdio** connection.

`defold-mcp` is a Node.js / TypeScript ESM server. It is a local development tool: it talks to your Defold project on disk and shells out (only) to `java -jar bob.jar` and `dmengine_headless`. There is no HTTP/SSE transport and no authentication — it is intended strictly for local use.

## Table of Contents

- [🎮 Overview](#-overview)
- [✨ Features](#-features)
- [📦 Install / Build](#-install--build)
- [⚙️ Environment Variables](#️-environment-variables)
- [🔌 MCP Client Registration](#-mcp-client-registration)
- [🛠️ Tools Reference](#️-tools-reference)
- [✅ Test Script Convention](#-test-script-convention)
- [⚠️ Known Limitations](#️-known-limitations)
- [🗺️ Roadmap](#️-roadmap)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🎮 Overview

An MCP (Model Context Protocol) server that gives AI coding agents — **Claude Code**, **OpenCode**, and **Codex** — full control over a [Defold](https://defold.com) game engine project. It lets an agent inspect a project, scaffold brand-new projects, write scripts, edit collections, build with `bob.jar`, run the game headlessly, and run a Lua test suite — all over a local **stdio** connection.

`defold-mcp` is a Node.js / TypeScript ESM server. It is a local development tool: it talks to your Defold project on disk and shells out (only) to `java -jar bob.jar` and `dmengine_headless`. There is no HTTP/SSE transport and no authentication — it is intended strictly for local use.

## ✨ Features

A quick glance at the 10 tools the server exposes:

- **Inspect** project config & file tree
- **Read / write** scripts and files
- **Scaffold** new Defold projects
- **Edit** collections (objects/components/props)
- **Build** with `bob.jar`
- **Run** the game headlessly
- **Run** a Lua test suite
- **Hot reload** (experimental)

## 📦 Install / Build

Requirements:

- **Node.js 20+**
- A Defold project (a directory containing `game.project`), or let the server scaffold one with `defold_init_project`.
- `bob.jar` and `dmengine_headless` must be provided by you (see below). They are **not** bundled.

```bash
npm install      # install dependencies
npm run build    # compile TypeScript -> dist/ (runs tsc)
npm start        # run the stdio MCP server (node dist/index.js)
```

For development without a build step:

```bash
npm run dev      # run directly from source (tsx src/index.ts)
```

`npm start` is what MCP clients launch. It runs `node dist/index.js`, which is the built stdio server entrypoint.

## ⚙️ Environment Variables

The server is configured entirely through environment variables. `DEFOLD_PROJECT_PATH` is the only commonly required one; the build/run tools degrade gracefully to clear errors if `BOB` / `DMENGINE_HEADLESS` are absent.

| Variable | Required? | Default | Description |
| --- | --- | --- | --- |
| `DEFOLD_PROJECT_PATH` | Recommended | `process.cwd()` | Absolute path to your Defold project root — the directory that contains `game.project`. All file operations (read, write, init) and project inspection are scoped to this directory. Every tool that touches the filesystem validates the target against this root (path-traversal protected). If omitted, the server falls back to `process.cwd()` (the directory it is launched from). Must exist. |
| `BOB` | Optional | `<DEFOLD_PROJECT_PATH>/.defold/bob.jar` | Absolute path to `bob.jar` — the official Defold build tool. If omitted, the server looks for `<DEFOLD_PROJECT_PATH>/.defold/bob.jar`. Download it from the [Defold releases page](https://github.com/defold/defold/releases) — pick a release, open the `bob` asset, and grab `bob.jar`. The server never auto-downloads it. |
| `DMENGINE_HEADLESS` | Optional | `PATH` lookup | Absolute path to the `dmengine_headless` binary — the headless Defold engine used to run the game and tests. If omitted, the server performs a `PATH` lookup for `dmengine_headless`. |

```bash
DEFOLD_PROJECT_PATH=/home/you/projects/my-defold-game
BOB=/opt/defold/bob/bob.jar
DMENGINE_HEADLESS=/opt/defold/bin/x86_64-linux/dmengine_headless
```

## 🔌 MCP Client Registration

Register `defold-mcp` with your MCP client as a **stdio** server. The `command` launches `node` with the built entrypoint `dist/index.js` as its single argument. Replace the placeholder paths with real absolute paths on your machine.

<details>
<summary><strong>Claude Code</strong></summary>

Add to your project's `.mcp.json` (or configure globally via `claude mcp add`):

```json
{
  "mcpServers": {
    "defold": {
      "command": "node",
      "args": ["/abs/path/to/defold-mcp/dist/index.js"],
      "env": {
        "DEFOLD_PROJECT_PATH": "/abs/path/to/your-defold-project",
        "BOB": "/abs/path/to/bob.jar",
        "DMENGINE_HEADLESS": "/abs/path/to/dmengine_headless"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>OpenCode</strong></summary>

Add to `~/.config/opencode/opencode.json` (or a project-local `.opencode.json`):

```json
{
  "mcpServers": {
    "defold": {
      "command": "node",
      "args": ["/abs/path/to/defold-mcp/dist/index.js"],
      "env": {
        "DEFOLD_PROJECT_PATH": "/abs/path/to/your-defold-project",
        "BOB": "/abs/path/to/bob.jar",
        "DMENGINE_HEADLESS": "/abs/path/to/dmengine_headless"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Codex</strong></summary>

Add to `~/.codex/config.toml` (or a project-local `codex.config.toml`):

```toml
[[mcp_servers]]
name = "defold"
command = "node"
args = ["/abs/path/to/defold-mcp/dist/index.js"]

[mcp_servers.env]
DEFOLD_PROJECT_PATH = "/abs/path/to/your-defold-project"
BOB = "/abs/path/to/bob.jar"
DMENGINE_HEADLESS = "/abs/path/to/dmengine_headless"
```

</details>

## 🛠️ Tools Reference

| Tool | Input | Description |
| --- | --- | --- |
| `defold_project_info` | `{}` | Parse `game.project`, return `{title, resolution:{width,height}, mainCollection, dependencies[]}`. |
| `defold_list_project` | `{path?: string}` | Recursively list `.collection`/`.go`/`.script`/`.atlas`/`.tilesource` files, skipping `build/` and `.internal/`. Returns an indented tree. |
| `defold_read_file` | `{path: string}` | Read raw file text (path-traversal protected). |
| `defold_write_script` | `{path: string, content: string}` | Write/overwrite a `.script` Lua file (creates parent dirs). Path must end in `.script`. |
| `defold_init_project` | `{name: string, targetPath?: string}` | Scaffold a new project (game.project, main collection, script, .gitignore). Refuses to overwrite an existing one. |
| `defold_edit_collection` | `{collectionPath, operation, params}` | Add a game object, add a component, or set a property on a `.collection`; returns a unified diff. |
| `defold_build` | `{variant?, archive?}` | Run `java -jar bob.jar resolve build` (120s timeout), return `{success, errors, rawLog}` with parsed errors. |
| `defold_run_headless` | `{timeoutSec?, settingsFile?}` | Run the built engine headlessly, capture logs, kill after timeout (no zombies). |
| `defold_run_tests` | `{testFile?}` | Build with `--variant headless`, run headlessly, parse `PASS:`/`FAIL:` lines into pass/fail results. |
| `defold_hot_reload` | `{}` | **EXPERIMENTAL** best-effort engine hot reload. Always returns a structured result; never crashes the server. |

## ✅ Test Script Convention

Test scripts are ordinary Defold Lua scripts (`.script` / `.lua`) that run under the headless engine. To report results, print lines in one of these two exact formats:

```
PASS: <test_name>
FAIL: <test_name>: <reason>
```

Examples:

```lua
print("PASS: player_spawns_at_origin")
print("FAIL: inventory_adds_item: expected 1 item, got 0")
```

`defold_run_tests` collects every `PASS:`/`FAIL:` line from the engine log and returns `{passed, failed, details:[{name, status, message?}]}`. Any line that does not match the convention is ignored. If the build step fails, tests are not run and `buildErrors` is returned in the result.

## ⚠️ Known Limitations

- **Collection parser is a custom brace-delimited implementation, not a full protobuf schema.** It parses and serializes the Defold protobuf-text `.collection` / `.go` format (`key { ... }` blocks and `key: value` scalars) and is verified by round-tripping real-format samples. It is not a complete protobuf round-trip; re-build and visually verify after any collection edit.
- **Hot reload is experimental.** The Defold engine service protocol is version-dependent and undocumented; it will likely fail on many setups. The tool always falls back to a clear structured message — use `defold_build` + relaunch instead.
- **`bob.jar` and `dmengine_headless` are not bundled.** The server requires you to provide them (see Environment variables). If missing, the build/run/test tools return clear errors instead of crashing.
- **Stdio only.** No HTTP/SSE transport. No authentication — intended strictly as a local development tool.

## 🗺️ Roadmap

All planned v1 tools are implemented.

## 🤝 Contributing

Issues and pull requests are welcome. If you'd like to contribute, open an issue to discuss the change first for anything substantial. By contributing you agree your contributions are licensed under the terms of the [MIT License](./LICENSE).

## 📄 License

`defold-mcp` is released under the [MIT License](./LICENSE). See the [LICENSE](./LICENSE) file for the full text.
