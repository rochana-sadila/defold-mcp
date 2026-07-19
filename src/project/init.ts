import fs from "node:fs";
import path from "node:path";
import { getConfig, resolveBobJar } from "../config.js";
import {
  parseCollection,
  serializeCollection,
  addGameObject,
} from "./collection.js";

export interface InitProjectResult {
  created: boolean;
  projectPath: string;
  filesWritten: string[];
  bobJarFound: boolean;
  warning?: string;
}

/**
 * Build the minimal main.collection contents by reusing the same
 * serializer/helper that collection.ts uses. This guarantees the file
 * round-trips through defold_edit_collection (parseCollection/serializeCollection)
 * without a silent format mismatch.
 */
function buildMainCollection(): string {
  // Start from an empty collection document and add a single root game object
  // that embeds a "script" component pointing at /main/main.script.
  const doc = addGameObject([], {
    id: "main",
    scriptPath: "/main/main.script",
    position: [0, 0, 0],
  });
  return serializeCollection(doc);
}

const LUA_SCRIPT_STUB = `function init(self)
end

function update(self, dt)
end

function on_message(self, message_id, message, sender)
end

function final(self)
end
`;

function buildGameProject(name: string): string {
  return `[project]
title = ${name}
version = 0.1.0

[bootstrap]
main_collection = /main/main.collection

[display]
width = 960
height = 640
`;
}

const GITIGNORE = `build/
.internal/
*.dmengine
`;

/**
 * Scaffold a brand-new, minimal, valid Defold project from scratch.
 *
 * Refuses to overwrite an existing project (one that already contains a
 * game.project at the target path).
 */
export function initProject(opts: {
  name: string;
  targetPath?: string;
}): InitProjectResult {
  const config = getConfig();
  const targetPath = opts.targetPath
    ? path.resolve(opts.targetPath)
    : config.projectRoot;

  const gameProjectPath = path.join(targetPath, "game.project");
  if (fs.existsSync(gameProjectPath)) {
    throw new Error(
      `Project already exists at ${targetPath}. Refusing to overwrite. Use defold_list_project / defold_read_file to inspect it instead.`
    );
  }

  // Ensure the target directory exists.
  fs.mkdirSync(targetPath, { recursive: true });

  // Validate the generated collection round-trips through the project's own
  // parser before writing anything. Fail the call if it doesn't.
  const collectionText = buildMainCollection();
  const reparsed = parseCollection(collectionText);
  if (!reparsed || reparsed.length === 0) {
    throw new Error(
      "Internal error: generated main.collection failed to round-trip through the collection parser."
    );
  }
  // Re-serialize the reparsed doc to confirm stability and use that as the
  // canonical content (idempotent round-trip).
  const canonicalCollection = serializeCollection(reparsed);

  const mainDir = path.join(targetPath, "main");
  fs.mkdirSync(mainDir, { recursive: true });

  const filesToWrite: Array<{ rel: string; abs: string; content: string }> = [
    {
      rel: "game.project",
      abs: gameProjectPath,
      content: buildGameProject(opts.name),
    },
    {
      rel: "main/main.collection",
      abs: path.join(mainDir, "main.collection"),
      content: canonicalCollection,
    },
    {
      rel: "main/main.script",
      abs: path.join(mainDir, "main.script"),
      content: LUA_SCRIPT_STUB,
    },
    {
      rel: ".gitignore",
      abs: path.join(targetPath, ".gitignore"),
      content: GITIGNORE,
    },
  ];

  const filesWritten: string[] = [];
  for (const file of filesToWrite) {
    fs.writeFileSync(file.abs, file.content, "utf8");
    filesWritten.push(file.rel);
  }

  // bob.jar reachability (do not download).
  const bobJar = resolveBobJar(targetPath, /* throwOnMissing */ false);
  const bobJarFound = bobJar !== undefined;

  let warning: string | undefined;
  if (!bobJarFound) {
    warning =
      `bob.jar not found — download it from https://github.com/defold/defold/releases ` +
      `(select a release, download bob/bob.jar) and set the BOB environment variable to its path, ` +
      `or place it at ${path.join(targetPath, ".defold", "bob.jar")}.`;
  }

  return {
    created: true,
    projectPath: targetPath,
    filesWritten,
    bobJarFound,
    warning,
  };
}
