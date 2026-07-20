import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig, assertInsideRoot } from "./config.js";
import { parseGameProject, readProjectFile } from "./project/read.js";
import { listProjectTree } from "./project/list.js";
import { writeScript } from "./project/script.js";
import { initProject } from "./project/init.js";
import { runBobBuild } from "./build/bob.js";
import { parseBuildErrors } from "./build/parseErrors.js";
import { runHeadless } from "./run/headless.js";
import { hotReload } from "./run/hotReload.js";
import { parseTestOutput } from "./test/luaTest.js";
import {
  readCollectionFile,
  writeCollectionFile,
  parseCollection,
  serializeCollection,
  unifiedDiff,
  addGameObject,
  addComponent,
  setProperty,
} from "./project/collection.js";
import fs from "node:fs";
import path from "node:path";

const server = new McpServer({ name: "defold-mcp", version: "0.1.0" });

function safe<T extends unknown[]>(fn: (...args: T) => Promise<unknown>) {
  return async (...args: T) => {
    try {
      const text = await fn(...args);
      return { content: [{ type: "text" as const, text: String(text) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  };
}

server.tool(
  "defold_project_info",
  "Read and summarize the game.project file (title, resolution, main collection, dependencies).",
  {},
  safe(async () => {
    const config = getConfig();
    const gameProjectPath = path.join(config.projectRoot, "game.project");
    if (!fs.existsSync(gameProjectPath)) {
      throw new Error("game.project not found in project root.");
    }
    const content = fs.readFileSync(gameProjectPath, "utf8");
    const data = parseGameProject(content);

    const projectSection = data["project"] || {};
    const displaySection = data["display"] || {};
    const bootstrapSection = data["bootstrap"] || {};

    const title = projectSection["title"] || "Untitled";
    const width = parseInt(displaySection["width"] || "0", 10) || 0;
    const height = parseInt(displaySection["height"] || "0", 10) || 0;
    const mainCollection = bootstrapSection["main_collection"] || "";

    const dependencies: string[] = [];
    for (const key of Object.keys(projectSection)) {
      if (/^dependencies\d*$/.test(key)) {
        const val = projectSection[key];
        if (val) dependencies.push(val);
      }
    }

    return JSON.stringify(
      {
        title,
        resolution: { width, height },
        mainCollection,
        dependencies,
      },
      null,
      2
    );
  })
);

server.tool(
  "defold_list_project",
  "List the Defold project tree (collections, game objects, scripts, atlases, tilesources).",
  { path: z.string().optional() },
  safe(async (args: { path?: string }) => {
    const config = getConfig();
    return listProjectTree(config.projectRoot, args.path);
  })
);

server.tool(
  "defold_read_file",
  "Read the contents of a file inside the Defold project (path-traversal protected).",
  { path: z.string() },
  safe(async (args: { path: string }) => {
    const config = getConfig();
    const resolved = assertInsideRoot(config.projectRoot, args.path);
    return readProjectFile(args.path);
  })
);

server.tool(
  "defold_write_script",
  "Write or overwrite a Lua .script file in the Defold project (creates parent dirs if needed).",
  {
    path: z.string(),
    content: z.string(),
  },
  safe(async (args: { path: string; content: string }) => {
    const result = writeScript(args.path, args.content);
    return JSON.stringify(result);
  })
);

server.tool(
  "defold_init_project",
  "Scaffold a brand-new, minimal, valid Defold project from scratch (game.project, main collection, script, .gitignore). Refuses to overwrite an existing project.",
  {
    name: z.string(),
    targetPath: z.string().optional(),
  },
  safe(async (args: { name: string; targetPath?: string }) => {
    const result = initProject({ name: args.name, targetPath: args.targetPath });
    return JSON.stringify(result, null, 2);
  })
);

server.tool(
  "defold_build",
  "Build the Defold project with bob.jar. Returns parsed errors and raw log. variant defaults to 'debug'; archive defaults to true.",
  {
    variant: z.enum(["debug", "release", "headless"]).optional(),
    archive: z.boolean().optional(),
  },
  safe(
    async (args: {
      variant?: "debug" | "release" | "headless";
      archive?: boolean;
    }) => {
      const variant = args.variant ?? "debug";
      const archive = args.archive ?? true;
      const { stdout, stderr, code } = await runBobBuild({
        variant,
        archive,
        timeoutMs: 120000,
      });
      const rawLog = (stdout + "\n" + stderr).trim();
      const errors = parseBuildErrors(rawLog);
      const truncated =
        rawLog.length > 4000 ? rawLog.slice(-4000) : rawLog;
      const result = {
        success:
          code === 0 && errors.filter((e) => e.severity === "error").length === 0,
        errors,
        rawLog: truncated,
      };
      return JSON.stringify(result, null, 2);
    }
  )
);

server.tool(
  "defold_edit_collection",
  "Edit a Defold .collection file: add a game object, add a component to a game object, or set a property. Returns a unified diff of the change.",
  {
    collectionPath: z.string(),
    operation: z.enum(["add_gameobject", "add_component", "set_property"]),
    params: z.object({
      id: z.string().optional(),
      scriptPath: z.string().optional(),
      position: z.tuple([z.number(), z.number(), z.number()]).optional(),
      gameObjectId: z.string().optional(),
      componentId: z.string().optional(),
      componentPath: z.string().optional(),
      key: z.string().optional(),
      value: z.union([z.number(), z.string(), z.boolean()]).optional(),
    }),
  },
  safe(async (args: {
    collectionPath: string;
    operation: "add_gameobject" | "add_component" | "set_property";
    params: {
      id?: string;
      scriptPath?: string;
      position?: [number, number, number];
      gameObjectId?: string;
      componentId?: string;
      componentPath?: string;
      key?: string;
      value?: number | string | boolean;
    };
  }) => {
    const oldText = fs.readFileSync(assertInsideRoot(getConfig().projectRoot, args.collectionPath), "utf8");
    const doc = readCollectionFile(args.collectionPath);
    let next = doc;
    if (args.operation === "add_gameobject") {
      if (!args.params.id) throw new Error("add_gameobject requires params.id");
      next = addGameObject(doc, {
        id: args.params.id,
        scriptPath: args.params.scriptPath,
        position: args.params.position,
      });
    } else if (args.operation === "add_component") {
      const { gameObjectId, componentId, componentPath } = args.params;
      if (!gameObjectId || !componentId || !componentPath)
        throw new Error("add_component requires params.gameObjectId, params.componentId, params.componentPath");
      next = addComponent(doc, { gameObjectId, componentId, componentPath });
    } else if (args.operation === "set_property") {
      const { gameObjectId, key, value } = args.params;
      if (!gameObjectId || !key || value === undefined)
        throw new Error("set_property requires params.gameObjectId, params.key, params.value");
      next = setProperty(doc, { gameObjectId, key, value });
    }
    const newText = serializeCollection(next);
    writeCollectionFile(args.collectionPath, next);
    return unifiedDiff(oldText, newText, args.collectionPath);
  })
);

server.tool(
  "defold_run_headless",
  "Run the built Defold game headlessly and capture its stdout/log. Kills after timeoutSec (default 10).",
  {
    timeoutSec: z.number().int().positive().optional(),
    settingsFile: z.string().optional(),
    variant: z.enum(["debug", "release", "headless"]).optional(),
  },
  safe(async (args: {
    timeoutSec?: number;
    settingsFile?: string;
    variant?: "debug" | "release" | "headless";
  }) => {
    const result = await runHeadless({
      variant: args.variant,
      timeoutSec: args.timeoutSec,
      settingsFile: args.settingsFile,
    });
    return JSON.stringify(result, null, 2);
  })
);

server.tool(
  "defold_run_tests",
  "Build with --variant headless, run headlessly with an optional test settings file, and parse PASS/FAIL lines from the log.",
  {
    testFile: z.string().optional(),
    settingsFile: z.string().optional(),
    timeoutSec: z.number().int().positive().optional(),
  },
  safe(async (args: {
    testFile?: string;
    settingsFile?: string;
    timeoutSec?: number;
  }) => {
    const { stdout, stderr } = await runBobBuild({ variant: "headless", archive: true, timeoutMs: 120000 });
    const buildLog = (stdout + "\n" + stderr).trim();
    const buildIssues = parseBuildErrors(buildLog);
    if (buildIssues.filter((e) => e.severity === "error").length > 0) {
      return JSON.stringify({
        passed: 0,
        failed: 0,
        details: [],
        buildErrors: buildIssues,
        note: "Build failed; tests were not run.",
      }, null, 2);
    }
    const run = await runHeadless({ variant: "headless", timeoutSec: args.timeoutSec ?? 15, settingsFile: args.settingsFile });
    const summary = parseTestOutput(run.log);
    const result = { ...summary, log: run.log.slice(-4000), crashed: run.crashed, timedOut: run.timedOut };
    return JSON.stringify(result, null, 2);
  })
);

server.tool(
  "defold_hot_reload",
  "EXPERIMENTAL: best-effort trigger of Defold engine hot-reload via the engine service port. May not work depending on Defold version. If it fails, use defold_build + relaunch instead.",
  {},
  safe(async () => {
    const result = await hotReload();
    return JSON.stringify(result, null, 2);
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
