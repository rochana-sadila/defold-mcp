import fs from "node:fs";
import path from "node:path";
import { getConfig, assertInsideRoot } from "../config.js";

export interface WriteScriptResult {
  success: boolean;
  path: string;
  bytesWritten: number;
}

/**
 * Write (or overwrite) a Lua .script file in the Defold project.
 *
 * - path must end in ".script" (rejected otherwise with a clear error).
 * - path is resolved against the configured project root; any path that
 *   escapes the root (e.g. via "../") is rejected using the same
 *   assertInsideRoot check used by defold_read_file.
 * - parent directories are created recursively if missing.
 * - existing files are overwritten (intentional: agents rewrite scripts iteratively).
 */
export function writeScript(
  relativePath: string,
  content: string
): WriteScriptResult {
  const config = getConfig();

  if (!relativePath.endsWith(".script")) {
    throw new Error(
      `defold_write_script requires a path ending in ".script" (got "${relativePath}").`
    );
  }

  const resolved = assertInsideRoot(config.projectRoot, relativePath);

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, "utf8");

  const bytesWritten = Buffer.byteLength(content, "utf8");

  return { success: true, path: resolved, bytesWritten };
}
